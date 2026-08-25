# Opus Prompt — SignalThread Monorepo Phase 1 (5-Loop Execution)

## Model
Opus

## Strength
High

---

# Mission

Convert the current SignalThread Orca repository into the safe foundation of the future SignalThread monorepo.

Working repository:

```text
~/Documents/orca-clean
```

Current branch:

```text
platform-monorepo-phase-1
```

This is a **five-loop gated implementation**.

Do not perform it as one uncontrolled mega-change.

Complete each loop, run its gate, and continue only if the loop is verified.

If a gate fails:

```text
STOP
report the failure
do not continue into the next loop
```

Do not commit automatically.

Do not push automatically.

---

# Read First

Before changing anything, read:

```text
docs/PLATFORM_CORE_ORCA_HANDOFF.md
docs/ORCA_CLEAN_DATABASE_BASELINE.md
docs/PLATFORM_CORE_MIGRATION_PHASE_1.md
docs/PLATFORM_CORE_MIGRATION_PHASE_2.md
```

Then inspect current Git and code.

Current code/live infrastructure wins over stale documentation.

---

# Current Architecture That Must Survive

Platform Core:

```text
Supabase project: signalthread-platform-core
Project ref:      wtbnpeluwhjjqccdofxd
Region:           us-east-2
```

Orca operational DB:

```text
Supabase project: signalthread-orca
Project ref:      qgxvtgnzptepimuawnku
Region:           us-east-2
```

Current verified Platform → Orca behavior:

```text
Platform Core Auth
→ canonical Platform user_id
→ canonical organization_id
→ canonical event_id
→ Orca entitlement
→ Orca EventMemberRole
→ Orca operational data
```

Do not change either database architecture.

Do not touch the legacy Orca DB.

---

# Global Architecture Rules

## Repository

```text
ONE monorepo
MULTIPLE apps
SHARED packages
```

## Runtime

Each app remains independent:

```text
apps/platform       → independent deployment
apps/orca           → independent deployment
apps/registration   → independent deployment
apps/housing        → independent deployment
apps/voice          → independent deployment
apps/lead-retrieval → independent deployment
```

## Database

Each product owns its operational DB.

No cross-product operational FKs.

No sibling product DB access.

## Imports

Target rule:

```text
apps/* may import packages/*
apps/* may NOT import another apps/*
```

If code is truly shared by multiple apps, it belongs in `packages/*`.

## Shared packages

Shared packages are code dependencies, not shared runtime services.

Do not accidentally create a new shared failure domain.

---

# Global Non-Goals

Do NOT build during these loops:

```text
apps/platform product implementation
Platform Core relational registry
Platform launcher UI
Registration
Housing
Voice migration
Lead Retrieval migration
shared UI extraction without a real second consumer
Orca redesign
new product features
new auth architecture
customer-data migration
```

This branch is structural.

---

# LOOP 1/5 — MOVE ORCA INTO APPS/ORCA

## Goal

Move the current application from:

```text
web/
```

to:

```text
apps/orca/
```

while keeping application behavior unchanged.

## Before moving

Inventory all path-sensitive tooling:

```text
root package.json
web/package.json
lockfile
Next.js config
tsconfig
eslint
postcss/tailwind
test configs
Playwright
Prisma configs
scripts
CI
GitHub Actions
Vercel configs
process.cwd() assumptions
hard-coded web/ paths
hard-coded prisma/ paths
docs/tooling paths
```

Search broadly for:

```text
web/
./web
../web
prisma/
./prisma
../prisma
process.cwd()
cwd:
working-directory:
```

Understand first, move second.

## Establish workspace root

Use the existing package manager and lockfile.

Do not switch package managers.

Create the minimum workspace configuration necessary.

The root becomes a workspace root, not another application.

## Move

Prefer Git-detectable moves/renames.

Move the actual Orca application into:

```text
apps/orca/
```

Update:

- configs;
- scripts;
- imports;
- tests;
- tooling paths;
- current working-directory assumptions;
- root workspace commands.

## Important Loop 1 restriction

DO NOT consolidate the duplicated Prisma trees yet.

They may be relocated mechanically as required by the app move, but do not decide/remove historical consumers during Loop 1.

The purpose of Loop 1 is to isolate path-move failures from Prisma-consolidation failures.

## Environment

Do not commit env files.

Moving the application may affect `.env.local` lookup.

Preserve current local/runtime env behavior deliberately.

Do not print secrets.

## Loop 1 gate

At minimum prove:

```text
Orca installs
Orca TypeScript works
Orca lint path works
Orca build works
critical Platform/Orca tests run from the new location
```

Explicitly verify the app now lives at:

```text
apps/orca
```

and no active runtime still requires `web/`.

### Verdict

Use:

```text
LOOP 1 VERIFIED
```

or stop with:

```text
LOOP 1 NOT VERIFIED
```

Do not proceed if not verified.

---

# LOOP 2/5 — CONSOLIDATE PRISMA

Begin only after Loop 1 passes.

## Goal

Establish:

```text
apps/orca/prisma/
```

as the **one active Orca Prisma tree**.

Current historical duplication originated as:

```text
prisma/
web/prisma/
```

Inspect the post-Loop-1 equivalent paths before changing anything.

## Requirements

Identify every consumer of:

- schema files;
- migration files;
- clean baseline;
- legacy migration fixtures;
- Prisma config;
- test scripts;
- seed scripts;
- generated client;
- migration-history regression tests.

## Canonical target

One active:

```text
apps/orca/prisma/schema.prisma
```

One active clean baseline:

```text
apps/orca/prisma/baseline/
```

Preserve:

```text
20260821120000_orca_clean_baseline
```

Do not alter its SQL unless a path-only/tooling necessity is proven.

Prefer checksum verification before/after.

## Legacy migration history

The old migration chain is not a reconstruction source.

However, tests historically inspect portions of it as fixtures.

If those files are still required:

- move them into an explicit historical/test-fixture location;
- update the tests;
- make it impossible to confuse them with active migration sources.

Example direction:

```text
test-fixtures/legacy-orca-migrations/
```

Use the cleanest equivalent supported by current repo structure.

## Delete active duplication

Once every consumer is accounted for, remove the second active Prisma schema/tree.

Do not maintain two authoritative schemas.

## Database safety

DO NOT:

```text
migrate legacy DB
db push live DB
replay legacy migration chain
modify Platform Core DB
change signalthread-orca schema
```

This is repository/tooling consolidation.

## Loop 2 validation

Run:

```text
prisma format
prisma validate
prisma generate
baseline tooling validation
schema-drift diagnostics where safe
Prisma-specific regression tests
native baseline tests where safe
```

Confirm:

```text
one active Prisma schema
one active clean baseline
legacy fixtures clearly historical
zero schema drift caused by restructure
```

### Verdict

```text
LOOP 2 VERIFIED
```

or stop.

---

# LOOP 3/5 — DEPLOYMENT ISOLATION

Begin only after Loop 2 passes.

## Goal

Make independent deployment boundaries explicit.

Orca must remain independently deployable even though it is inside a monorepo.

## Vercel

Inspect current Vercel integration/config.

Determine exact post-move configuration for Orca:

```text
Root Directory
Install Command
Build Command
Output behavior
workspace behavior
environment scoping
```

Preferred model:

```text
one Vercel project per app
```

Future:

```text
Platform Vercel project     → apps/platform
Orca Vercel project         → apps/orca
Registration Vercel project → apps/registration
Housing Vercel project      → apps/housing
```

Do not trigger production deploys automatically.

Do not change production dashboard configuration unless explicitly required and safely authorized.

If manual changes will be required after merge, document the exact values.

## Env isolation

Each application should receive only its own runtime env.

Do not create a giant shared product-secret namespace.

Orca's current variables must continue working.

Examples:

```text
DATABASE_URL
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY
NEXT_PUBLIC_PLATFORM_CORE_APP_URL
NEXT_PUBLIC_ORCA_APP_URL
PLATFORM_ENTITLEMENT_MODE
SPEAKER_INTAKE_TOKEN_SECRET
```

Do not revive:

```text
DIRECT_URL
DEFAULT_ORG_ID
legacy Orca NEXT_PUBLIC_SUPABASE_*
```

## Failure-domain rule

Document/enforce:

> A failure of one product application's deployment or operational database must not require another product application to fail.

Repo structure must not create direct runtime coupling.

## Loop 3 gate

Prove:

```text
Orca builds independently
Orca has a clear app-specific deployment root
Orca env ownership is app-specific
Orca operational DB remains signalthread-orca
Platform Core auth remains signalthread-platform-core
no sibling app runtime dependency exists
```

### Verdict

```text
LOOP 3 VERIFIED
```

or stop.

---

# LOOP 4/5 — MONOREPO GUARDRAILS

Begin only after Loop 3 passes.

## Goal

Create a repository that is difficult to misuse as more products arrive.

## Workspace commands

From root, establish clean commands such as:

```text
dev:orca
build:orca
test:orca
typecheck
lint
```

Use naming appropriate to the existing package manager.

Do not add Nx/Turborepo unless there is a concrete present need.

Prefer simple workspaces.

## Import boundaries

Establish or document/enforce:

```text
apps/* may import packages/*
apps/* may NOT import another apps/*
```

Use existing lint tooling if practical.

Do not add a large dependency just for this if a simple rule/check is enough.

## Packages

Create only the minimal `packages/` foundation needed for monorepo validity.

Do not prematurely move Orca components into `packages/ui`.

Shared extraction comes after `apps/platform` exists and there is genuine reuse.

## CI / automation

Inspect:

- GitHub Actions;
- test scripts;
- path assumptions;
- working directories;
- package filters.

Update them for the new layout.

CI may test multiple apps in the future, but runtime/deployments remain independent.

## Remove stale active web/ assumptions

Search again for stale runtime/tooling references to:

```text
web/
```

Historical docs may mention old paths and do not all need rewriting.

Active code/config/tooling must not rely on the old layout.

## Update engineering docs

Update:

```text
docs/PLATFORM_CORE_ORCA_HANDOFF.md
```

with the verified monorepo state.

Do not create a competing handoff file.

## Loop 4 gate

Prove:

```text
root workspace commands work
import boundaries are defined/enforced
CI/tool paths resolve
no active stale web/ dependency remains
handoff reflects new structure
```

### Verdict

```text
LOOP 4 VERIFIED
```

or stop.

---

# LOOP 5/5 — FINAL CLEANUP + FULL VERIFICATION

Begin only after Loop 4 passes.

## Goal

Prove the monorepo conversion did not change Orca behavior.

## Repository cleanup

Review:

- obsolete root Orca-only files;
- stale path artifacts;
- duplicate configs;
- duplicate package scripts;
- old directory remnants.

Do not delete historical evidence still required by tests.

## Repository name

The current GitHub repo is:

```text
SignalThread/SignalThread-Orca
```

This will eventually be a company monorepo.

Assess whether now is the safe time to rename it.

Before recommending/performing a rename, inspect impact on:

```text
git remotes
Vercel
GitHub Actions
deployment hooks
documentation
SSH aliases
external references
```

Do not rename automatically if doing so adds unnecessary operational risk.

If deferred, document the exact future rename step.

## Full validation

Run at minimum:

```text
Prisma validate
Prisma generate
TypeScript
lint
Phase 1 Platform tests
Phase 2 Platform tests
Phase 3 canonical-context tests
baseline/native integrity tests
journey tests
full test summary
production build
```

Known recent full-suite baseline:

```text
2609 pass
12 fail
7 skipped
```

If current main differs, compare to current main rather than blindly using those numbers.

Target:

```text
ZERO NEW FAILURES
```

## Critical behavior proof

Explicitly verify:

```text
Platform Core auth authority still resolves correctly

Orca DATABASE_URL still resolves to signalthread-orca

User.platformUserId resolution works

canonical org authorization works

/platform-entry works

canonical event handoff works

Orca entitlement works

EventMemberRole remains decisive

tampered org/event context still fails closed
```

Use real/local infrastructure only where safe.

Do not mutate legacy DB.

## Vercel final instructions

Produce exact post-merge deployment instructions.

Do not leave "update Vercel" vague.

State exact root/build settings needed.

## Final handoff

Update:

```text
docs/PLATFORM_CORE_ORCA_HANDOFF.md
```

with:

```text
new layout
canonical paths
workspace commands
Prisma location
historical migration fixture location
deployment boundary
Vercel settings
test results
repo-name decision
exact next task
```

Replace stale NEXT steps.

## Final gate

Use exactly:

```text
MONOREPO PHASE 1 VERIFIED
```

or:

```text
MONOREPO PHASE 1 NOT VERIFIED
```

---

# Expected Final Layout

Aim for approximately:

```text
repo/
├── apps/
│   └── orca/
│       ├── app/
│       ├── components/
│       ├── lib/
│       ├── src/
│       ├── prisma/
│       ├── scripts/
│       ├── public/
│       ├── package.json
│       └── app configs
│
├── packages/
│   └── minimal foundation only
│
├── test-fixtures/
│   └── legacy Orca migration history if still required
│
├── docs/
│   └── PLATFORM_CORE_ORCA_HANDOFF.md
│
├── package.json
└── workspace/root configs
```

Do not force this exact shape if current tooling gives a clearly better equivalent.

---

# Files / Secrets

Never commit:

```text
.env
.env.local
database credentials
Supabase keys
service-role keys
password files
```

At the end, scan changed files for secrets.

---

# Git

Do not commit.

Do not push.

At the end run:

```bash
git status
git diff --stat
git diff --check
```

---

# Final Response Format

Return:

```text
VERDICT:
MONOREPO PHASE 1 VERIFIED
or
MONOREPO PHASE 1 NOT VERIFIED

LOOP 1 — ORCA MOVE:
<result>

LOOP 2 — PRISMA:
<result>

LOOP 3 — DEPLOYMENT ISOLATION:
<result>

LOOP 4 — GUARDRAILS:
<result>

LOOP 5 — FINAL VERIFY:
<result>

NEW LAYOUT:
<tree>

ORCA PATH:
<path>

CANONICAL PRISMA:
<path>

CLEAN BASELINE:
<path>

LEGACY MIGRATION FIXTURES:
<path/status>

WORKSPACE:
<commands>

IMPORT BOUNDARIES:
<status>

VERCEL:
<exact Orca configuration required>

ENV:
<non-secret boundary summary>

DATABASES:
Platform Core: unchanged
Orca: unchanged
Legacy: untouched

PLATFORM → ORCA BEHAVIOR:
<verification>

TESTS:
<exact results>

REPO NAME:
<renamed / deferred + reason>

FILES CHANGED:
<list>

HANDOFF UPDATED:
yes/no

DEFERRED:
<list>

NEXT:
Create apps/platform, then build the real Platform registry and begin shared packages from genuine Platform + Orca reuse.
```

Do the work.

Do not stop after writing a plan.
Do not continue past a failed loop gate.
