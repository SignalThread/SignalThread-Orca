# SignalThread Platform → Lead Retrieval launch handoff

Status: **implemented and proven live locally** (Step 4A code, Step 4B1 happy path,
Step 4B2 negative/security matrix; see §10). Production environment wiring, real mapping
rows and the legacy-data decision remain separate steps.

Lead Retrieval (LR) is an **own-authority** product: it runs its own Supabase Auth
project (`signalthread-lead-retrieval`, ref `wsbdyemyzixkyvuiyesm`) and must never hold,
trust or exchange a Platform Core session. Platform launches LR with the same
launch/claim architecture Pulse uses; nothing about the protocol is new. This document
is the LR side of that contract.

## 1. The chain

```
Platform  GET /api/launch/lead-retrieval?event_id=<canonical>&state=<correlator>
          authorizeProductLaunch (org derived from the event, entitlement, membership)
          mint one-time handoff  (auth.admin.generateLink magiclink → hashed_token only)
          303  {LEAD_RETRIEVAL_APP_URL}/platform-entry?handoff=<token>&event_id=<canonical>&state=<correlator>

LR        GET /platform-entry
          1. shape        handoff present, event_id is a canonical uuid, top-level navigation
          2. browser bind launch-state cookie present and for this event; relayed state == SHA-256(cookie nonce)
          3. claim        POST {PLATFORM_APP_URL}/api/launch/lead-retrieval/claim {handoff, event_id}
                          → { platform_user_id, organization_id, event_id, product: "lead-retrieval" }
          4. map          users.platform_user_id · events.platform_event_id · companies.platform_organization_id
          5. authorize    LR's own rules for the mapped user and mapped event
          6. no clobber   an existing LR session for a *different* user is refused (409)
          7. session      LR Auth session for the mapped user, on the redirect response only
          303  /admin/events/<lrEventId> | /app/organizer?eventId=<lrEventId> | /exhibitor/dashboard?eventId=<lrEventId>
```

Steps 1–2 protect the browser (login CSRF / session replacement). Step 3 proves the
token with Platform, which re-derives the canonical context from live registry state
rather than trusting anything carried in the token or the URL. Steps 4–5 are LR's
own: mapping says which LR rows are meant, authorization says whether the mapped user
may open the mapped event. Only after all of that does a session exist.

If the browser arrives at `/platform-entry` with **no** launch state (a bookmarked or
forwarded URL), LR does not redeem the handoff; it sends the browser to
`/platform-entry/start?event_id=…`, which arms browser state and starts a launch of its
own through Platform — so the launch is authorized for *this browser's* Platform user.

## 2. Mapping fields (the only ones)

| Platform canonical id | LR column | Cardinality | Failure |
|---|---|---|---|
| `platform_user_id` | `users.platform_user_id` | unique (partial index) | `USER_MAPPING_NOT_FOUND` |
| `event_id` | `events.platform_event_id` | unique | `EVENT_MAPPING_NOT_FOUND` |
| `organization_id` | `companies.platform_organization_id` | **non-unique** | `ORGANIZATION_MAPPING_NOT_FOUND` |

There is no fallback of any kind. Not email, not user name, not event name, not company
name, not slug, not "the first matching row". A value that resembles a local attribute
is never authority; a non-uuid never reaches a query. Mappings are never created,
repaired or inferred by the handoff — a missing mapping is a refusal that an
administrator resolves explicitly (Step 4B tooling).

### Organization ambiguity rule

One Platform organization may own several LR companies (an organizer that also
exhibits, sister companies, historical splits), so `companies.platform_organization_id`
alone never resolves. The mapped **event** narrows it, then the mapped **user**:

1. candidates = companies with `platform_organization_id = organization_id`
   → none: `ORGANIZATION_MAPPING_NOT_FOUND`
2. keep candidates related to the mapped event: `events.company_id` (owner) ∪
   `exhibitors.company_id` at the event
   → none: `EVENT_ORGANIZATION_MISMATCH`
   → exactly one: **PASS**
3. still several: keep the mapped user's own `users.company_id` if it is a candidate → **PASS**
4. otherwise the user's `event_users.exhibitor_company_id` memberships at the event
   (active/invited) intersected with the candidates
   → exactly one: **PASS**
   → none or several: `AMBIGUOUS_ORGANIZATION_MAPPING`

Nothing is ever chosen by position, and a membership at a company that is not a
candidate cannot widen the set. Ambiguity is a refusal with its own code so an
administrator can see *why*, not a guess.

### Synthetic containers

`events.container_kind = 'continuous_capture'` rows are LR-internal capture buckets, not
events. The schema forbids mapping them (`events_platform_event_id_container_kind_check`),
and the application refuses independently with `EVENT_NOT_LAUNCHABLE_CONTAINER` should a
row ever slip through.

## 3. Authorization (mapping is not authorization)

The mapped LR user is authorized with LR's canonical resolver,
`resolveAccessibleEventIdsForUser`, exactly as every LR page and API does:

| LR role (`users.role`, normalized) | Rule | Landing |
|---|---|---|
| `platform_admin` | LR's platform-wide role; admitted | `/admin/events/<lrEventId>` |
| `organizer_admin` (`event_organizer` / `organizer` normalize to it) | mapped event must be in the organizer scope | `/app/organizer?eventId=<lrEventId>` |
| `exhibitor_admin`, `exhibitor_viewer` | mapped event must be in the accessible set (license + `event_access_mode` + `event_users`) | `/exhibitor/dashboard?eventId=<lrEventId>` |
| anything else | `LR_ROLE_NOT_LAUNCHABLE` | — |

A mapped user outside their accessible set is `LR_ACCESS_DENIED`. No permission model
was added; no existing check was weakened. The landing pages re-validate the `eventId`
they are given (they always did), so a launch cannot land somewhere the user could not
otherwise navigate to.

For exhibitor roles the launch also sets `leadintel_exhibitor_app_active_event_id`
with the same attributes the in-app switcher writes (client-readable, `Path=/`,
`SameSite=Lax`, one year), so subsequent navigation stays inside the launched event.
Every reader validates that cookie against the user's accessible set; it grants nothing.

## 4. Session (LR is the authority)

The session is opened in LR's **own** Auth project for the **mapped** LR user by id:

```
admin.auth.admin.getUserById(lrUserId)            identity fixed by id; address read back from Auth
admin.auth.admin.generateLink({type:"magiclink"})  → hashed_token; refused unless minted for lrUserId
supabase(request-scoped SSR).auth.verifyOtp({type:"magiclink", token_hash})
                                                  → session; refused unless session.user.id === lrUserId
withAuthCookies(redirect)                         the SSR client's Set-Cookie on the 303 only
```

The same primitive LR already uses for its passwordless server-side sign-ins, and the
one Platform itself uses to mint the handoff. **No email is sent** (the link is never
delivered; only its hashed token is exchanged server-side), no interactive OTP, no
service-role material reaches the browser, no caller supplies the LR user id (it is the
mapping's output), no custom or fake session (the cookies are exactly what a normal
login writes, so middleware and every page treat it as an ordinary LR session), and LR
middleware is not bypassed — only `/platform-entry` and `/platform-entry/start` are
public, and they authenticate the request themselves.

Refusals never emit an auth cookie and never touch an existing session. An existing LR
session for a different user is never replaced silently (`409 SESSION_CONFLICT`: sign
out of LR, then launch again).

## 5. Browser binding (login-CSRF closure)

A handoff is a bearer token. Redemption is therefore conditional on state *this browser*
created before the token existed: a 256-bit nonce in an HttpOnly, `SameSite=Lax`,
`Path=/platform-entry` cookie (`lr_platform_launch`, 120 s, bound to the event), of which
only `SHA-256(nonce)` travels as `state` to Platform and back. `/platform-entry` refuses
(and spends the state) when the relayed correlator does not match its own cookie, in
constant time. Only top-level navigations (`Sec-Fetch-Dest: document`, or the header
absent) may create or spend state. The state carries no authority: the token is still
verified by Platform, mapped and authorized by LR.

## 6. Environment (names only — no values in the repository)

| App | Variable | Meaning |
|---|---|---|
| Platform | `LEAD_RETRIEVAL_APP_URL` (server-only; `NEXT_PUBLIC_LEAD_RETRIEVAL_APP_URL` fallback per the existing convention) | LR base URL, e.g. `https://lr.signalthread.ai`; the handoff redirect target |
| Lead Retrieval | `PLATFORM_APP_URL` (server-only) | Platform base URL, e.g. `https://platform.signalthread.ai`; HTTPS required in production; no `NEXT_PUBLIC_` variant is honoured |
| Lead Retrieval | `NEXT_PUBLIC_SITE_URL` (existing) | drives `Secure` on the launch-state cookie (HTTPS → Secure; production fallback) |
| Lead Retrieval | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (existing) | LR's own Auth project — the session authority |

Unset `PLATFORM_APP_URL` disables Platform launch (`503 PLATFORM_NOT_CONFIGURED`); OTP
login is unaffected. Local development: LR on `3003` (or `3013` when `3003` is taken)
and Platform on `3001` may use plain HTTP.

## 7. Failure modes (all fail closed, JSON `{success:false, error, reason, hint[, platformReason]}`)

| Reason | Status | Where |
|---|---|---|
| `INVALID_REQUEST` | 400 | missing handoff / non-canonical `event_id` |
| `NOT_A_NAVIGATION` | 403 | `Sec-Fetch-Dest` says subresource |
| (redirect to `/platform-entry/start`) | 303 | no or expired launch state — start a launch for this browser |
| `LAUNCH_STATE_MISSING`, `LAUNCH_STATE_MISMATCH` | 403 | relayed correlator absent / not this browser's |
| `LAUNCH_STATE_REQUIRED` | 400 | `/start?armed=1` but cookies are blocked |
| `PLATFORM_NOT_CONFIGURED` | 503 | `PLATFORM_APP_URL` unset or unsafe |
| `HANDOFF_INVALID`, `HANDOFF_EXPIRED` | 401 | Platform refused the token (malformed, used, stale) |
| `PLATFORM_DENIED` (+ `platformReason`) | 403 | Platform re-ran authorization and denied |
| `PLATFORM_UNAVAILABLE` | 502 | Platform unreachable / unusable answer |
| `USER_MAPPING_NOT_FOUND`, `EVENT_MAPPING_NOT_FOUND`, `ORGANIZATION_MAPPING_NOT_FOUND` | 403 | no LR row for the canonical id |
| `EVENT_NOT_LAUNCHABLE_CONTAINER` | 403 | mapped row is not an event container |
| `EVENT_ORGANIZATION_MISMATCH`, `AMBIGUOUS_ORGANIZATION_MAPPING` | 403 | organization rule above |
| `LR_ROLE_NOT_LAUNCHABLE`, `LR_ACCESS_DENIED` | 403 | LR authorization |
| `SESSION_CONFLICT` | 409 | another LR user is signed in here |
| `AUTH_IDENTITY_MISSING/BANNED/NO_EMAIL`, `SESSION_MINT_FAILED`, `SESSION_IDENTITY_MISMATCH`, `SESSION_ESTABLISH_FAILED` | 403 | session could not be opened for the mapped user |
| `INTERNAL_ERROR` | 500 | exception boundary; sanitized, no cookies |

Every response on the path carries `Referrer-Policy: no-referrer` and
`Cache-Control: no-store`. Nothing on the path is logged.

## 8. Code map

| Concern | File |
|---|---|
| entry paths (public in middleware) | `lib/platform/paths.ts`, `lib/supabase/middleware.ts` |
| browser-bound launch state | `lib/platform/launch-state.ts` |
| Platform claim client (only runtime call to Platform) | `lib/platform/platform-claim-client.ts` |
| canonical id validation | `lib/platform/platform-ids.ts` |
| mapping rules (pure) / loaders | `lib/platform/identity-mapping.ts`, `lib/platform/identity-mapping-supabase.ts` |
| LR authorization + landing | `lib/platform/lr-authorization.ts` |
| entry decision (claim → map → authorize) | `lib/platform/handoff-entry.ts` |
| session establishment (pure) / existing-session reader | `lib/platform/establish-session.ts`, `lib/platform/existing-session.ts` |
| request handlers (pure, deps injected) / wiring | `lib/platform/platform-entry-core.ts`, `lib/platform/platform-entry-server.ts` |
| routes | `app/platform-entry/route.ts`, `app/platform-entry/start/route.ts` |
| tests | `tests/platform-handoff-*.test.ts`, `tests/platform-entry-route.test.ts` |

Platform side: `apps/platform/lib/server/product-registry.ts` only (URL env names,
authority `own`, return path). Generic launch, claim and authorization code contains no
Lead Retrieval conditional — asserted by `apps/platform/lib/server/handoff.test.ts`.

## 9. Live proof record

All proofs ran against Platform (`apps/platform`, dev on `localhost:3001`, Platform Core
`wtbnpeluwhjjqccdofxd`) and Lead Retrieval (dev on `localhost:3013`, NEW project
`wsbdyemyzixkyvuiyesm`) from the consolidation worktree, with temporary fixtures that
existed only in the NEW project and were deleted afterwards. Old LR production
(`imkrdrscrikxqywdcmzy`) was never contacted. No token, cookie or secret is recorded here.

### 9.1 Step 4B1 — happy path (2026-09-08)

Prerequisite: Acme Events (`7437a82f-…`) holds an ACTIVE `lead-retrieval` entitlement in
Platform Core (granted 2026-09-08). Fixture: one LR auth user + `users` row
(`exhibitor_admin`, `all_company_events`, `platform_user_id` = Platform user), one company
(`platform_organization_id` = Platform org), one event owned by that company
(`platform_event_id` = Platform event, `container_kind = event`), one active company-scoped
license, one `exhibitors` row.

| Hop | Request | Result |
|---|---|---|
| 1 | Platform `GET /api/launch/lead-retrieval?event_id=…` (Platform session) | 303 → LR `/platform-entry?handoff=…&event_id=…` |
| 2 | LR `/platform-entry` with no browser state | 303 → `/platform-entry/start?event_id=…` (handoff **not** redeemed) |
| 3 | LR `/platform-entry/start` | 303 → `…&armed=1`, sets `lr_platform_launch` (HttpOnly, `Path=/platform-entry`, 120 s) |
| 4 | LR `/platform-entry/start?armed=1` | 303 → Platform launch `…&state=<SHA-256(nonce)>` |
| 5 | Platform launch with `state` | 303 → LR `/platform-entry?handoff=<new>&event_id=…&state=<same>` |
| 6 | LR `/platform-entry` (state + handoff) | 303 → `/exhibitor/dashboard?eventId=<lrEventId>`; clears launch state, sets `leadintel_exhibitor_app_active_event_id`, sets the LR session cookie |
| 7 | LR `/exhibitor/dashboard?eventId=<lrEventId>` | **200**, event page rendered, no login, no picker |

Session: JWT `iss = https://wsbdyemyzixkyvuiyesm.supabase.co/auth/v1`, `sub` = the mapped
LR user (not the Platform user); a matching `auth.sessions` row existed in the NEW project;
`auth.one_time_tokens` was 0 afterwards (hash consumed server-side, nothing mailed). A
follow-up `GET /exhibitor/dashboard` without `eventId` stayed on the launched event. The
same chain was repeated in a real Chromium tab with identical result. Fixtures and the auth
user were then deleted: 0 auth users, 0 sessions, 0 refresh tokens, 0 public rows.

### 9.2 Step 4B2 — negative / security matrix (2026-09-08)

Each case used its own fixture in the NEW project, exercised the real Platform launch and
LR entry routes with a browser-like cookie jar, and was cleaned up afterwards. "Session" =
any LR auth cookie issued or `auth.sessions` row created.

| # | Case | Fixture shape | Expected | Actual | Session |
|---|---|---|---|---|---|
| 1 | Missing user mapping | mapped company + event; LR user carrying the Platform user's **own email** but no `platform_user_id` | `USER_MAPPING_NOT_FOUND` | 403 `USER_MAPPING_NOT_FOUND` | none |
| 2 | Missing event mapping | mapped user + company; LR event named exactly like the Platform event, `platform_event_id` NULL | `EVENT_MAPPING_NOT_FOUND` | 403 `EVENT_MAPPING_NOT_FOUND` | none |
| 3 | Event / organization mismatch | mapped user (company C1, mapped); mapped event owned by unmapped C2, C1 unrelated to it | `EVENT_ORGANIZATION_MISMATCH` | 403 `EVENT_ORGANIZATION_MISMATCH` | none |
| 4 | LR access denied | all three mappings resolve; user has no license and no `event_users` | `LR_ACCESS_DENIED` | 403 `LR_ACCESS_DENIED` | none |
| 5 | Ambiguous organization | C1 and C2 both mapped to the org; event owned by C1, C2 exhibits; user belongs to unmapped C3 | `AMBIGUOUS_ORGANIZATION_MAPPING`, unchanged after reordering rows | 403 both times | none |
| 6 | Synthetic event | `continuous_capture` row; insert and update of `platform_event_id` | DB refuses; launch cannot reach it | both writes refused by `events_platform_event_id_container_kind_check`; launch 403 `EVENT_MAPPING_NOT_FOUND`; app-layer `EVENT_NOT_LAUNCHABLE_CONTAINER` asserted by unit tests | none |
| 7 | Handoff replay | full happy fixture; redeem once, replay the same URL with a copy of the valid state cookie; also replay the claim directly | second use refused | first 303 → workspace; replay 401 `HANDOFF_INVALID`; direct `POST /api/launch/lead-retrieval/claim` replay 401 | none on replay |
| 8 | Launch state | fresh handoff per sub-case | restart or 403; handoff untouched | see below | none |

Case 8 sub-cases, each followed by a direct claim of the same handoff to prove LR had **not**
redeemed it before state validation (200 = still valid, i.e. untouched):

| Sub-case | LR response | Handoff afterwards |
|---|---|---|
| no state cookie | 303 → `/platform-entry/start?event_id=…` | still claimable |
| another browser's correlator | 403 `LAUNCH_STATE_MISMATCH` | still claimable |
| state created for a different event | 403 `LAUNCH_STATE_MISMATCH` | still claimable |
| cookie present, `state` missing from URL | 403 `LAUNCH_STATE_MISSING` | still claimable |
| expired state | 303 → `/platform-entry/start?event_id=…` | still claimable |
| subresource fetch (`Sec-Fetch-Dest: image`) | 403 `NOT_A_NAVIGATION`, no cookies at all | still claimable |

Invariants checked in the same run: a browser holding only the Platform Core session cookie
is redirected to `/login` by LR (`/exhibitor/dashboard`, `/admin`); across all 139 responses
seen (bodies and headers) no service-role key, DB password or old-LR project ref appeared;
every denial carried only the spent `lr_platform_launch` cookie (or none); `auth.sessions`
in the NEW project stayed at 0 for every denial case. A happy-path run in the same harness
passed again (7 hops, 200, LR-issued session). Bugs found: none; no code changed in 4B2.

### 9.3 Denial / error codes (browser-facing JSON `{success:false, error, reason, hint[, platformReason]}`)

`INVALID_REQUEST` 400 · `NOT_A_NAVIGATION` 403 · `LAUNCH_STATE_MISSING` / `LAUNCH_STATE_MISMATCH`
403 · `LAUNCH_STATE_REQUIRED` 400 · `PLATFORM_NOT_CONFIGURED` 503 · `HANDOFF_INVALID` /
`HANDOFF_EXPIRED` 401 · `PLATFORM_DENIED` 403 (+`platformReason`) · `PLATFORM_UNAVAILABLE` 502 ·
`USER_MAPPING_NOT_FOUND` / `EVENT_MAPPING_NOT_FOUND` / `ORGANIZATION_MAPPING_NOT_FOUND` /
`EVENT_NOT_LAUNCHABLE_CONTAINER` / `EVENT_ORGANIZATION_MISMATCH` / `AMBIGUOUS_ORGANIZATION_MAPPING` /
`LR_ROLE_NOT_LAUNCHABLE` / `LR_ACCESS_DENIED` 403 · `SESSION_CONFLICT` 409 ·
`AUTH_IDENTITY_*` / `SESSION_*` 403 · `INTERNAL_ERROR` 500. Missing or expired browser state is
not an error: it restarts the launch for this browser via `/platform-entry/start`.

### 9.4 Final validation (Step 4B2, worktree commit `833d9079`)

| Check | Result |
|---|---|
| LR typecheck | 0 errors |
| LR build | success (`/platform-entry`, `/platform-entry/start` dynamic routes) |
| LR handoff tests | 59 / 59 |
| LR full node suite | 3,530 tests, 13 failures — the same 13 inherited failures as the pre-consolidation baseline (name-level diff identical) |
| Platform typecheck | 0 errors |
| Platform tests (incl. launch/handoff/claim) | 155 / 155 |
| Import boundaries | OK, no cross-app imports |
| Whitespace check on the consolidation diff | clean |

### 9.5 Fixture cleanup state

After Step 4B1 and after every Step 4B2 case the NEW project was returned to: auth users 0,
auth sessions 0, refresh tokens 0, identities 0, one-time tokens 0, public rows 0 (no
ambiguous or synthetic mapping rows remain). Schema and reference objects untouched.

## 10. What remains before production

1. Set `LEAD_RETRIEVAL_APP_URL` on the Platform deployment and `PLATFORM_APP_URL` on the LR
   deployment (values live only in deployment env, never in the repository).
2. Create the real mapping rows explicitly and auditably (Platform user ↔ LR user,
   organization ↔ company, event ↔ event) — never by inference.
3. The separate decision about legacy LR data (old project `imkrdrscrikxqywdcmzy`), then
   production Auth settings and cutover.
