# Platform → Pulse launch handoff (Pulse side)

Scope: how a SignalThread Platform user who clicks **Open Pulse** on a Platform
event lands, with no second login, inside the mapped Pulse event workspace as the
mapped Pulse user. Builds on the identity mapping layer
(`docs/PLATFORM_IDENTITY_MAPPING.md`) and the access boundaries
(`docs/PULSE_ACCESS_BOUNDARIES.md`). The Platform side is documented in the
monorepo at `docs/PLATFORM_PULSE_HANDOFF.md`.

## 1. The chain

```text
Platform (app.signalthread.ai)
  authenticated Platform user
  → event exists, not ARCHIVED
  → ACTIVE membership in the ACTIVE organization that OWNS the event
  → that organization holds an ACTIVE `pulse` entitlement
  → only then: mint a one-time token           (Platform Core Auth magiclink hashed_token)
  → 303  https://voice.signalthread.ai/platform-entry?handoff=<token>&event_id=<uuid>&state=<correlator>

Pulse  GET /platform-entry                       app/platform-entry/route.ts
  0. browser-bound launch state (§1a). The browser must hold the launch cookie AND the
     `state` Platform relayed back must be that cookie's correlator. Otherwise this
     browser may NOT redeem the token: 303 /platform-entry/start?event_id=…
  1. POST {handoff, event_id} → Platform /api/launch/pulse/claim
       Platform exchanges the token exactly once against Platform Core Auth,
       enforces a freshness bound, RE-RUNS the launch authorization above, and
       answers with canonical {platform_user_id, organization_id, event_id, product}
  2. resolvePulseUserByPlatformUserId            User.platformUserId            (unique)
     resolvePulseAccountByPlatformOrganizationId Account.platformOrganizationId (ambiguity refused)
     resolvePulseEventByPlatformEventId          Event.platformEventId          (unique)
  3. Account.accountType === EVENTS
     Event.location.accountId === Account.id
     Event.location.account.platformOrganizationId === organization_id
  4. canUserAccessAccount(User.id, Account.id)   AccountUserMembership, or SUPER_ADMIN
  5. an existing Pulse session for a DIFFERENT user is never replaced (409 SESSION_CONFLICT)
  6. establish a Pulse Supabase Auth session for User.id (see §3), LAST
  7. 303  /app/events/<Event.id>?account=<Account.slug>   (launch state spent)
```

Steps 2–3 are **resolution**, step 4 is **authorization**. A mapping proves which
local rows the canonical ids name and nothing more; access is decided by the same
`canUserAccessAccount` every organizer route uses.

### 1a. Browser-bound launch state, relayed through Platform

A handoff is a bearer token. Without a browser binding, user A could obtain a valid
handoff for A's own account, send the URL to user B, and B's browser would silently
become A. Redemption is therefore conditional on state that *this browser* established
before the token is accepted, and on Platform relaying that state back
(`lib/platform/launch-state.ts`, `lib/server/launch-state-relay.ts` on Platform):

```text
/platform-entry (no state)          → 303 /platform-entry/start?event_id=X
/platform-entry/start               → set cookie pulse_platform_launch=v1.<nonce>.X.<exp>
                                      → 303 …&armed=1
/platform-entry/start?armed=1       → cookie readable for X?
                                      → 303 {PLATFORM_APP_URL}/api/launch/pulse
                                             ?event_id=X&state=SHA-256(nonce)
                                      else 400 LAUNCH_STATE_REQUIRED (loop guard)
Platform authorizes THIS browser's user, mints a NEW handoff, echoes `state` unchanged
/platform-entry?handoff=…&event_id=X&state=…
                                    → cookie present, unexpired, same event?
                                    → SHA-256(cookie nonce) == relayed state? (constant time)
                                    → redeem, spend state
```

**Two values, deliberately.** The secret `nonce` never leaves the HttpOnly cookie. What
travels through Platform and back in URLs is the correlator `SHA-256(nonce)`. So a leaked
launch URL, a referrer, a proxy log or Platform itself reveals nothing that would let
anyone construct matching browser state; only the browser holding the cookie can satisfy
the check. The comparison is length-checked, shape-checked and constant-time.

**Platform's role is correlation, never authorization.** Platform validates only that the
value is opaque and bounded (`[A-Za-z0-9._~-]{16,256}`), carries it past authorization
untouched, and puts it back on the redirect. It is not passed to `authorizeProductLaunch`,
so no value of it can widen, narrow or redirect authorization; the organization is still
derived from the canonical Event. Platform never stores, compares or logs it. A launch
without a correlator still authorizes and hands off (that is how a click on Platform's own
home page starts); Pulse is what requires one, and bounces such a launch through
`/platform-entry/start` so the browser can bind it.

Properties of the state:

- unpredictable: 256-bit nonce per launch · short-lived: 120 s, enforced from the embedded
  expiry server-side · bound to the launched event, which Platform echoes back after
  re-authorizing it · one-time: cleared on redeem, on every rejection, and on re-arm
- `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS deployments, `Path=/platform-entry`
- only top-level navigations may create or spend it: a request whose `Sec-Fetch-Dest`
  is not `document` (image, iframe, fetch) is refused with `403 NOT_A_NAVIGATION`
- query-string secrecy is never relied on: the secret lives in the cookie only, and a
  valid correlator without the matching cookie opens nothing
- a rejected redemption emits **no** auth cookie and never touches an existing session;
  the entry route additionally refuses to replace a live session belonging to a different
  user (`409 SESSION_CONFLICT`)
- the Platform token guarantees are unchanged: still one-time, still verified only by
  Platform, still bound to the user it was minted for

Threat walk-through. A shared handoff link now carries A's correlator as well as A's
token. B's browser holds no cookie for it, so nothing is redeemed and B is sent to start
their own launch; if B does hold a launch of their own, the correlators differ and the
request is refused (`403 LAUNCH_STATE_MISMATCH`) before anything is claimed. B cannot be
made to hold A's cookie: it is `HttpOnly`, host-scoped to Pulse, and A never sees the
nonce that would let them forge it. The earlier popup-race residual is closed by this
relay — a browser walked through `/start` gets its *own* nonce, and A's token carries A's
correlator, which that browser's cookie will not match.

## 2. What Pulse never does

| Never | Instead |
|---|---|
| hold Platform Core Auth credentials (not even the anon key) or a Platform Core session | hands the token back to Platform over HTTPS; Platform is the only consumer of Platform Core Auth |
| read Platform's database, or let Platform read Pulse's | one HTTPS call, `lib/platform/platform-claim-client.ts`, is the whole runtime surface |
| trust `event_id` (or anything) in the query string | the token is verified by Platform, and the event/organization Pulse acts on are the ones Platform re-derived and returned |
| fall back to email, name, slug, contact address, demo data, or `linkAuthenticatedUser` | every id resolves through its mapping column or the request ends (`PLATFORM_*_NOT_MAPPED`) |
| create an Auth user, mutate `User.id`, or duplicate a Pulse user | the Auth user is looked up **by id**; a session is opened for that identity only |
| put the service-role key anywhere near the browser | `lib/platform/establish-session.ts` runs server-side only; the minted OTP is spent in the same request and never leaves the process |
| share a cookie with Platform | Pulse's own host-scoped Supabase session, exactly as after an email/OTP login |
| touch attendee or kiosk flows | none of `app/api/response/**`, `app/api/answer/**`, `app/api/kiosk/**`, `app/api/tts`, `app/kiosk` import anything from `lib/platform/` (guarded by test) |

## 3. Session establishment (the design point)

Pulse owns Supabase project `tsoquobpingfqezolvgp`. The mapped Pulse user
(`User.id`) is an existing Auth identity in that project. The safest supported way
to open a session for a specific existing Auth user without a password or an inbox
round trip is the same Supabase-native primitive Platform itself uses:

```text
admin.auth.admin.getUserById(User.id)                 identity fixed by id
admin.auth.admin.generateLink({ type: 'magiclink',    service role, server-only
                                email: <that user's own address> })
  → refuse unless link.user.id === User.id             bind to the id, not the address
createRouteHandlerClient(request, response)
  .auth.verifyOtp({ type: 'magiclink', token_hash })  anon key; @supabase/ssr writes
  → refuse unless session.user.id === User.id          the session cookies on the response
```

Why this is the minimum server-side boundary, and why it is safe:

- `generateLink` is the only GoTrue admin operation that yields a one-time
  credential for an existing user without sending mail; there is no "create
  session for user id" admin call.
- Email here is transport for the OTP, not identity: the address is read back from
  Auth for the id already resolved, and both the minted link and the resulting
  session are checked against that id. A mailbox collision, or `generateLink`
  creating a user, can never produce a session for someone else.
- The hashed token exists for one request, on the server; nothing reaches the
  browser except the ordinary Supabase session cookies.
- `SUPABASE_SERVICE_ROLE_KEY` was already a server-only Pulse secret
  (`lib/supabase/admin.ts`); no new credential is introduced.
- The session is opened **last**, after every denial in §1 has had its chance, so a
  refused user never gets a session.

## 4. Failure behaviour (all fail closed, JSON, no redirect to `/login`, no auth cookie on any rejection)

| Condition | Where it fails | Status / reason |
|---|---|---|
| not authenticated on Platform | Platform launch endpoint, before minting | Platform redirects to its sign-in |
| Platform event missing / archived / inactive org / inactive membership / wrong organization / Pulse entitlement missing or inactive | Platform launch endpoint (no token is minted) and again at claim | `403 PLATFORM_DENIED` + `platformReason` (`EVENT_NOT_FOUND` is 404) |
| browser holds no (or expired) launch state | step 0 | `303 /platform-entry/start` — nothing redeemed, no cookies written except fresh state |
| Platform relayed no `state` back | step 0 | `403 LAUNCH_STATE_MISSING` |
| relayed `state` is not this browser's correlator (another browser's launch, tampered, truncated, or the raw nonce) | step 0 | `403 LAUNCH_STATE_MISMATCH` |
| launch state for another event, forged, or a non-navigation request | step 0 | `403 LAUNCH_STATE_MISMATCH` / `403 NOT_A_NAVIGATION` |
| browser refuses cookies | `/platform-entry/start?armed=1` | `400 LAUNCH_STATE_REQUIRED` |
| handoff expired, already consumed, invalid, tampered | Platform claim | `401 HANDOFF_INVALID` / `401 HANDOFF_EXPIRED` |
| Platform stalls (headers or body) beyond 10 s | claim client (one abort budget covers request, body and JSON) | `502 PLATFORM_UNAVAILABLE` |
| browser already signed in to Pulse as a different user | step 5 | `409 SESSION_CONFLICT` (existing session untouched) |
| unexpected exception anywhere (resolver, claim client, session, database) | exception boundary in the route | `500 INTERNAL_ERROR`, sanitized body, same security headers, no cookies |
| Platform unreachable / unusable answer / wrong product | claim client | `502 PLATFORM_UNAVAILABLE` |
| `PLATFORM_APP_URL` unset or not https in production | claim client | `503 PLATFORM_NOT_CONFIGURED` |
| Platform user not mapped / mapped user deactivated | step 2 | `403 PLATFORM_USER_NOT_MAPPED` / `PULSE_USER_INACTIVE` |
| organization not mapped / ambiguous / account inactive | step 2 | `403 PLATFORM_ORGANIZATION_NOT_MAPPED` / `PLATFORM_ORGANIZATION_AMBIGUOUS` / `PULSE_ACCOUNT_INACTIVE` |
| event not mapped / inactive | step 2 | `403 PLATFORM_EVENT_NOT_MAPPED` / `PULSE_EVENT_INACTIVE` |
| mapped account is not an Events account | step 3 | `403 NOT_AN_EVENTS_ACCOUNT` |
| mapped event belongs to another account, or its account maps to another organization | step 3 | `403 EVENT_ACCOUNT_MISMATCH` |
| mapped user lacks Pulse access to the account | step 4 | `403 PULSE_ACCESS_DENIED` |
| Auth identity missing / banned / no email, minting failed, identity mismatch | step 5 | `403 AUTH_IDENTITY_*` / `SESSION_*` |

## 5. Configuration

| Variable | Exposure | Value |
|---|---|---|
| `PLATFORM_APP_URL` | server-only | `https://app.signalthread.ai` (must be https in production) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | already present; used for `getUserById` + `generateLink` |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | client | already present; the anon key spends the OTP |

No schema change. No migration. The mapping columns from phase 1 are the only
durable state, and they are assigned by an operator, never by this flow.

## 6. Files

```text
app/platform-entry/route.ts               the door; state → claim → map → authorize → conflict → session; exception boundary
app/platform-entry/start/route.ts         establishes browser-bound launch state, then sends the browser to Platform launch with its correlator
lib/platform/launch-state.ts              launch-state cookie: create / parse / validate / spend; correlator + constant-time match; navigation check
lib/platform/existing-session.ts          read-only reader of the browser's current Pulse session (never writes)
lib/platform/platform-claim-client.ts     the only Pulse → Platform call; one abort budget for headers + body + JSON
lib/platform/handoff-entry.ts             claim → mapping → consistency → Pulse authorization
lib/platform/establish-session.ts         Pulse Auth session for an already-resolved User.id (Secure on HTTPS)
lib/platform/identity-mapping.ts          (phase 1) resolvers, unchanged
```

Tests: `app/platform-entry/route.test.ts` (route behaviour incl. the P1 regression, the
exception boundary, and source guards), `app/platform-entry/session-cookies.test.ts`
(real `@supabase/ssr` cookies through the route; GoTrue faked at the network edge),
`app/platform-entry/start/route.test.ts`, `lib/platform/launch-state.test.ts`,
`lib/platform/handoff-entry.test.ts`, `lib/platform/platform-claim-client.test.ts`
(incl. stalled-body timeout), `lib/platform/establish-session.test.ts`, and
`tests/integration/platform-handoff-claim-real.test.ts` (replay / tamper / wrong
product / substitution / expiry against the real Platform claim path; env-gated).
