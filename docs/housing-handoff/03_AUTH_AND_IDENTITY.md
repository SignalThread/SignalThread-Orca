# 03 — Auth and Identity

Who authenticates whom, what travels between apps, and the rules that keep it safe.

---

## 1. Two authority models

Every SignalThread product declares **one** of these in Platform's registry:

| Authority | Meaning | Products |
|---|---|---|
| `platform-core` | The product authenticates against **Platform Core Auth**. The session it ends up holding *is* the Platform identity. | Orca |
| `own` | The product runs its **own Supabase Auth project** and must never hold a Platform Core session. | Pulse, Lead Retrieval |

### Housing should be `own`.

Reasons, in order of weight:

1. **Blast radius.** An `own`-authority product never holds a Platform Core credential, so a compromise of Housing cannot yield a Platform Core session.
2. **It is the pattern with two working implementations.** Pulse and Lead Retrieval both do this; Orca's `platform-core` path exists largely because Orca predates the split.
3. **Housing will have non-Platform users.** Hotel contacts, room-block coordinators, and sub-block owners are plausible Housing users who should never exist in Platform Core's identity table. `own` lets Housing issue them identities without polluting the registry.
4. **Independent lifecycle.** Housing can change its own auth (SSO for a hotel chain, service accounts for a rooming-list import) without a Platform Core migration.

Confirm this with Ali, but treat `own` as the default and `platform-core` as the thing needing justification.

---

## 2. The claim contract (`app_metadata.signalthread`)

Platform Core derives an authorization claim onto each user's `app_metadata`. This is how a product knows what an account is entitled to *without querying Platform Core's database*.

```json
{
  "signalthread": {
    "v": 1,
    "access": [
      { "organization_id": "…", "organization_role": "ADMIN",  "products": ["orca", "housing"] },
      { "organization_id": "…", "organization_role": "MEMBER", "products": [] }
    ],
    "platform_admin": false,
    "synced_at": "2026-08-25T12:00:00.000Z"
  }
}
```

Design points that are load-bearing:

- **Org-scoped, not flat.** Two flat arrays (`products[]`, `organizations[]`) cannot express "entitled in org A but not in org B", so a product reading them would have to over-grant or guess.
- **An org with no entitlement still appears**, with an empty `products` array. That distinction is how a product tells *"you are not in this org"* apart from *"your org has not bought this product"* — different answers with different remedies.
- **Event ids are deliberately absent.** They are unbounded and churn constantly. The organization entry is the ceiling; each product validates the specific event against its own data.
- **Derived, never hand-edited.** Built by `buildSignalThreadClaims()` from live registry state (`apps/platform/lib/server/claims.ts`).

**As an `own`-authority product, Housing does not read this claim directly** — it gets the equivalent, freshly re-derived, from the claim endpoint response (file 04). The claim matters to you mainly as background for why the launch response has the shape it does.

---

## 3. Access derivation rules

From `apps/platform/lib/server/organization-access.ts` — the single testable home of the rule:

- Only **`ACTIVE`** memberships count.
- Only memberships of **`ACTIVE`** organizations count.
- Only **`ACTIVE`** entitlements contribute products.
- Product keys are lowercased and sorted.

An `INVITED` or `SUSPENDED` membership, or a membership of a `SUSPENDED` org, yields nothing.

---

## 4. Sessions and cookies

### Cookie contract (every app)

| Property | Value | Why |
|---|---|---|
| `Path` | `/` | |
| `SameSite` | `Lax` | |
| `Domain` | **none — host-only** | A `Domain=.signalthread.ai` cookie was deliberately rejected |
| `Secure` | `true` when the app's own URL is HTTPS | Derived from the app's public URL, not `NODE_ENV`, so a local production build over HTTP still works |
| `HttpOnly` | **`false`** | Required by the current architecture — the Supabase browser client reads the session from `document.cookie` for refresh |
| Lifetime | `@supabase/ssr` default, **400 days** | Unchanged deliberately; shortening needs its own reasoning and tests |

Set and remove use **identical scope**, so sign-out clears exactly what sign-in wrote.

**`HttpOnly: false` is deferred hardening, not an oversight** — and it is the main reason a parent-domain cookie was rejected. A JS-readable credential shared across every subdomain would turn one XSS anywhere under the apex into a session valid everywhere. Host-only cookies contain the damage to one product.

Housing must follow this contract exactly. Do **not** introduce a parent-domain cookie "to make SSO simpler". SSO is already solved by the handoff; a shared cookie would undo the containment.

### Cross-subdomain SSO, without a shared cookie

One sign-in at `app.signalthread.ai` opens `housing.signalthread.ai` with no second interactive sign-in, because Platform mints a **single-use, short-lived auth handoff** and Housing exchanges it for a session *in its own auth project*. Full protocol in file 04.

---

## 5. The handoff primitive

`auth.admin.generateLink({ type: "magiclink" })` returns a `hashed_token`:

- **single-use** — a replayed token is rejected (verified live)
- **short-lived** — GoTrue OTP expiry, plus a tighter freshness bound enforced at claim time
- **Supabase-native** — no custom JWT signing, no hand-rolled crypto
- **scoped to one user**, resolved server-side from the verified session
- **carries no password and no service-role credential** to the product

The generated `action_link` is **discarded**. Only the token travels, and Platform builds the destination URL itself — which is why Supabase's redirect allowlist is *not* involved in the handoff and why no caller can choose where a freshly minted credential lands.

Housing uses the same primitive internally to open a session for a mapped local user without a password or an email round trip: `admin.getUserById(id)` → `admin.generateLink()` → `verifyOtp(token_hash)` with the **anon** key on a request-scoped SSR client. See `apps/lead-retrieval/lib/platform/establish-session.ts`, which documents why this is safe:

- the Auth user is looked up **by id** first; the address is that user's own, read back from Auth, never supplied by a caller;
- `generateLink` reports which user it minted for, and the function refuses to continue unless that id matches;
- the established session's user id is checked **again** after `verifyOtp`.

> *Email is transport for the OTP, not identity.* Copy that discipline verbatim.

---

## 6. Invariants — each one is asserted by a test somewhere

- ❌ No `Domain=.signalthread.ai` cookie
- ❌ No Platform Core service-role key in a product app
- ❌ No Platform Core Postgres query from a product app
- ❌ No cross-database foreign key
- ❌ No custom JWT or hand-rolled crypto
- ❌ **No authorization carried in the handoff** — the event id is a navigation hint the product re-validates

---

## 7. A failure mode worth remembering

`next.config.ts` `headers()` entries are applied **after** route handlers. A global `Referrer-Policy` silently overrode the `no-referrer` explicitly set on handoff responses — while a one-time token sat in the query string. Narrower per-path entries now exist for `/api/launch/:path*` and `/auth/callback`, and regression tests pin both the entries **and their ordering**.

If Housing sets security headers globally in `next.config.ts`, check they do not override what your `/platform-entry` route sets. Assume they do until you have proved otherwise.

---

## 8. What Housing must never do

| Never | Because |
|---|---|
| Hold a Platform Core service-role key | It would make a Housing compromise a Platform Core compromise |
| Query Platform Core's Postgres | It breaks the failure-domain rule and bypasses the audited contract |
| Trust `event_id` from a URL as authorization | It is a navigation hint; anyone can edit it |
| Map a Platform identity to a local user by **email**, name, slug or domain | An attacker-controlled or coincidental attribute would become authority. Map only by the explicit mapping columns (file 06 §2) |
| Re-point an existing mapping automatically | Silent re-pointing merges two identities. Refuse and surface it |
| Accept a handoff without browser binding | Without it, a leaked launch URL is a login-CSRF / session-replacement vector (file 04 §5) |
