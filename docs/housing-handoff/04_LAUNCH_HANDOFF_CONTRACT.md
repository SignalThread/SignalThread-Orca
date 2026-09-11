# 04 — The Launch Handoff Contract

**This is the one contract Housing must implement.** Everything else about Housing is Housing's own business.

Reference implementations: `apps/lead-retrieval/lib/platform/` (newest, best documented) and `apps/pulse/lib/platform/`.
Reference docs: `apps/lead-retrieval/docs/PLATFORM_LEAD_RETRIEVAL_HANDOFF.md`, `docs/PLATFORM_PULSE_HANDOFF.md`.

---

## 1. The chain, end to end

This is a **real, verified** 7-hop trace of a Lead Retrieval launch (2026-09-09, local). Housing's will be identical with `housing` substituted.

```
hop 1  303  :3001/api/launch/housing?event_id=<platform event uuid>
hop 2  303  :3004/platform-entry?handoff=<one-time token>&event_id=…
hop 3  303  :3004/platform-entry/start?event_id=…
hop 4  303  :3004/platform-entry/start?event_id=…&armed=1
hop 5  303  :3001/api/launch/housing?event_id=…&state=<correlator>
hop 6  303  :3004/platform-entry?handoff=<NEW token>&event_id=…&state=<correlator>
hop 7  200  :3004/<housing workspace>?eventId=<housing-local event id>
```

Why seven hops and not two: hops 3–5 are the **browser binding**. The first handoff (hop 2) arrives with no proof that *this* browser started the launch, so Housing discards it, establishes browser state, and restarts the launch carrying a correlator. Platform mints a **new** token and echoes the correlator back. Only then is a handoff redeemed. See §5.

---

## 2. Platform side — what you add (3 small edits)

All in `apps/platform`. This is the entirety of the Platform-side work; `authorizeProductLaunch` is product-agnostic and has a test that **fails if product-specific logic appears in it**.

### 2a. `lib/server/product-registry.ts` — where Housing lives

```ts
const PRODUCT_APP_URL_ENV: Record<string, readonly string[]> = {
  orca: ["ORCA_APP_URL", "NEXT_PUBLIC_ORCA_APP_URL"],
  pulse: ["PULSE_APP_URL", "NEXT_PUBLIC_PULSE_APP_URL"],
  "lead-retrieval": ["LEAD_RETRIEVAL_APP_URL", "NEXT_PUBLIC_LEAD_RETRIEVAL_APP_URL"],
  housing: ["HOUSING_APP_URL", "NEXT_PUBLIC_HOUSING_APP_URL"],   // ← add
};
```

Server-only name first, deliberately: a product base URL is only needed server-side, and `NEXT_PUBLIC_*` values are statically inlined at compile time, which makes them awkward to vary per environment. The public name stays as a fallback.

### 2b. `lib/server/product-registry.ts` — Housing's auth authority

```ts
const PRODUCT_AUTH_AUTHORITY: Record<string, ProductAuthAuthority> = {
  orca: "platform-core",
  pulse: "own",
  "lead-retrieval": "own",
  housing: "own",                                                 // ← add
};
```

### 2c. `lib/server/product-registry.ts` — the return path

```ts
export function buildProductReturnPath(productKey: string, eventId: string): string {
  if (productKey === "orca" || productKey === "pulse" ||
      productKey === "lead-retrieval" || productKey === "housing") {   // ← add
    return `/platform-entry?event_id=${encodeURIComponent(eventId)}`;
  }
  return "/";
}
```

*(Strictly, `own`-authority products always land on `/platform-entry` via `buildProductHandoffUrl`, so this branch matters for the `platform-core` path. Add it anyway for consistency and because the existing tests assert the registry shape.)*

That's it on the Platform side. **No new authorization or handoff code.**

---

## 3. Authorization — runs before a token exists

`authorizeProductLaunch({ userId, productKey, eventId })` in `apps/platform/lib/server/product-launch.ts`.

**The order is the security property.** A handoff is a bearer credential for a real session, so issuing one to an unauthorized user would make the launcher an entitlement bypass. Authorization runs to completion *before* a handoff exists.

The decision itself is a pure function, `decideProductLaunch` in `lib/server/launch-decision.ts`:

```
1. event row looked up by id            → null?            DENY  EVENT_NOT_FOUND
2. event.status === "ARCHIVED"          →                  DENY  EVENT_NOT_LAUNCHABLE
3. find user's derived access entry for event.organization_id
                                        → absent?          DENY  ORG_NOT_MEMBER
4. entry.products includes productKey   → absent?          DENY  PRODUCT_NOT_ENTITLED
   otherwise                                               AUTHORIZED
```

Note what is **not** consulted: anything client-supplied except the event id used for the lookup. The organization comes from the event row; the membership from derived access; the entitlement from that organization's product list. **A caller-supplied `organization_id` has no way in** — the launch route does not honour `organization_id`, `product` or `return_to` from the request at all.

Also note: `event_memberships` is **not** checked. Launch authorization is org-membership + entitlement. Per-event and per-role gating is the product's job.

| Denial | Hint shown |
|---|---|
| `NOT_AUTHENTICATED` | Sign in to SignalThread before opening a product. |
| `EVENT_NOT_FOUND` | That event does not exist. |
| `ORG_NOT_MEMBER` | This account is not a member of the organization that owns that event. |
| `PRODUCT_NOT_ENTITLED` | That organization is not entitled to this product. |
| `EVENT_NOT_LAUNCHABLE` | That event is archived and cannot be opened. |

---

## 4. The claim endpoint — how Housing gets canonical context

```http
POST {PLATFORM_APP_URL}/api/launch/housing/claim
Content-Type: application/json

{ "handoff": "<one-time token>", "event_id": "<canonical uuid>" }
```

**Server-to-server**, called by Housing after the browser arrives at `/platform-entry` with the token. Housing never touches Platform Core Auth and never receives a Platform Core session. Authentication for this endpoint *is* the token.

What Platform does:
1. Exchanges the token **exactly once**, with a throwaway anon client; the resulting session is revoked immediately.
2. Enforces a freshness bound (`HANDOFF_MAX_AGE_SECONDS`, default **300s**).
3. **Re-runs `authorizeProductLaunch`** against live registry state — so the context is never stale and never inherited from whenever the token was minted.
4. Returns only canonical context.

**200 response:**

```json
{
  "platform_user_id": "<uuid>",
  "organization_id":  "<uuid>",
  "event_id":         "<uuid>",
  "product":          "housing"
}
```

**Denials** (`{ "error": "...", "reason": "..." }`):

| `reason` | Meaning |
|---|---|
| `INVALID_REQUEST` | Malformed body or unknown product (400) |
| `HANDOFF_INVALID` | Token not valid, already spent, or replayed |
| `HANDOFF_EXPIRED` | Outside the freshness bound |
| `NOT_AUTHENTICATED` | Token did not resolve to a user |
| `EVENT_NOT_FOUND` / `EVENT_NOT_LAUNCHABLE` / `ORG_NOT_MEMBER` / `PRODUCT_NOT_ENTITLED` | Re-run authorization denied |

Headers on every response: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.

**Validate the response before trusting it.** Pulse's client checks that `product` equals its own key and that `platform_user_id` is a UUID (not, say, an email) — a product that skips this would accept a response meant for a different product. Copy `apps/lead-retrieval/lib/platform/platform-claim-client.ts`.

---

## 5. Browser binding — the part people skip and regret

**The threat:** a Platform handoff is a bearer token. Whoever redeems it gets a Housing session for the user it was minted for. Without a browser binding this is a **login-CSRF / session-replacement** vector: user A obtains a valid handoff for A's own account, sends the URL to user B, and B's browser silently becomes A.

**The mechanism** (from `apps/lead-retrieval/lib/platform/launch-state.ts`):

```
/platform-entry (no state)         → 303 /platform-entry/start?event_id=…
/platform-entry/start              → set state cookie; 303 …&armed=1
/platform-entry/start?armed=1      → cookie readable; 303 Platform launch ?…&state=<correlator>
Platform authorizes, mints a NEW handoff, echoes the correlator back unchanged
/platform-entry (state + handoff)  → correlator must match this browser's cookie, then redeem
```

**Two values, deliberately:**
- the **secret** (`nonce`, 256-bit) never leaves the HttpOnly cookie
- what travels through Platform and back in URLs is the **correlator**, `SHA-256(nonce)`

A leaked launch URL therefore reveals nothing that would let anyone construct matching browser state — and Platform, which only ever sees the correlator, could not forge one either.

**Properties to reproduce:** 256-bit nonce per launch · 120-second server-enforced lifetime from an embedded expiry · bound to the event the browser launched · one-time (cleared on every terminal response) · `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS · scoped to `/platform-entry` · only top-level navigations may create or spend it · compared with `timingSafeEqual`.

**It carries no authority.** The handoff still has to be verified by Platform, mapped, and authorized by Housing.

Platform's side of this is pure relay — `lib/server/launch-state-relay.ts` treats the correlator as an opaque value, never interprets it, never stores it, never logs it, and deliberately does **not** pass it to `authorizeProductLaunch`, so no value of it can widen, narrow or redirect authorization.

---

## 6. Decision order inside `/platform-entry`

From `apps/lead-retrieval/lib/platform/platform-entry-core.ts`. Follow this order; each step fails closed.

```
1. Shape + browser binding      — before anything is spent or contacted
2. Claim the handoff at Platform — one network call, token spent exactly once
3. Map canonical ids → local rows
4. Apply Housing's own authorization
5. Never replace another user's live session behind their back
6. Establish session LAST, on the very response that redirects into the workspace
```

Steps 5 and 6 are easy to get wrong:

- **Step 5:** if a *different* Housing user already has a live session in this browser, do not silently swap them. Lead Retrieval returns `SESSION_CONFLICT`.
- **Step 6:** the session cookie is attached to the same 303 that lands the user in the workspace. Do not create a session and then decide whether to allow the launch.

Failure codes observed in the Lead Retrieval implementation: `INVALID_REQUEST`, `LAUNCH_STATE_REQUIRED`, `LAUNCH_STATE_MISSING`, `LAUNCH_STATE_MISMATCH`, `NOT_A_NAVIGATION`, `PLATFORM_NOT_CONFIGURED`, `SESSION_CONFLICT`, plus the mapping and session-establishment codes in file 06 §3.

Every failure returns a sanitized JSON body — `{ success: false, error, reason, hint }` — with the same security headers and **no cookies at all**. There is also an exception boundary in the route handler: an unexpected throw becomes a deliberate `500 INTERNAL_ERROR`, never a framework error page.

---

## 7. Structure it so the rules are testable

Both reference products split this the same way, and it is why their rules are asserted without a database:

| File | Contains | Depends on I/O? |
|---|---|---|
| `platform-entry-core.ts` | the decision order and every rule | **no** — deps injected |
| `platform-entry-server.ts` | wires the real claim client, loaders, authorizer, session minter | yes |
| `app/platform-entry/route.ts` | thin handler + exception boundary | yes |
| `identity-mapping.ts` | pure mapping rules | **no** |
| `identity-mapping-supabase.ts` | real service-role loaders | yes |
| `launch-state.ts` | nonce/correlator/cookie mechanics | **no** (crypto only) |
| `platform-claim-client.ts` | the HTTP call + response validation | yes |
| `establish-session.ts` | pure orchestration of session minting | **no** — deps injected |

Copy this split. It is the difference between "we tested the happy path" and "every denial branch is asserted".

---

## 8. Environment variables

**Platform side** (`apps/platform`, set in its Vercel project):

| Variable | Exposure | Value |
|---|---|---|
| `HOUSING_APP_URL` | **server-only** | `https://housing.signalthread.ai` (prod) / `http://localhost:3004` (local) |
| `NEXT_PUBLIC_HOUSING_APP_URL` | client | optional fallback only |

**Housing side** (`apps/housing`):

| Variable | Exposure | Purpose |
|---|---|---|
| `PLATFORM_APP_URL` | **server-only** | where to POST the claim |
| `NEXT_PUBLIC_SUPABASE_URL` | client | Housing's **own** Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Housing's own anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Housing's own service role — **never** Platform Core's |
| `NEXT_PUBLIC_SITE_URL` | client | Housing's own origin; drives `Secure` on cookies |

Full local values and gotchas: file 07.
