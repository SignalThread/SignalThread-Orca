# SignalThread Platform → Pulse launch handoff

**Scope:** Platform side of one-click launch into Pulse (`voice.signalthread.ai`).
Pulse side: `docs/PLATFORM_PULSE_HANDOFF.md` in the Pulse repository.
Architectural reference: the Platform → Orca handoff (`docs/DEPLOYMENT_BOUNDARIES.md` §4d).

## 1. The problem Orca did not have

Orca authenticates against Platform Core's own Supabase Auth project, so the
one-time `hashed_token` Platform mints *is* an Orca credential: Orca exchanges it
with the anon key and the resulting session is the Platform identity.

Pulse owns a **separate** Supabase Auth project (`tsoquobpingfqezolvgp`) and a
separate user table. Handing Pulse a Platform Core token to exchange would give
Pulse a Platform Core session it must never hold, and it still would not answer
the question Pulse actually has: *which canonical user, organization and event
did Platform authorize?*

## 2. The design

```text
app.signalthread.ai
  GET /api/launch/pulse?event_id=<canonical uuid>          Platform session required
    requireUser
    → authorizeProductLaunch(user, "pulse", event)        lib/server/product-launch.ts
        event exists → not ARCHIVED
        → org resolved FROM THE EVENT
        → user has ACTIVE membership in that ACTIVE org   (deriveOrganizationAccess)
        → that org holds an ACTIVE `pulse` entitlement
    → only then mintProductHandoff                         Platform Core magiclink hashed_token
    → 303  https://voice.signalthread.ai/platform-entry?handoff=<token>&event_id=<uuid>
           Referrer-Policy: no-referrer, Cache-Control: no-store

voice.signalthread.ai  GET /platform-entry                  (Pulse, server-side)
    POST https://app.signalthread.ai/api/launch/pulse/claim  { handoff, event_id }

app.signalthread.ai
  POST /api/launch/pulse/claim                              NO Platform session; token is the credential
    1. verifyOtp(token_hash) with a throwaway in-memory ANON client   → proves WHO (one-time, GoTrue)
       revoke that verification session with admin.signOut(local)
    2. recovery_sent_at within HANDOFF_MAX_AGE_SECONDS (default 300) → proves WHEN
    3. authorizeProductLaunch(user, "pulse", event) AGAIN, live       → proves WHAT
    4. 200 { platform_user_id, organization_id, event_id, product: "pulse" }

voice.signalthread.ai
    mapping resolution (User.platformUserId / Account.platformOrganizationId / Event.platformEventId)
    → Event belongs to Account → Pulse's own canUserAccessAccount
    → Pulse Supabase session for the mapped User.id (Pulse service role, server-side, one request)
    → 303 /app/events/<pulse event>?account=<pulse account>
```

### Why this shape

- **Same primitive as Orca, same minting code.** `mintProductHandoff` is unchanged
  apart from delegating the destination URL to the product registry. The token is
  still the Supabase-native, single-use, short-lived `hashed_token`; there is no
  custom JWT, HMAC, or random-token store anywhere.
- **The token proves identity and nothing else.** It carries no organization, no
  event, no product. The context Pulse receives is *re-derived* at claim time by
  the same `authorizeProductLaunch` that gated minting, against live registry
  state. A token therefore cannot be replayed into another organization or event:
  the organization always comes from the event, and the event must pass the full
  launch authorization for the verified user. Knowing canonical ids grants nothing
  without a valid token.
- **Pulse never touches Platform Core.** It holds no Platform Core key (not even
  the anon key), opens no Platform Core session, and reads no Platform table. Its
  entire Platform surface is one HTTPS POST to a Platform API. The throwaway
  verification session exists only inside the claim request and is revoked before
  the response is written.
- **No schema change.** No table in Platform Core, no migration in Pulse. Durable
  state is exactly what GoTrue already keeps for a magiclink (single slot per user,
  cleared on use) plus Pulse's existing mapping columns.
- **Fails closed at every step**, on both sides, with stable reason codes.

### Product registry

`lib/server/product-registry.ts` now records each product's **auth authority**:

| product | authority | how the token is consumed |
|---|---|---|
| `orca` | `platform-core` | product exchanges it at `/auth/callback` with the anon key (unchanged) |
| `pulse` | `own` | product hands it to `POST /api/launch/pulse/claim` |

`buildProductHandoffUrl` builds the browser destination from the *validated* event
only. Adding Registration, Housing or Lead Retrieval is a registry entry; no
authorization or claim code changes.

## 3. Authorization order (proof)

`lib/server/handoff.test.ts` pins, structurally, that `authorizeProductLaunch` is
invoked before `mintProductHandoff` in the launch route, that only `event_id` is
read from the request, and that the mint receives `decision.eventId`, never the raw
parameter. `lib/server/launch-decision.test.ts` asserts each denial of the pure
decision (`decideProductLaunch`) with real inputs; `organization-access.test.ts`
asserts that inactive memberships, inactive organizations and inactive entitlements
never derive access. `handoff-claim.test.ts` pins verify → freshness → authorize →
context in `claimHandoff`, and that a claim for a product the organization lacks,
or an event the user could not launch, is denied.

## 4. Environment (Platform)

| Variable | Exposure | Required |
|---|---|---|
| `PULSE_APP_URL` | server-only | production — `https://voice.signalthread.ai` |
| `NEXT_PUBLIC_PULSE_APP_URL` | client | optional fallback |
| `HANDOFF_MAX_AGE_SECONDS` | server-only | optional, default 300, max 3600 |

Pulse needs `PLATFORM_APP_URL=https://app.signalthread.ai` (server-only) and its
existing `SUPABASE_SERVICE_ROLE_KEY`. Nothing new is required in Supabase for either
project: no redirect allowlist entry, no email template.

## 5. Threat notes

- A leaked handoff URL is a bearer credential for *one* exchange, bounded by GoTrue's
  OTP expiry and by the claim freshness bound. This is the same exposure the Orca
  handoff accepts; both responses carry `Referrer-Policy: no-referrer` and
  `Cache-Control: no-store`, and the browser is moved off the token-bearing URL by
  a 303 before any page renders.
- The magiclink token is a Platform Core credential, so a holder could also
  exchange it directly with Platform Core Auth. That yields a session for the same
  user Platform already authenticated, in the same authority Orca uses; it grants
  no Pulse access, and no Pulse or Orca authorization is bypassed by it.
- Cross-product misuse is bounded by re-derivation: the claim endpoint is
  product-scoped by path and re-checks the entitlement for that product, so a token
  minted for a Pulse launch cannot open a product the organization does not hold,
  and vice versa.
- The single magiclink slot per user means two launches in flight for the same
  user invalidate the earlier token. Same as Orca; the user simply clicks again.
