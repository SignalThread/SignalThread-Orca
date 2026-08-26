# SignalThread Platform Core → Orca Migration — Next Chat Handoff

**Date:** 2026-08-21  
**Scope:** Real production Platform Core + Orca migration only  
**Explicitly excluded:** Housing, Registration, conference click-through prototype, Lead Retrieval migration, Voice migration

---

# 1. Executive State

Repository cleanup, Platform Core auth foundation and cutover, legacy schema-truth audit,
clean database baseline, permanent Orca database provisioning, **and Phase 3 canonical
organization/event identity adoption** are complete. A real user now authenticates once at
Platform Core and lands inside an Orca event with no second login and no duplicate
organization or event selection.

```text
✅ Clean SignalThread-owned Orca repo
✅ Platform Core Phase 1 — canonical identity foundation
✅ Platform Core Phase 2 — auth cutover architecture
✅ Legacy Orca DB schema-truth audit
✅ Clean current-state Orca DB baseline
✅ Disposable DB baseline verification
✅ Permanent new Orca Supabase project created
✅ Clean baseline applied to permanent Orca DB
✅ Prisma parity = zero drift
✅ Native PostgreSQL integrity verified
✅ Platform Core Auth and Orca operational DB proven separate
✅ Phase 3 — canonical organization/event ids adopted (no mapping tables)
✅ Platform organization claims are authoritative
✅ Server-validated Platform → Orca event handoff
✅ First real end-to-end Platform login → Orca event, verified against live infrastructure

→ NEXT: Platform Core product build-out (see section 11)
```

The next chat should **not** redo the database audit, the baseline, or Phase 3 identity work.

---

# 2. Canonical Orca Repository

GitHub:

```text
SignalThread/SignalThread-Orca
```

Local:

```text
~/Documents/orca-clean
```

Remote:

```text
git@github-signalthread:SignalThread/SignalThread-Orca.git
```

SignalThread SSH alias:

```text
github-signalthread
```

Canonical application path (Monorepo Phase 1, LOOP 1):

```text
apps/orca/          <- Orca; was web/
packages/signalthread-ui/
```

The repository is an npm workspace root (`workspaces: ["apps/*", "packages/*"]`). Orca remains
independently deployable; see `docs/DEPLOYMENT_BOUNDARIES.md`.

Important clean-baseline commit:

```text
605c0e6
Add verified clean Orca database baseline
```

Earlier Platform commits:

```text
a088143  Implement Platform Core phase 1 identity foundation
0c0e034  Implement Platform Core phase 2 auth cutover
```

At the end of permanent DB provisioning, Opus reported one documentation file modified but **not committed**:

```text
docs/ORCA_CLEAN_DATABASE_BASELINE.md
```

Therefore the next chat must first verify Git state rather than assuming it was committed afterward.

Run:

```bash
cd ~/Documents/orca-clean
git status
git branch --show-current
git rev-parse --short HEAD
git rev-parse --short origin/main
git diff --stat
git diff --check
```

If the only pending change is the expected database-verification documentation update, review and commit it before Phase 3.

Suggested commit:

```bash
git add docs/ORCA_CLEAN_DATABASE_BASELINE.md && \
git commit -m "Document permanent Orca database verification" && \
git push origin main
```

Do not commit any `.env.local` file or credentials.

---

# 3. Supabase Architecture — Current Reality

There are now two distinct SignalThread Supabase projects in the SignalThread organization.

```text
SignalThread Supabase
│
├── signalthread-platform-core
│   ├── canonical Supabase Auth
│   ├── canonical users
│   ├── canonical organizations
│   ├── canonical events
│   ├── memberships/access
│   └── product entitlements
│
└── signalthread-orca
    └── Orca operational PostgreSQL only
```

## Platform Core

Project:

```text
signalthread-platform-core
```

Project ref:

```text
wtbnpeluwhjjqccdofxd
```

Region:

```text
us-east-2 / East US (Ohio)
```

Role:

```text
Authentication + canonical Platform identity/access
```

## Orca

Project:

```text
signalthread-orca
```

Project ref:

```text
qgxvtgnzptepimuawnku
```

Region:

```text
us-east-2 / East US (Ohio)
```

PostgreSQL:

```text
17.6
```

Role:

```text
Orca operational database only
```

The new Orca Supabase project was created during the permanent-database provisioning task. It did not exist before that task.

The app connection to the new Orca PostgreSQL database was proven.

The runtime separation was also proven:

```text
Platform auth project ref != Orca database project ref
```

Do not connect Orca directly to Platform Core Postgres.

Do not give Platform Core the Orca operational DB connection.

Do not connect sibling products directly to this Orca DB.

### Supabase CLI-link note

The permanent project exists and the application DB connection is verified. A local `supabase link` state for `~/Documents/orca-clean` was **not the important proof performed in the provisioning report**.

If local Supabase CLI project linkage is desired, verify the state before doing anything. The intended remote project is:

```text
qgxvtgnzptepimuawnku
```

Never link the Orca repo to Platform Core or the legacy Orca project by mistake.

---

# 4. Permanent Orca Database — Verified State

Final provisioning verdict:

```text
PERMANENT ORCA DB VERIFIED
```

Clean baseline:

```text
apps/orca/prisma/baseline/20260821120000_orca_clean_baseline/migration.sql
```

Mirror:

```text
prisma/baseline/20260821120000_orca_clean_baseline/migration.sql
```

Canonical Prisma schema:

```text
apps/orca/prisma/schema.prisma
```

Mirror:

```text
prisma/schema.prisma
```

Baseline config:

```text
apps/orca/prisma.baseline.config.ts
```

Verified permanent schema:

```text
124 application tables
112 enums
124 PKs
278 FKs
13 unique constraints
27 check constraints
503 indexes
6 partial unique indexes
2 PostgreSQL functions
2 PostgreSQL triggers
0 application rows after verification
```

Catalog comparison:

```text
2,948 facts vs 2,948 facts
0 differences
```

Prisma:

```text
prisma validate                 PASS
prisma generate                 PASS
prisma migrate status           up to date
prisma migrate diff --exit-code 0 / EMPTY
```

Migration ledger:

```text
Exactly one clean migration row:
20260821120000_orca_clean_baseline
```

The legacy 80+ migration chain was **not** replayed.

The old `_prisma_migrations` ledger was **not** copied.

Native integrity was proven, including:

```text
6/6 partial unique indexes
27/27 checks
2/2 functions
2/2 triggers
exact FK actions
UUID database defaults
timestamp precision/timezone behavior
```

Supplies and Signage database families are present.

Also present:

```text
SignageSignSession
MatrixRowSpeaker
MatrixRowStaffAssignment
EventPerson.phone
EventPerson.notes
User.platformUserId
```

---

# 5. Why the Clean Baseline Exists

The legacy Orca migration chain was audited and found untrustworthy as a database reconstruction mechanism.

The live DB had:

- migrations missing from the repository
- checksum mismatches
- rolled-back/resolved history
- controlled-recovery placeholders
- live-only tables/enums
- native Postgres objects Prisma would not safely reproduce by itself

The governing source-of-truth strategy became:

```text
actual live PostgreSQL schema
+
runtime application contracts
+
reconciled Prisma schema
=
one clean current-state baseline
```

That work is complete.

Do not reopen the decision to replay the old migration chain.

---

# 6. Platform Architecture — Locked Decisions

Platform Core owns:

```text
Supabase Auth
canonical user_id
canonical organization_id
organization membership
canonical event_id
event access
product entitlements
Platform admin authority
```

Orca owns:

```text
Orca operational data
Orca workflows
Orca-specific roles
Orca-specific permissions
Orca product audit/activity
```

Core rule:

> Platform Core owns shared identity and access. Orca owns Orca operational behavior.

No direct cross-product DB reads/writes.

Platform Core should not become the synchronous source for every normal Orca operational query.

---

# 7. Canonical ID Target

This is the next major architecture phase.

Target:

```text
Platform user_id
        ↓
Orca User.platformUserId
```

```text
Platform organization_id
        ↓
Orca Organization.id
```

```text
Platform event_id
        ↓
Orca Event.id
```

Important distinction:

`User` may retain a local Orca `User.id` because Orca can have local user-specific state and local FKs.

For Organization and Event, the target is a single canonical ID space.

Do **not** create unnecessary permanent mapping tables such as:

```text
platformOrganizationId <-> orcaOrganizationId
platformEventId        <-> orcaEventId
```

Orca has no customers and the new operational DB is empty. This is the moment to adopt canonical IDs directly.

---

# 8. Phase 1 — Already Completed

Phase 1 established the identity foundation.

Key changes:

```text
User.platformUserId UUID UNIQUE nullable
```

Canonical identity is Platform `user_id`, not email.

Email is only a transitional bridge and is off by default in production.

Authentication authority was abstracted from Orca operational DB location.

Speaker intake token signing was separated from Supabase service-role keys.

Product token secret:

```text
SPEAKER_INTAKE_TOKEN_SECRET
```

Do not re-couple product token signing to auth credentials.

Key files:

```text
apps/orca/lib/platform/identity.ts
apps/orca/lib/request-user.ts
apps/orca/src/lib/supabase/auth-authority.ts
apps/orca/src/server/security/product-token-secrets.ts
apps/orca/scripts/backfill-platform-user-ids.ts
```

Tests:

```text
apps/orca/lib/platform-core-auth-boundary-regression.test.ts
apps/orca/lib/platform-core-authorization-boundary-regression.test.ts
apps/orca/lib/platform-core-identity-regression.test.ts
apps/orca/lib/platform-core-token-signing-regression.test.ts
```

---

# 9. Phase 2 — Already Completed

Phase 2 established Platform-owned authentication behavior.

Orca no longer intends to provide standalone canonical staff login/signup.

Normal target:

```text
/login
→ Platform Core sign-in
→ Platform Core authenticates
→ Orca validates Platform identity
```

Auto-provisioning of arbitrary authenticated users was removed.

Do not reintroduce:

```text
DEFAULT_ORG_ID
email as canonical identity
standalone Orca canonical staff signup
implicit product provisioning from authentication alone
legacy Orca Supabase as auth authority
```

Entitlement boundary exists in:

```text
apps/orca/lib/platform/entitlements.ts
apps/orca/lib/platform/entry.ts
```

Trusted entitlement source:

```text
server-controlled app_metadata
```

Do not authorize from user-editable `user_metadata`.

Legacy Orca invitation flow is gated under Platform auth.

A dedicated Platform invitation API may still be missing.

### Important Phase 2 transitional state

Current code intentionally keeps:

```text
arePlatformOrganizationClaimsAuthoritative() = false
```

because Orca Organization IDs were not yet canonical.

**Phase 3 is where this should be revisited.**

Do not simply flip it to true before canonical organization adoption and tests are complete.

---

# 10. Current Environment Contract

Do not place secret values in docs or chat.

## Platform Core Auth

Required:

```text
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY
```

These point to:

```text
signalthread-platform-core
```

They do not point to the Orca operational database.

Migration/backfill-only capability:

```text
PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY
```

Do not put this into ordinary application runtime unless a proven runtime need exists.

## Orca DB

Required:

```text
DATABASE_URL
```

This now points locally to the new:

```text
signalthread-orca
```

operational database.

Confirmed obsolete:

```text
DIRECT_URL
```

No current code references.

## Platform routing / entitlement

Relevant:

```text
NEXT_PUBLIC_PLATFORM_CORE_APP_URL
NEXT_PUBLIC_ORCA_APP_URL
PLATFORM_ENTITLEMENT_MODE
```

Optional/defaulted:

```text
NEXT_PUBLIC_PLATFORM_CORE_SIGN_IN_PATH
NEXT_PUBLIC_PLATFORM_CORE_SIGN_OUT_PATH
PLATFORM_PRODUCT_KEY
PLATFORM_IDENTITY_EMAIL_BRIDGE
ALLOW_LEGACY_ORCA_AUTH_AUTHORITY
DATABASE_POOL_MAX
```

Product key default:

```text
orca
```

Production entitlement target:

```text
claims
```

## Orca infrastructure

Expected product-owned services include:

```text
SPEAKER_INTAKE_TOKEN_SECRET

R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_ENDPOINT

OPENAI_API_KEY
OPENAI_ROOMSET_MODEL
FNB_MENU_PARSER_MODEL

SENDGRID_API_KEY
EMAIL_FROM
EMAIL_REPLY_TO

MARKETING_UNSUBSCRIBE_TOKEN_SECRET
MARKETING_PUBLIC_BASE_URL
```

Do not commit `.env.local`.

The provisioning task wrote local environment configuration and explicitly reported it as gitignored.

---

# 11. Phase 3 — COMPLETED

Canonical Platform organization/event ID adoption is done and verified end to end against
live infrastructure.

## 11.1 The Platform Core contract that actually exists

Inspected read-only on 2026-08-21. **Platform Core is a bare Supabase project:**

```text
public schema tables      : 0   (probed: organizations, organization_members, events,
                                 event_access, product_entitlements, users, profiles,
                                 memberships, entitlements, accounts -> all HTTP 404)
PostgREST exposed objects : 1   (rpc/rls_auto_enable only)
GoTrue users at start     : 0
Auth providers enabled    : email
```

There is **no relational organization / event / membership / entitlement registry in
Platform Core.** Do not write code against table names from older documents.

The only canonical, server-controlled mechanism Platform Core exposes today is
**Supabase Auth plus `app_metadata` claims**:

```jsonc
// auth.users.app_metadata  — writable only with a service-role key, signed into the JWT
{
  "signalthread": {
    "products":      ["orca"],   // product entitlement. Orca fails closed without it
    "organizations": ["<uuid>"], // canonical org ids — AUTHORIZATION INPUT
    "events":        ["<uuid>"]  // provisioning record only — NOT used for authorization
  }
}
```

`organizations` is authorization input. `events` is deliberately **not**: a per-event claim
list does not scale, so Orca authorizes an event by checking that the event's organization
is Platform-authorized and that the user holds an Orca `EventMember` row.

Orca never queries Platform Core's database. Everything comes from the verified session.

## 11.2 Canonical ids — adopted directly, no mapping

```text
Platform user_id         -> Orca User.platformUserId   (Orca keeps a local User.id)
Platform organization_id -> Orca Organization.id       (same uuid, IS the primary key)
Platform event_id        -> Orca Event.id              (same uuid, IS the primary key)
```

No mapping tables exist and none were created. Verified in the permanent Orca database:
124 application tables, zero tables matching `%mapping%` or `%platform%`.

No schema migration was needed — `Organization.id` and `Event.id` were already
caller-suppliable uuids.

## 11.3 Provisioning tools (both idempotent, dry-run by default)

```text
apps/orca/scripts/platform-provision-test-identity.ts   -> writes Platform Core (GoTrue + claims)
apps/orca/scripts/adopt-platform-canonical-ids.ts       -> writes Orca, consuming those ids
```

The Orca script **never invents** an organization or event id: omitting one is an error, and
the file contains no uuid generator. It refuses to merge two identities, refuses to re-point
an already-linked email, and refuses to move a canonical event between organizations.

Regenerate a test identity with (no secrets in this file — the password is written to a path
you choose and never printed):

```bash
cd web
npx tsx scripts/platform-provision-test-identity.ts \
  --email <address> --password-out <path> --ids-out <path> --commit
npx tsx scripts/adopt-platform-canonical-ids.ts \
  --platform-user-id <uuid> --organization-id <uuid> --event-id <uuid> \
  --email <address> --event-role EVENT_ADMIN --commit
```

## 11.4 Organization context is now authoritative

`arePlatformOrganizationClaimsAuthoritative()` returns **true** (was hard-coded `false` in
Phase 2 because the id spaces were not comparable). Override with
`PLATFORM_ORG_CLAIMS_AUTHORITATIVE=true|false`.

The model is **ceiling, never grant**:

```text
accessible = Orca Membership  ∩  Platform organizations claim
```

- A claim naming an organization Orca does not grant adds nothing.
- A claim naming only foreign organizations denies (`PLATFORM_ORGANIZATION_CONTEXT_MISMATCH`).
- Entitled but no organization claim denies **in production only**
  (`PLATFORM_ORGANIZATION_CLAIM_MISSING`); elsewhere the fixture harness has no org claim.
- Cookie selection happens strictly *within* that set, so a forged `activeOrgId` cannot widen access.

Applied in exactly one place, before organization selection, and exposed on the resolver
result as `authorizedOrganizationIds` so no consumer recomputes it.

## 11.5 Event handoff

```text
GET /platform-entry?event_id=<canonical uuid>
```

`app/platform-entry/route.ts` + `lib/platform/event-context.ts`. The incoming id is
**untrusted** and is only a lookup key. Entry requires all of:

1. parses as a uuid                          else 400 `INVALID_EVENT_ID`
2. event exists in Orca                      else 404 `EVENT_NOT_FOUND`
3. event.orgId ∈ authorizedOrganizationIds   else 403 `EVENT_OUTSIDE_AUTHORIZED_ORGANIZATION`
4. Orca `EventMember` admits the user        else 403 `EVENT_MEMBERSHIP_REQUIRED`

On success it sets the organization cookies from the *validated event's* organization and
redirects to `/events/{id}` — which is what removes the duplicate organization selection.
The redirect uses a **relative** `Location` on purpose: an absolute one can normalise the
host (127.0.0.1 → localhost) and the cookies just set would be scoped to a different host.

Unauthenticated entry bounces to Platform Core sign-in preserving the full return URL, so
the user lands back on the same event after logging in.

## 11.6 Verified end-to-end (live infrastructure, not fixtures)

```text
1. unauthenticated /platform-entry?event_id=…  -> 307 to Platform Core sign-in (return URL preserved)
2. authenticate at Platform Core               -> session issued, claims in JWT
3. /api/me                                     -> 200 OK
4.   platformUserId  == Platform user_id       -> true
5.   activeOrgId     == canonical org id       -> true
6.   identityLinkMode                          -> CANONICAL
7.   entitlementSource                         -> platform-claims  (a real Platform grant)
8. /platform-entry?event_id=…                  -> 307 /events/{canonical event id}
9. /events/{id}                                -> 200, event renders, no second login
```

Live deny paths, all against the running stack:

```text
tampered event_id (valid uuid, not an event) -> 404 EVENT_NOT_FOUND
malformed / missing event_id                 -> 400 INVALID_EVENT_ID
forged session cookie                        -> 307 bounce (fails closed)
entitlement removed from claims              -> 403 PLATFORM_ENTITLEMENT_MISSING_PRODUCT
organization claim changed to a foreign uuid -> 403 PLATFORM_ORGANIZATION_CONTEXT_MISMATCH
claims restored                              -> 200 / 307 again
```

## 11.7 `User.orgId` status — TRANSITIONAL, no longer access truth

Phase 2 removed every write. Phase 3 confirms it authorizes nothing.

```text
AUTHORIZATION    : none. Access = Membership ∩ Platform claim.
                   Request-level `user.orgId` is context.activeOrgId, NOT the column.
PRODUCT CONTEXT  : still a required NOT NULL column with an FK to Organization,
                   set when a user row is created.
LEGACY COMPAT    : exactly ONE runtime read remains, inside the development-only
                   DEV_ALLOW_NO_MEMBERSHIP bypass in lib/request-user.ts.
TEST FIXTURE     : harness sets it when creating users.
```

Pinned by a regression test that fails if a second read appears. **Not removed**: it is
NOT NULL with an FK, so dropping it is a schema migration plus a fixture sweep, and it is
not on the critical path. That is the remaining dependency.

## 11.8 Entitlement status

Enforced and fail-closed. `entitlementSource: platform-claims` observed against live
Platform Core, so the real grant path works — not just the migration fallback.

Still missing: a **systematic issuer**. Claims are set per-user with a service-role key.
Nothing keeps them in step with entitlement changes, and there is no Platform UI. That is
Platform product work, not Orca work.

---

# 12. Standing Non-Goals

These applied to Phase 3 and still apply to the next phase.

Do not:

- migrate legacy Orca customer data
- use the old Orca DB for runtime
- create permanent org/event mapping tables without a proven need
- collapse `EventMemberRole` into Platform Core
- move Orca product RBAC into Platform
- connect Orca to Platform Core Postgres
- directly query Platform Core DB from ordinary Orca runtime paths
- rebuild the clean DB baseline
- replay the legacy migration chain
- delete Matrix legacy bridges as side work
- consolidate duplicate Prisma trees unless necessary
- begin Voice or Lead Retrieval migration
- confuse this with the conference prototype

---

# 13. Platform → Orca Handoff Target

After canonical IDs are aligned, the desired user experience is:

```text
User signs into SignalThread Platform
        ↓
Platform Core Auth
        ↓
Platform knows:
  user_id
  organization_id
  event_id
  Orca entitlement/access
        ↓
Open Orca
        ↓
Orca validates context
        ↓
No second login
No second organization selection
No second event selection
        ↓
Orca applies EventMemberRole / product RBAC
        ↓
All operational work stays in signalthread-orca
```

The handoff must not blindly trust client-provided IDs.

Platform identity/context must be verifiable server-side.

---

# 14. `User.orgId` Status

**Resolved in Phase 3 — see section 11.7.** It no longer authorizes anything; one
development-only read remains and the column is still NOT NULL. Removing it is optional
cleanup, not a blocker.

---

# 15. Entitlement State

**Enforced and verified — see section 11.8.** `entitlementSource: platform-claims` was
observed against live Platform Core. The remaining gap is a systematic issuer, which is
Platform product work.

---

# 16. Invitation State

Platform Core should own staff invitations and canonical user provisioning.

Current known state:

```text
Platform Core Supabase Auth exists
Orca legacy staff invitation path is gated
dedicated Orca-callable Platform invitation API may not yet exist
```

Do not rebuild Orca-owned identity invitation just to unblock Phase 3.

For controlled testing, use an explicit Platform-managed test/provisioning path.

---

# 17. Prisma State

**Consolidated in Monorepo Phase 1, LOOP 2.** There is now exactly one active Prisma tree:

```text
apps/orca/prisma/
  schema.prisma      <- the only schema.prisma in the repository
  baseline/          <- the only active migration source (1 migration)
  seed.ts
```

The pre-baseline 83-migration chain is historical evidence and regression fixtures only:

```text
apps/orca/test-fixtures/legacy-orca-migrations/
```

`apps/orca/prisma/` deliberately contains **no `migrations/` directory**, and the fixture
directory's `migration_lock.toml` is renamed `.historical`, so neither `prisma.config.ts` nor a
bare `prisma migrate` can discover the legacy chain. Both `prisma.config.ts` and
`prisma.baseline.config.ts` point at `prisma/baseline`.

> Previously `prisma.config.ts` — the default config — pointed `migrations.path` at the legacy
> chain, so a plain `prisma migrate deploy` would have replayed a chain the schema-truth audit
> says can never reconstruct the current schema. That hazard is now closed.

Verified at consolidation: baseline `migration.sql` checksum unchanged
(`9dc4e7ff44cf3c89cef02ed71fa85acadaf2c82d7da999549771f33490022558`), all 84 legacy files
byte-identical, `migrate diff --exit-code` = 0 against both the existing and a freshly-built
database.

Deferred cleanup:

```text
MatrixRowSpeaker retirement decision
MatrixRowStaffAssignment retirement decision
unused legacy timeline enums
EventPerson uniqueness decision
AV/Food createdAt nullability tightening
```

These are **not Phase 3 blockers**.

---

# 18. Database Safety

The old legacy Orca database remains historical reference/backup only.

New runtime target:

```text
signalthread-orca
```

Before any DB mutation, verify target identity.

Never assume environment loading.

Never run destructive commands because a file happens to contain a `DATABASE_URL`.

Do not apply Platform Core schema changes to Orca DB or Orca schema changes to Platform Core.

---

# 19. Important Docs in Canonical Repo

Read these before Phase 3 implementation:

```text
docs/PLATFORM_CORE_INTEGRATION_AUDIT.md
docs/PLATFORM_CORE_MIGRATION_PHASE_1.md
docs/PLATFORM_CORE_MIGRATION_PHASE_2.md
docs/ORCA_CLEAN_DATABASE_BASELINE.md
docs/DEPLOYMENT_BOUNDARIES.md          <- monorepo failure-domain + Vercel config
docs/MONOREPO_PHASE1_PLAN.md
docs/MONOREPO_PHASE1_PROMPTS.md
docs/LOOP_CONTROLLER.md
apps/orca/test-fixtures/legacy-orca-migrations/README.md
```

Legacy schema audit, if still needed as historical evidence:

```text
~/Documents/God Emperor of Dune /planner-os/docs/ORCA_LEGACY_DB_SCHEMA_TRUTH_AUDIT.md
```

Important current files:

```text
apps/orca/lib/platform/identity.ts
apps/orca/lib/request-user.ts
apps/orca/lib/platform/entitlements.ts
apps/orca/lib/platform/entry.ts
apps/orca/lib/platform/invitations.ts

apps/orca/src/lib/supabase/auth-authority.ts
apps/orca/src/server/security/product-token-secrets.ts

apps/orca/app/(public)/login/
apps/orca/app/auth/callback/route.ts
apps/orca/app/(shell)/_components/logout-button.tsx

apps/orca/prisma/schema.prisma
apps/orca/prisma/baseline/20260821120000_orca_clean_baseline/migration.sql
apps/orca/prisma.baseline.config.ts
```

---

# 20. Tests / Known Baseline

Run from `apps/orca/` with `DATABASE_URL` pointing at a database built from the committed
baseline (`apps/orca/prisma/baseline/20260821120000_orca_clean_baseline/migration.sql`).

Baseline on `main`, with a database configured: **12 failing tests.** They are pre-existing
and unrelated to Platform Core work (budget grid layout, command-center container, timeline
render-path, docs upload, two matrix-2 DB tests). Always diff failure *names* against that
baseline before attributing anything to your change.

Last full run (Monorepo Phase 1 working tree, after LOOP 4):

```text
npm run test:summary        2611 pass / 12 fail / 7 skipped   -> identical failure set to main
npx tsc --noEmit            clean
npx eslint lib src app      0 errors / 74 warnings            -> identical to main
npm run build               exit 0  (108/108 pages)
npm ci && npm run build --workspace apps/orca   exit 0  -> clean-install deploy path
```

Two budget journey tests (`budget-group-active-summary`, `budget-filtered-export`) are
order/state-sensitive: they fail against a database carrying accumulated fixture data and pass
both in isolation and against a freshly-built baseline database. Pre-existing, unrelated to the
monorepo work — rebuild the test database before attributing them to a change.

Platform Core suites:

```text
lib/platform-core-identity-regression.test.ts            Phase 1
lib/platform-core-auth-boundary-regression.test.ts       Phase 1
lib/platform-core-token-signing-regression.test.ts       Phase 1
lib/platform-core-authorization-boundary-regression.test.ts
lib/platform-core-phase2-cutover-regression.test.ts      Phase 2  (32 tests)
lib/platform-core-phase2-access-regression.test.ts       Phase 2
lib/platform-core-phase3-canonical-context.test.ts       Phase 3  (16 tests)
lib/orca-baseline-native-integrity.test.ts               DB baseline (11 tests)
```

---

# 20a. Monorepo Phase 1 — Verified State

Branch `platform-monorepo-phase-1`. Schema mode LOCKED throughout: `schema.prisma` is
byte-identical to its pre-move content, no migration was created, and nothing was run against
`signalthread-orca`, Platform Core, or the legacy Orca database.

```text
signalthread/                     npm workspace root
  apps/orca/                      Orca (was web/) -- the canonical application
    prisma/schema.prisma          the only schema.prisma in the repository
    prisma/baseline/              the only active migration source (1 migration)
    prisma/seed.ts
    test-fixtures/legacy-orca-migrations/   83 historical migrations, fixtures only
    vercel.json
  packages/signalthread-ui/       shared presentation package
  scripts/check-import-boundaries.mjs
  package-lock.json               single reproducible workspace lockfile
```

| Loop | Outcome |
|---|---|
| 1 — Move Orca to `apps/orca` | VERIFIED. 1226 files relocated with history. All 740 packages Orca resolves match pre-move versions exactly. |
| 2 — Consolidate Prisma | VERIFIED. One schema, one baseline, legacy chain isolated and unreachable as a migration source. |
| 3 — Deployment isolation | VERIFIED. `npm ci` + workspace build proven; failure-domain rule documented. |
| 4 — Monorepo guardrails | VERIFIED. Root commands, enforced import boundaries, no active stale `web/` dependency. |
| 5 — Cleanup + full verification | VERIFIED. Orphan root `app/` removed; full suite at exact baseline parity. |

Final validation (LOOP 5):

```text
prisma validate            valid
prisma generate            client generated (v7.9.1)
npx tsc --noEmit           clean
npx eslint lib src app     0 errors / 74 warnings      -> identical to main
npm run build              exit 0, 108/108 pages
Platform Core Phase 1/2/3  105 / 105 pass
native baseline integrity   11 /  11 pass
journeys                    18 /  18 pass
harness                      8 /   8 pass
npm run test:summary       2613 pass / 12 fail / 7 skipped
                           -> failure set IDENTICAL to main; zero new, zero fixed
```

Behaviour proof: Platform Core remains the primary auth authority (legacy Orca Supabase stays a
lower-priority fallback), `DATABASE_URL` still resolves to the Supabase-hosted Orca operational
database, `User.platformUserId` is `@unique` and indexed, `/platform-entry` is present, and
canonical org/event authorization, entitlement, `EventMemberRole` decisiveness, and fail-closed
behaviour on tampered context are all covered by the 105 passing Platform Core tests.

### Vercel — exact settings

| Setting | Value |
|---|---|
| Root Directory | `apps/orca` — **manual dashboard change required after merge** |
| Include files outside Root Directory | Enabled |
| Framework | Next.js (`apps/orca/vercel.json`) |
| Install Command | leave empty; Vercel installs from the workspace root |
| Build Command | `npm run build` |
| Output Directory | `.next` |

### Repository name

`SignalThread/SignalThread-Orca` — rename **DEFERRED**, deliberately. Merging already requires
one manual Vercel change; stacking a rename would make a failed deploy ambiguous. Nothing in the
repository depends on the name, and the `github-signalthread` SSH alias is host-level and
unaffected. Exact rename procedure: `docs/DEPLOYMENT_BOUNDARIES.md` §7.

Root commands:

```text
npm run dev:orca | build:orca | test:orca | lint:orca | typecheck:orca
npm run typecheck | lint | test | build          across all workspaces
npm run check                                    typecheck + lint + test
npm run boundaries                               enforce apps/* !-> apps/*
```

Import boundary — `apps/*` may import `packages/*`, never another `apps/*`. Enforced by
`scripts/check-import-boundaries.mjs` and asserted by
`apps/orca/lib/monorepo-import-boundaries.test.ts`, so it runs in the normal suite.

**Manual step required after merge:** Vercel Root Directory must change `web` -> `apps/orca`
with "Include files outside Root Directory" enabled. The old path no longer exists, so the
build fails until this is done. Exact values: `docs/DEPLOYMENT_BOUNDARIES.md`.

---

# 20b. Platform App Phase 1 — Verified State (5 loops)

Branch `platform-app-phase-1`. Uncommitted at time of writing.

## What now exists

**`apps/platform`** — an independent Next.js app on port 3001 locally, `app.signalthread.ai`
in production. Real email+password sign-in against Platform Core (the only enabled auth
provider — verified live, no OAuth/phone/SAML), `/signin`, `/signout`, auth callback,
authenticated shell, `/home` launcher, `/admin` console. Middleware verifies with
`getUser()` and fails closed.

**Platform Core relational registry**, deployed to `wtbnpeluwhjjqccdofxd` via four tracked
migrations under `apps/platform/supabase/migrations/`:

```text
organizations · organization_memberships · events · event_memberships
products · organization_product_entitlements · platform_admins
```

RLS enabled **and forced** on all seven. Reads are org-scoped; there are **no
insert/update/delete policies at all** on membership, entitlement, or admin tables — with
RLS forced, absent policy denies, so provisioning is necessarily the service-role path.
Proven live: **10/10** RLS assertions via `npm run verify:rls`.

## The claim contract (do not change without re-verifying Orca)

```json
{ "signalthread": { "v": 1,
    "access": [ { "organization_id": "...", "organization_role": "ADMIN", "products": ["orca"] } ],
    "platform_admin": false, "synced_at": "<iso>" } }
```

An organization the user belongs to **without** an entitlement still appears, with
`products: []`. That emptiness is load-bearing: it is how Orca distinguishes
`PLATFORM_ORG_NOT_MEMBER` from `PLATFORM_PRODUCT_NOT_ENTITLED`. **No event ids in the JWT.**

Structured claims are authoritative whenever `access` is present; legacy flat claims are
migration-only and are ignored entirely beside a structured claim, so they cannot widen
authorization. Legacy claims never confer Platform admin.

**Bug fixed in LOOP 3:** Orca previously granted whenever `products` contained `orca`
anywhere, then used *every* claimed organization as the ceiling. An entitlement held by one
org produced a ceiling covering all of them. Entitlement is now decided per organization.

## Claim staleness

Claims live in the access token, so a re-derivation reaches a live session only on refresh —
worst case one token lifetime (3600s observed). `synced_at` is stamped on every claim;
`assessClaimFreshness` in `apps/orca/lib/platform/entitlements.ts` reports FRESH/STALE/UNKNOWN
against the optional `PLATFORM_CLAIM_MAX_AGE_SECONDS`. Unset by default. The admin UI states
explicitly when a refresh is required and offers a refresh button.

## Verified end-to-end in a real browser

`/signin` → Platform home → organization → event → **Open Orca** → Orca `/platform-entry`
→ `/events/<canonical id>` rendering the same event. **No second login** (both apps share the
Platform Core authority and cookies ignore port), no duplicate event selection.

Denials proven: foreign event → `EVENT_OUTSIDE_AUTHORIZED_ORGANIZATION`; unknown event →
`EVENT_NOT_FOUND`; unentitled user hand-crafting the URL to their *own* event →
`PLATFORM_ENTITLEMENT_MISSING_PRODUCT`. The event id is a navigation hint, never authorization.

## Test fixtures in Platform Core — REMOVABLE, and blocking a real bootstrap

Every identity and registry row in Platform Core is a Phase 1 fixture. **There is no
production data.**

```text
platform-phase1-admin@signalthread.test        ADMIN of acme-events, PLATFORM ADMIN
platform-phase1-orga-member@signalthread.test  MEMBER of acme-events
platform-phase1-orgb@signalthread.test         MEMBER of globex-summits (no entitlement)
orca-phase3@signalthread.test                  MEMBER of acme-events (re-provisioned in LOOP 3)

organizations: acme-events, globex-summits
events:        acme-2026, globex-2026
entitlements:  acme-events/orca ACTIVE · globex-summits/orca SUSPENDED
```

Passwords are in `.local-secrets/` (gitignored); `orca-phase3`'s was lost when a session
scratchpad was cleaned.

`apps/platform/scripts/cleanup-test-fixtures.mjs` removes them (`--apply`; dry run by
default). **It deliberately refuses to run while the only Platform admin is a fixture**,
because deleting them would leave Platform Core with no administrator and no back door —
`requirePlatformAdmin` reads the canonical table. Provision a real admin first.

Production bootstrap must not depend on any of these rows.

# 21. NEXT EXACT TASK

## 21.0 First: provision a real Platform admin, then land both branches (blocking)

Platform Core currently has **no non-fixture administrator**. Before any production use:

1. Create a real Platform identity (a person, not `@signalthread.test`).
2. Insert them into `public.platform_admins` with the service role.
3. Run `node apps/platform/scripts/sync-claims.mjs <email>` so their claim carries
   `platform_admin: true`.
4. Only then run `apps/platform/scripts/cleanup-test-fixtures.mjs --apply`. It refuses
   until step 2 is done.

Then land `platform-monorepo-phase-1` and `platform-app-phase-1`, and create the separate
Vercel project for `apps/platform` per `docs/DEPLOYMENT_BOUNDARIES.md` §4b.

## 21.0a Then: land the monorepo (blocking, operational)

Monorepo Phase 1 is complete and verified on branch `platform-monorepo-phase-1`, **uncommitted**.
Before any Platform Core build-out:

1. Review and commit the branch, then open a PR.
2. On merge, immediately change the Vercel Root Directory `web` → `apps/orca` and confirm
   "Include files outside Root Directory" is enabled. **The old path no longer exists — the build
   fails until this is done.** Exact values in `docs/DEPLOYMENT_BOUNDARIES.md`.
3. Verify one green deploy and a live Platform Core → Orca login before starting anything else.
4. Only after that deploy is green, consider the deferred repository rename.

Everything below is the product work that follows.

---

Phase 3 is done. The identity, organization and event contracts are canonical and proven.
What is missing is **Platform Core as a product** — it is currently a bare Supabase project
plus per-user claims set by hand.

The next task is Platform Core build-out, in this order:

## 21.1 Platform Core organization + event registry (highest value)

Today Platform Core has no idea what an organization or an event *is*; it only stores uuids
inside a user's `app_metadata`. That does not scale past a test identity and gives no
Platform-side source of truth.

Build, in Platform Core:

```text
organizations         (id, name, slug, created_at)
organization_members  (organization_id, user_id, role)
events                (id, organization_id, name, starts_at)   <- mints canonical event_id
product_entitlements  (organization_id | user_id, product_key)
```

with RLS enabled. Then have the entitlement claim be *derived* from those tables rather than
hand-written, so `app_metadata` becomes a cache of a real record instead of the record itself.

**Constraint that must not be broken:** Orca still must not query Platform Core's database.
Claims stay the transport. Adding tables changes who *writes* the claim, not who reads it.

## 21.2 Systematic entitlement issuer

Keep `app_metadata.signalthread.products` in step with `product_entitlements` automatically
(database trigger, edge function, or admin service). Until this exists, granting Orca access
means running a script with a service-role key.

## 21.3 Platform launcher UI

**Not built.** The backend handoff contract is verified, but nothing in Platform Core renders
a "Open in Orca" button. Building it means: list the user's events, link each to
`{ORCA_URL}/platform-entry?event_id={id}`. No Orca change is required — the route already
validates everything.

## 21.4 Orca-callable invitation endpoint

Still absent (Phase 2 gated Orca's own invite route to 410). Needed before Orca can invite
anyone.

## 21.5 Optional cleanup, not blocking

```text
- drop User.orgId (NOT NULL + FK; needs a migration and a fixture sweep)
- retire the transitional email identity bridge once every user is linked
- fix the pre-existing type errors in apps/orca/prisma/seed.ts, then remove its
  tsconfig exclusion (it was never typechecked before the monorepo move)
- de-flake budget-group-active-summary / budget-filtered-export (order/state sensitive)
```

Completed by Monorepo Phase 1, LOOP 2 — no longer outstanding:

```text
- consolidate the duplicate prisma/ and web/prisma/ trees            DONE
- archive the 84-file legacy migration chain                         DONE
  -> apps/orca/test-fixtures/legacy-orca-migrations/ (23 test files read it as fixtures)
```

---

# 23. Overall Orca Migration Definition of Success

The broader Orca migration is complete when:

```text
User logs into SignalThread Platform once
        ↓
Platform identity is canonical
        ↓
Platform org/event/Orca entitlement are known
        ↓
Orca opens without second login
        ↓
Orca uses the same canonical organization/event IDs
        ↓
Orca-specific RBAC is enforced
        ↓
All Orca operational reads/writes stay in signalthread-orca
```

---

# 24. Automation / Stop Rebuilding Context Every Chat

Yes — the handoff process can be made much less annoying.

## Recommended workflow: one living handoff file

Keep **one canonical file in the repo**, for example:

```text
docs/PLATFORM_CORE_ORCA_HANDOFF.md
```

Do not generate a brand-new handoff document after every chat.

At the end of each meaningful engineering session, have the coding agent update that same file with:

```text
CURRENT STATE
LAST COMMIT
INFRASTRUCTURE STATE
WHAT CHANGED
TESTS
OPEN DECISIONS
NEXT EXACT TASK
DO-NOT-REOPEN DECISIONS
```

Then commit the handoff update with the implementation.

The first message of every new ChatGPT/coding session becomes:

```text
Read docs/PLATFORM_CORE_ORCA_HANDOFF.md in ~/Documents/orca-clean.
Treat it as the current project handoff.
Verify Git/current code before trusting stale details.
Continue from the NEXT section.
Do not redo completed phases.
```

That eliminates most manual copy/paste.

## Add this rule to every coding-agent prompt

```text
Before finishing this task:
1. Update docs/PLATFORM_CORE_ORCA_HANDOFF.md with the new verified state.
2. Replace stale NEXT steps rather than appending contradictory history.
3. Record the exact commit/test/infra state.
4. Never include secrets or env values.
5. Leave the handoff ready for a brand-new session to continue without chat history.
```

## Even better: make “handoff” a standard command

Use this convention with ChatGPT:

```text
handoff
```

Meaning:

> Update the single canonical project handoff with everything needed for a new chat: current repo/commit, completed work, verified infra, decisions, blockers, exact next task, useful files, and first commands. Do not create multiple overlapping handoff files.

This does not magically make every new model retain every old chat, but it makes the **repo itself** the durable engineering memory instead of relying on conversation history.

## Best source-of-truth hierarchy

For this project:

```text
1. Current code + live verified infrastructure
2. docs/PLATFORM_CORE_ORCA_HANDOFF.md
3. Current phase-specific verification docs
4. Chat history
```

The chat should never be the only place where a critical architecture decision or current infrastructure state exists.

---

# 25. Suggested First Message for the Next Chat

```text
Read docs/PLATFORM_CORE_ORCA_HANDOFF.md first, then verify it against current code and Git.

Phases 1-3 are COMPLETE. Do not redo them:
  - canonical identity, organization and event ids are adopted (no mapping tables)
  - Platform organization claims are authoritative
  - the Platform -> Orca event handoff is server-validated and proven end to end

Current state:
  repo   ~/Documents/orca-clean, branch main
  Orca DB          signalthread-orca          qgxvtgnzptepimuawnku  us-east-2
  Platform Core    signalthread-platform-core wtbnpeluwhjjqccdofxd  us-east-2

Your task is section 21 of the handoff: Platform Core build-out, starting with the
organization/event registry (21.1). Orca must still never query Platform Core's database.
```

---

# 26. Core Decisions Never to Lose

```text
1. Platform Core Supabase exists and is the auth/canonical identity authority.

2. signalthread-orca is a separate permanent operational Supabase/Postgres project.

3. Platform Core and Orca DB are both in us-east-2 (Ohio), but remain separate projects.

4. Platform Core owns users/orgs/events/access/entitlements.

5. Orca owns operational data and Orca-specific RBAC.

6. Orca does not directly connect to Platform Core Postgres.

7. User identity is Platform user_id via User.platformUserId, not email.

8. Platform organization_id should become Orca Organization.id.

9. Platform event_id should become Orca Event.id.

10. Do not create unnecessary permanent org/event mapping tables.

11. User.orgId should eventually stop being organization-access truth.

12. Keep EventMemberRole and Orca product permissions product-owned.

13. Legacy Orca auth concepts stay retired.

14. New Orca DB was built from a verified clean baseline, not legacy migration replay.

15. Do not replay or restore the old migration ledger.

16. Preserve product token signing independence from Supabase service-role keys.

17. Never commit env files/secrets.

18. Verify the database/project target before every mutation.

19. This is production Platform Core work, not the conference click-through prototype.

20. Orca is the reference implementation; Voice and LR come later.
```
