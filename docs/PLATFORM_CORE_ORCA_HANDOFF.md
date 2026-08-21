# SignalThread Platform Core → Orca Migration — Next Chat Handoff

**Date:** 2026-08-21  
**Scope:** Real production Platform Core + Orca migration only  
**Explicitly excluded:** Housing, Registration, conference click-through prototype, Lead Retrieval migration, Voice migration

---

# 1. Executive State

We have completed the Orca repository cleanup, Platform Core auth foundation/cutover, legacy database truth audit, clean database baseline, and provisioning/verification of a brand-new permanent Orca operational Supabase project.

Current milestone state:

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

→ NEXT: Phase 3 — canonical Platform organization/event ID adoption
→ THEN: Platform → Orca context handoff
→ THEN: end-to-end Platform login → Orca workflow
```

The next chat should **not** redo the database audit or baseline work.

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
web/prisma/baseline/20260821120000_orca_clean_baseline/migration.sql
```

Mirror:

```text
prisma/baseline/20260821120000_orca_clean_baseline/migration.sql
```

Canonical Prisma schema:

```text
web/prisma/schema.prisma
```

Mirror:

```text
prisma/schema.prisma
```

Baseline config:

```text
web/prisma.baseline.config.ts
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
web/lib/platform/identity.ts
web/lib/request-user.ts
web/src/lib/supabase/auth-authority.ts
web/src/server/security/product-token-secrets.ts
web/scripts/backfill-platform-user-ids.ts
```

Tests:

```text
web/lib/platform-core-auth-boundary-regression.test.ts
web/lib/platform-core-authorization-boundary-regression.test.ts
web/lib/platform-core-identity-regression.test.ts
web/lib/platform-core-token-signing-regression.test.ts
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
web/lib/platform/entitlements.ts
web/lib/platform/entry.ts
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

# 11. Immediate Next Task — Phase 3

The next engineering job is:

# Canonical Platform Organization + Event ID Adoption

Do this before building the full Platform launcher/handoff flow.

## Phase 3 goals

1. Inspect actual Platform Core schema/data contracts for:
   - canonical users
   - organizations
   - organization membership
   - events
   - event access
   - product entitlements

2. Identify/create controlled Platform test identities:
   - Platform user
   - Platform organization
   - Platform event
   - Orca entitlement/access

3. Seed/provision matching Orca shell/product records using **the exact same IDs**:
   - `User.platformUserId = Platform user_id`
   - `Organization.id = Platform organization_id`
   - `Event.id = Platform event_id`

4. Make Platform organization context authoritative only after the ID spaces are actually aligned.

5. Make Platform event context authoritative through an explicit validated handoff contract.

6. Begin retiring redundant Orca tenancy assumptions:
   - especially `User.orgId` as access truth

7. Keep Orca-specific RBAC:
   - `EventMemberRole`
   - other Orca product permissions

8. Prove authorization boundaries:
   - valid Platform user + Orca entitlement + org/event access works
   - wrong org fails
   - wrong event fails
   - missing Orca entitlement fails
   - authenticated-but-unprovisioned identity fails
   - client-tampered org/event IDs fail

---

# 12. Phase 3 Non-Goals

Do not turn Phase 3 into unrelated cleanup.

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

# 14. `User.orgId` Target

Long-term target:

> `User.orgId` should not be the source of organization-access truth.

Organization membership belongs to Platform Core.

Retire `User.orgId` carefully after finding every runtime dependency.

Do not remove it just because the architecture says it should disappear.

Phase 3 should:

1. inventory reads/writes/assumptions;
2. replace access decisions with Platform context;
3. preserve any legitimate product-local use temporarily if necessary;
4. add regression coverage;
5. remove only when proven safe.

---

# 15. Entitlement State

Phase 2 implemented entitlement checking.

Current target architecture:

```text
Platform Core issues server-controlled Orca entitlement
→ verified auth state carries it
→ Orca fails closed without it
```

There may still be work needed on the **systematic entitlement issuer**.

Do not mistake an available metadata mechanism for a fully finished entitlement-management product.

Phase 3 should determine what minimum Platform-side provisioning is required to create a real end-to-end Orca test identity.

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

There are still two mirrored Prisma trees:

```text
prisma/
web/prisma/
```

`web/prisma` is the canonical web runtime/generation path.

The clean baseline is mirrored into both because other tooling/tests still consume the root copy.

Do not casually delete the root tree.

Deferred cleanup:

```text
duplicate Prisma-tree consolidation
legacy migration fixture/archive cleanup
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
```

Legacy schema audit, if still needed as historical evidence:

```text
~/Documents/God Emperor of Dune /planner-os/docs/ORCA_LEGACY_DB_SCHEMA_TRUTH_AUDIT.md
```

Important current files:

```text
web/lib/platform/identity.ts
web/lib/request-user.ts
web/lib/platform/entitlements.ts
web/lib/platform/entry.ts
web/lib/platform/invitations.ts

web/src/lib/supabase/auth-authority.ts
web/src/server/security/product-token-secrets.ts

web/app/(public)/login/
web/app/auth/callback/route.ts
web/app/(shell)/_components/logout-button.tsx

web/prisma/schema.prisma
web/prisma/baseline/20260821120000_orca_clean_baseline/migration.sql
web/prisma.baseline.config.ts
```

---

# 20. Tests / Known Baseline

Prior Platform Core focused tests were clean.

Permanent DB provisioning confirmed:

```text
Prisma validate                       pass
Prisma generate                       pass
Prisma migrate status                 up to date
Prisma migrate diff                   zero drift
native integrity                      pass
application smoke                     pass
```

The clean-baseline phase full suite reported:

```text
2593 pass
12 fail
7 skipped
```

Those 12 failures matched the known existing main baseline and were not introduced by the clean baseline.

Do not automatically treat the same baseline failures as Phase 3 regressions.

Compare against `main`.

---

# 21. Recommended First Actions in the Next Chat

Do these in order.

## Step 1 — Verify Git

```bash
cd ~/Documents/orca-clean
git status
git branch --show-current
git rev-parse --short HEAD
git rev-parse --short origin/main
git diff --stat
git diff --check
```

Resolve/commit the expected pending database-verification documentation update if still present.

## Step 2 — Verify infrastructure identity

Confirm the intended projects before any action:

```text
Platform Core: signalthread-platform-core
Orca DB:       signalthread-orca
```

Do not print secrets.

## Step 3 — Have the coding agent audit Phase 3 dependencies

Before implementation, inventory:

```text
Organization.id
Event.id
User.orgId
User.platformUserId
Membership
EventMember
current event/org selection
Platform claims parsing
arePlatformOrganizationClaimsAuthoritative()
Platform entitlement checks
login callback
Platform return-to/context handling
```

The audit should be targeted and immediately feed implementation; do not create another giant architecture archaeology project.

## Step 4 — Implement canonical IDs

Use the fresh empty DB to adopt Platform organization/event IDs directly.

## Step 5 — Test Platform → Orca identity/context

Prove happy path and failure paths.

---

# 22. Definition of Phase 3 Success

Phase 3 succeeds when:

```text
Platform user_id is the canonical authenticated identity
        ↓
Orca User.platformUserId matches it

Platform organization_id
        ↓
Orca Organization.id matches it

Platform event_id
        ↓
Orca Event.id matches it

Platform access + Orca entitlement validated
        ↓
Orca-specific EventMemberRole validated
```

And:

```text
wrong organization → rejected
wrong event → rejected
missing entitlement → rejected
unknown Platform identity → rejected
tampered client context → rejected
```

No duplicate local canonical org/event IDs.

No email identity matching.

No `DEFAULT_ORG_ID`.

No direct Platform DB dependency in Orca runtime.

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
We are continuing the real SignalThread Platform Core → Orca migration.

The canonical repo is:
~/Documents/orca-clean

Read the current handoff and current code before doing anything:
docs/PLATFORM_CORE_ORCA_HANDOFF.md

We have completed Platform Core Phase 1/2, the legacy DB audit, clean baseline, and the permanent signalthread-orca operational database.

The next phase is canonical Platform organization/event ID adoption.

First verify Git and the handoff against current code. Do not redo previous phases, do not touch the legacy Orca DB, and do not start Voice/LR/Housing/Registration work.
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
