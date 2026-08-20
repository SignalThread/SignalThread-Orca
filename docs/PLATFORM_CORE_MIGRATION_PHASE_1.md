# Platform Core Migration — Phase 1 Implementation Record

- **Status:** implemented
- **Branch:** `platform-core-phase-1`
- **Blueprint:** [PLATFORM_CORE_INTEGRATION_AUDIT.md](PLATFORM_CORE_INTEGRATION_AUDIT.md)
- **Scope:** canonical Platform Core **user identity**, the **authentication-authority boundary**, and the **token/signing safety** prerequisite the audit calls out. Organizations, events, roles, and entitlements are untouched.

This document records what Phase 1 changed. It does not replace the audit, which remains the plan of record.

---

## What Phase 1 implements

The audit's recommended order opens with **"Pre-work (no behaviour change)"** (§Recommended Implementation Order 1) and reaches identity at step 4. Phase 1 delivers that pre-work in full, plus the *additive, non-breaking half* of the identity change — enough to move Orca onto canonical Platform identity without repointing the auth project or removing the old path.

| Audit item | Phase 1 |
|---|---|
| §A.8 Set `SPEAKER_INTAKE_TOKEN_SECRET` before switching projects | **Done**, and hardened: signing and verification secrets are now separate, so old links survive the switch regardless of deploy ordering |
| §A.6 Delete the unused `supabase/client.ts` | **Done** |
| §C.4 Route-coverage test for the event API surface | **Done**, generalised to every identity gate actually in use |
| §A.3 Rewrite the resolver to key on `platformUserId`, not email | **Done**, with an explicit transitional email bridge |
| §A.1 Repoint Supabase at Platform Core | **Prepared, not switched.** Config now resolves through one helper; flipping it is an env change |
| §A.2 / §A.4 / §A.5 Delete login + callback, remove auto-provisioning, move invites | **Deferred to Phase 2** — removing the old path before the new one is validated was explicitly out of scope |
| §B Global org/event IDs | **Deferred to Phase 3** |

### Deviation from the audit

The audit sequences identity (step 4) after the role-model decision (step 2) and the global-ID schema change (step 3). Phase 1 takes the **user-identity** slice early because it is additive, reversible, and independent of both: `User.platformUserId` is a new nullable column, so it neither presumes a role model nor forces `User.id` to change. Nothing in steps 2–3 is foreclosed. The org/event ID adoption still happens as the audit describes.

---

## 1. Token/signing safety

**Problem (audit, MEDIUM risk):** `speaker-intake.ts` fell back to `SUPABASE_SERVICE_ROLE_KEY` as its HMAC secret. Changing the Supabase project would have silently invalidated every outstanding speaker intake/portal link.

**Change:** signing secrets are now product-owned and resolved in one place, [web/src/server/security/product-token-secrets.ts](../web/src/server/security/product-token-secrets.ts).

- **Signing** uses `SPEAKER_INTAKE_TOKEN_SECRET`. If it is unset, the legacy service-role key is still used so nothing breaks today — and a one-time warning is logged.
- **Verification** accepts the signing secret, an explicit rotation slot (`SPEAKER_INTAKE_TOKEN_SECRET_PREVIOUS`), and the legacy `SUPABASE_SERVICE_ROLE_KEY`.

The result is that outstanding links keep verifying **even if the secret is introduced after the auth project changes**, rather than depending on operators getting the ordering right.

`MARKETING_UNSUBSCRIBE_TOKEN_SECRET` was already independent and is unchanged; a test now pins that.

## 2. Authentication-authority boundary

**Problem:** six files read `NEXT_PUBLIC_SUPABASE_*` directly, conflating "which project authenticates our users" with "which database holds our data" — even though Prisma has always reached Postgres directly over `DATABASE_URL`.

**Change:** one resolver, [web/src/lib/supabase/auth-authority.ts](../web/src/lib/supabase/auth-authority.ts).

```
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL / _ANON_KEY   → source: "platform-core"
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY → source: "legacy-orca"  (fallback)
```

- A **half-configured** Platform Core authority throws rather than silently falling back to the legacy project.
- The service-role client ([admin.ts](../web/src/lib/supabase/admin.ts)) now picks its key from the *same* project as the resolved authority (`PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY` vs `SUPABASE_SERVICE_ROLE_KEY`), so a Platform Core URL can never be paired with the legacy Orca key.
- Operational database access is unchanged and provably independent — a test asserts the Prisma modules never reference the auth authority and vice versa.

**Cutover is now an env change**, not a code change. Nothing has been repointed.

## 3. Canonical user identity

**Problem (audit's headline finding):** identity was joined by **email** — mutable, user-controlled, collapses two identities that share an address, orphans an account when the address changes.

**Change:** `User.platformUserId` is the identity join key. Resolution ([web/lib/platform/identity.ts](../web/lib/platform/identity.ts)) is:

1. **Canonical** — look up by `platformUserId`.
2. **Transitional email bridge** — if unlinked *and* the bridge is on, look up by email and **claim** the row by writing `platformUserId`. The write is conditional on the row still being unlinked, so it is idempotent and race-safe.
3. **Conflict** — if the email row already belongs to a *different* Platform identity, refuse (`PLATFORM_IDENTITY_CONFLICT`, 403). Identities are never merged silently.
4. **Unlinked** — if no canonical match and an unlinked row holds that email but cannot be bridged, return `PLATFORM_IDENTITY_NOT_LINKED` rather than attempting a second row and failing on the unique email index.

New users created through the auth path are written **with** their canonical id — never email-first.

The dev fallback (`DEV_USER_ID` / `DEV_USER_EMAIL`, relied on by the Playwright suite) is retained per audit §A.9 and deliberately **skips identity resolution entirely**: it names a local row directly and must never fabricate or claim a Platform Core id.

`GET /api/me` now returns `platformUserId` and `identityLinkMode`, so it is observable whether a request still depended on the bridge.

## 4. Route-authorization coverage backstop

The audit (§C.4) asks for a test asserting every event route calls `requireEventRouteAccess`. In the current code that is not the shape of the funnel: routes reach identity through six distinct helpers (`requireEventRouteAccess`, `requireRouteUser`, `requireBudgetRouteAccess`, `resolveDirectoryUser`, `resolveAttendeeUser`, `requireEnrollmentRouteUser`) — all of which delegate to `resolveRequestUser`.

The test was therefore generalised: **every** `route.ts` under `app/api/events/[eventId]/` must reference an approved gate, each delegating helper is proven to funnel into `resolveRequestUser`, and the two deliberate exceptions are allowlisted with reasons:

| Route | Why it resolves no user |
|---|---|
| `marketing/run-due-scheduled-sends` | pull-based runner authenticated by `MARKETING_SEND_RUNNER_SECRET` |
| `documents/upload-local` | disabled endpoint returning 410; touches no data |

The test was verified to actually fail when an unguarded route is introduced.

---

## Schema changes

One additive, non-destructive migration: `20260820120000_add_user_platform_user_id`.

```sql
ALTER TABLE "User" ADD COLUMN "platformUserId" UUID;
CREATE UNIQUE INDEX "User_platformUserId_key" ON "User"("platformUserId");
CREATE INDEX "User_platformUserId_idx" ON "User"("platformUserId");
```

- **Nullable**, so every existing row survives unlinked.
- **Unique**, so one Orca user per Platform identity; NULLs are unconstrained.
- No `DROP`, `DELETE`, `TRUNCATE`, or `UPDATE`. No existing column changed — `User.email` keeps its unique index, because it is still the bridge key.
- Applied to **both** Prisma schema copies (see *Discovered issues*).

Verified by applying the full 83-migration history to a scratch database, then re-running `migrate deploy` (no pending migrations) and `migrate status` (no drift).

## Migration / backfill requirements

[web/scripts/backfill-platform-user-ids.ts](../web/scripts/backfill-platform-user-ids.ts) — `npm --prefix web run platform:backfill-user-ids` (add `--commit` to write).

- **Dry run by default.**
- **Never invents ids** — every id comes from the configured authority's `auth.users` listing. Users absent there are reported and left unlinked.
- **Idempotent** — writes are conditional on `platformUserId IS NULL`; re-runs are no-ops.
- **Non-destructive** — never deletes, never rewrites email or role, and leaves conflicting rows untouched while reporting them.
- Refuses to guess when two authority identities share an email address.

The script reports how many users remain unresolved and warns that `PLATFORM_IDENTITY_EMAIL_BRIDGE=false` must not be set until that reaches zero.

---

## Environment variables

| Variable | Status | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL` | new, optional | Platform Core auth authority. Set with the anon key to cut over |
| `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY` | new, optional | as above |
| `PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY` | new, required *once Platform Core is the authority* | auth administration against Platform Core |
| `SPEAKER_INTAKE_TOKEN_SECRET` | existing, **now strongly recommended** | product-owned speaker link signing |
| `SPEAKER_INTAKE_TOKEN_SECRET_PREVIOUS` | new, optional | rotation slot, verification only |
| `PLATFORM_IDENTITY_EMAIL_BRIDGE` | new, defaults to enabled | set `false` to retire the email bridge after backfill |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | unchanged | legacy Orca authority; still the default |

**No live Supabase configuration was modified.**

---

## Auth/identity behaviour: before vs after

| | Before | After |
|---|---|---|
| Identity join key | `User.email` | `User.platformUserId` |
| Email's role | the identity | a transitional, switchable bridge that only *links* rows |
| Two identities, one email | silently collapsed into one account | `PLATFORM_IDENTITY_CONFLICT` → 403 |
| Email change at the IdP | orphans the account | irrelevant once linked |
| Auth project config | six files reading `NEXT_PUBLIC_SUPABASE_*` | one resolver; cutover is an env change |
| Service-role key ↔ auth project | could drift apart | bound to the resolved authority |
| Speaker link validity | tied to `SUPABASE_SERVICE_ROLE_KEY` | product-owned secret; legacy accepted for verification |
| Auto-provisioning | creates a user for any valid OTP email | **unchanged** (Phase 2) — but new rows are now canonical |
| Org / event / role authorization | org scope + `EventMember` + `UserRole` | **unchanged** |

## Compatibility behaviour that remains

These are deliberate and must be retired in later phases:

1. **The email bridge is on by default.** Until the backfill runs everywhere, an unlinked row is still reachable by email — once, to link it.
2. **The legacy Orca Supabase project is still the authority** unless the Platform Core env is set.
3. **`SUPABASE_SERVICE_ROLE_KEY` still signs speaker links** if `SPEAKER_INTAKE_TOKEN_SECRET` is unset (with a warning), and is always accepted for verification.
4. **Auto-provisioning into `DEFAULT_ORG_ID` still exists** (audit §A.4). Anyone with a valid OTP for any email still self-provisions.
5. **Invites still create unlinked, email-only rows.** They depend on the bridge to link on first sign-in, so **invites must move to Platform Core (§A.5) before the bridge can be switched off.**
6. **The dev fallback remains**, gated to development, as the E2E suite requires.
7. `SUPER_ADMIN`, `canListOrganizationEvents`, `User.orgId`, and the local `/platform` admin area are all untouched.

---

## Discovered issues

1. **The repository contains two Prisma trees** — `prisma/` and `web/prisma/` — with byte-identical schemas and mirrored migration directories, both tracked in git, with no sync mechanism. `web/prisma.config.ts` drives client generation and migrations; the root copy is used by `prisma/seed.ts` and is what several tests read (`../prisma/schema.prisma`). Phase 1 applied its change to **both**, and a test asserts the `User` model matches in each. This duplication is a standing hazard and deserves consolidation.
2. **`requireEventRouteAccess` is not the single funnel the audit assumes** — six helpers are, all reaching `resolveRequestUser`. Documented above; the coverage test reflects reality.
3. **Two DB-backed tests fail on `main`** independently of this work (`matrix2-snapshot-parity`, `matrix2-session-partial-merge` expected-attendance provenance). They only surface when a database is configured, which is why they are absent from a no-DB baseline. Not investigated here.
4. **Ten source-inspection tests fail on `main`** (budget grid layout, command-center container, timeline render-path, docs upload). Pre-existing and unrelated.

---

## Still owned by later phases

- **Phase 2 — auth cutover:** repoint the env at Platform Core, delete the local login page and `/auth/callback`, remove auto-provisioning and `DEFAULT_ORG_ID`, move invites to Platform Core, central logout, retire the email bridge, validate org context against token claims rather than local `Membership`.
- **Phase 3 — canonical org and event IDs:** make `Organization.id` and `Event.id` caller-supplied Platform Core UUIDs (adopt-as-PK, per audit §B), retire `User.orgId`, reseed, wipe R2, replace `VOICE_DEMO_EVENT_ID`, update E2E fixtures.
- **Phase 4 — role model:** per-org roles, `SUPER_ADMIN` as a Platform claim, `canListOrganizationEvents` redesign, entitlements from token claims.
- **Phase 5 — read-model:** event summary + activity feed endpoints, health endpoint; retire the local platform-admin area and `platformActiveOrgId`.
