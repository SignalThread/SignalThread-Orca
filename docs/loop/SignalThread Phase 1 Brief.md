# SignalThread Monorepo Phase 1 — Detailed Brief

**Date:** 2026-08-22  
**Working repo:** `~/Documents/orca-clean`  
**Current branch:** `platform-monorepo-phase-1`  
**Purpose:** Convert the current Orca-specific repository into the foundation of the SignalThread monorepo without changing product behavior, databases, auth semantics, or customer-facing functionality.

---

# 1. Why We Are Doing This Now

We have reached the right architectural inflection point.

The real Platform Core → Orca migration has already completed the hard backend foundation:

- Platform Core Supabase exists.
- Orca has a dedicated operational Supabase/Postgres project.
- Platform Core Auth and Orca operational data are separated.
- Platform user identity is canonical through `User.platformUserId`.
- Platform organization and event IDs have been proven as canonical IDs inside Orca.
- Platform → Orca login/context handoff works.
- Orca entitlement enforcement works.
- Orca-specific `EventMemberRole` remains product-owned.
- The clean Orca baseline is verified.
- The permanent `signalthread-orca` database is live and verified.

The next major product work is the real SignalThread Platform frontend and Platform Core registry.

Before we build that, we should fix the repository architecture so we do not create a second app next to a structurally awkward Orca app and then carry the mess into Voice, Lead Retrieval, Registration, Housing, and future products.

This phase is infrastructure and repository architecture work. It is intentionally **not** a Platform feature build.

---

# 2. The Core Monorepo Decision

SignalThread should use:

```text
ONE REPOSITORY
MULTIPLE INDEPENDENT APPLICATIONS
MULTIPLE INDEPENDENT OPERATIONAL DATABASES
SHARED PACKAGES
```

Target direction:

```text
SignalThread/
│
├── apps/
│   ├── platform/
│   ├── orca/
│   ├── registration/
│   ├── housing/
│   ├── voice/
│   └── lead-retrieval/
│
├── packages/
│   ├── ui/
│   ├── auth/
│   ├── platform/
│   ├── types/
│   └── config/
│
├── docs/
└── package.json
```

Only `apps/orca` is being established in this phase.

The other apps/packages should not be prematurely implemented.

---

# 3. Reliability and Failure Isolation

A monorepo does **not** mean one shared runtime.

Hard rule:

> Shared repository, independent applications, independent deployments, independent operational databases.

An Orca outage must not take Registration down.

A Registration deployment must not affect Housing.

Voice must not require Lead Retrieval to be healthy.

Target failure boundaries:

```text
apps/platform       → deployment A → Platform Core
apps/orca           → deployment B → Orca DB
apps/registration   → deployment C → Registration DB
apps/housing        → deployment D → Housing DB
apps/voice          → deployment E → Voice DB
apps/lead-retrieval → deployment F → LR DB
```

Shared packages are compile-time/code dependencies, not shared servers.

The only intentional shared authority is Platform Core for shared identity/access.

---

# 4. Current Infrastructure That Must Not Change

## Platform Core

```text
Project: signalthread-platform-core
Ref:     wtbnpeluwhjjqccdofxd
Region:  us-east-2
```

Purpose:

- Supabase Auth
- canonical Platform identity
- current claims transport
- future organizations/events/access/entitlement registry

## Orca

```text
Project: signalthread-orca
Ref:     qgxvtgnzptepimuawnku
Region:  us-east-2
```

Purpose:

- Orca operational PostgreSQL
- Orca-specific data
- Orca-specific RBAC
- Orca workflows

Do not merge these databases.

Do not move Orca operational data into Platform Core.

---

# 5. Current Repository Problem

Today the application is structurally awkward:

```text
repo/
├── web/
│   ├── app/
│   ├── lib/
│   ├── prisma/
│   ├── scripts/
│   ├── public/
│   └── package.json
│
├── prisma/
│   └── duplicated active Prisma material
│
├── docs/
└── ...
```

Problems:

1. The real app lives inside a generic `web/` folder.
2. There are two Prisma trees.
3. Root tooling has accumulated Orca-specific assumptions.
4. Future apps would be bolted awkwardly beside a special-case Orca layout.
5. Shared packages/design-system work would become harder to organize cleanly.
6. Deployment boundaries are not explicit in the repository structure.

We should fix this before `apps/platform` becomes a real application.

---

# 6. Target Layout

```text
repo/
│
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
│       ├── next.config.*
│       ├── tsconfig.json
│       └── app-specific configs
│
├── packages/
│   └── only minimal structure if actually needed
│
├── docs/
│   └── PLATFORM_CORE_ORCA_HANDOFF.md
│
├── package.json
├── lockfile
└── workspace/root configs
```

Principles:

- Orca lives under `apps/orca`.
- There is one active Orca Prisma schema.
- There is one active clean Orca baseline.
- The root becomes a workspace root, not an application.
- Future apps can be added cleanly.
- App deployments remain independent.

---

# 7. Why This Is a Five-Loop Job

This work has enough path/tooling risk that it should not be performed as one giant uncontrolled pass.

Each loop must:

1. make one coherent class of changes;
2. run its own verification;
3. stop if the gate fails;
4. continue only after the prior loop is healthy.

---

# 8. LOOP 1/5 — Move Orca

Goal:

```text
web/ → apps/orca/
```

Work:

- establish workspace root;
- move current Orca app;
- update imports and path assumptions;
- update TypeScript config;
- update Next config;
- update test paths;
- update scripts;
- update current working-directory assumptions;
- update package references;
- preserve local env loading behavior;
- prove Orca still builds/runs.

Important:

- do **not** consolidate Prisma yet;
- do **not** build Platform;
- do **not** change application behavior.

Gate:

```text
Orca runs/builds from apps/orca with zero new behavioral regressions.
```

---

# 9. LOOP 2/5 — Prisma Consolidation

Goal:

```text
ONE active Orca Prisma tree
```

Target:

```text
apps/orca/prisma/
```

Requirements:

- determine every consumer of both current trees;
- make `apps/orca/prisma` canonical;
- preserve the verified clean baseline;
- preserve legacy migration files still used as regression fixtures;
- move historical migration fixtures somewhere explicit if needed;
- remove duplicate active schema ownership;
- update Prisma configs/scripts/tests;
- prove zero schema drift;
- prove clean baseline remains reconstructible.

Do not replay legacy migrations.

Do not change either live database.

Gate:

```text
One active Prisma schema + one active baseline + zero DB drift + zero new test failures.
```

---

# 10. LOOP 3/5 — Deployment Isolation

Goal:

Make independent app deployment a repository-enforced reality.

For Orca:

- app-specific build boundary;
- app-specific env boundary;
- app-specific deployment config;
- app-specific DB configuration;
- app-specific Vercel/root-directory expectations.

Architecture rule:

```text
apps/* may not require another apps/* runtime to be healthy.
```

Do not centralize product secrets into a giant root runtime env.

Gate:

```text
Orca can be built/deployed independently from the monorepo root and remains isolated from future apps.
```

---

# 11. LOOP 4/5 — Monorepo Guardrails

Goal:

Make the repository hard to misuse.

Establish:

```text
apps/* may import packages/*
apps/* may NOT import another apps/*
```

Shared packages should eventually hold:

- reusable UI;
- shared auth helpers/contracts;
- canonical Platform types;
- shared configuration;
- utilities.

But do not prematurely extract Orca-specific code into packages just because `packages/` exists.

Other work:

- root workspace commands;
- lint/typecheck/test commands;
- CI path cleanup;
- stale `web/` assumptions cleanup;
- app boundary checks;
- documentation updates.

Gate:

```text
Repository commands work from root, app boundaries are enforceable, and no stale active web/ assumptions remain.
```

---

# 12. LOOP 5/5 — Final Cleanup and Verification

Goal:

Prove the new repo structure is production-safe.

Work:

- final root cleanup;
- review repository naming;
- decide whether GitHub repo should now be renamed from `SignalThread-Orca` to a broader SignalThread name;
- check Vercel/CI/remotes before any rename;
- full regression suite;
- production build;
- Platform Core → Orca login/context retest;
- Vercel deployment instructions;
- handoff update;
- final architectural review.

Gate:

```text
MONOREPO PHASE 1 VERIFIED
```

---

# 13. Hard Architecture Guardrails

## App imports

Allowed:

```text
apps/orca → packages/ui
apps/platform → packages/ui
apps/registration → packages/platform
```

Not allowed:

```text
apps/registration → apps/orca
apps/orca → apps/voice
apps/housing → apps/registration
```

If two apps need the same code, move the truly shared contract/code into `packages/*`.

## Database ownership

```text
Platform Core     → Platform Core DB
Orca              → Orca DB
Registration      → Registration DB
Housing           → Housing DB
Voice             → Voice DB
Lead Retrieval    → LR DB
```

No cross-product operational FKs.

No direct sibling DB reads/writes.

## Deployment ownership

Each app deploys independently.

A broken Orca deployment should not take Registration down.

## Shared package rule

`packages/*` contain reusable code, not hidden runtime services.

---

# 14. Current Phase 3 Behavior That Must Survive

Before this branch, Phase 3 proved:

```text
Platform login
→ canonical Platform user
→ canonical organization
→ canonical event
→ Orca entitlement
→ Orca EventMemberRole
→ event renders
```

Critical behavior:

- one Platform login;
- no second Orca login;
- no duplicate org selection;
- no duplicate event selection for Platform-launched event context;
- `User.platformUserId` is canonical;
- Platform org claims are an authorization ceiling;
- Orca `EventMember` remains event-level product access;
- Orca RBAC remains decisive;
- tampered org/event context fails closed;
- missing entitlement fails closed.

The restructure must not change any of this.

---

# 15. Current Platform Core Reality

Phase 3 discovered Platform Core currently has Supabase Auth, but **does not yet have the full relational registry** we had conceptually assigned to it.

Missing product work:

```text
organizations
organization memberships
events
event access
product entitlements
systematic claim issuance
```

Current verified server-controlled transport:

```text
app_metadata.signalthread
```

The monorepo restructure must not solve this.

That is the next product phase.

---

# 16. What We Should NOT Build During This Branch

Do not add:

- real `apps/platform` product implementation;
- Platform relational registry;
- Platform launcher UI;
- Registration;
- Housing;
- Voice migration;
- Lead Retrieval migration;
- shared UI extraction without a second consumer;
- Orca redesign;
- feature work;
- product data migration;
- new auth architecture.

---

# 17. Design System Timing

Do not extract a giant design system before a second application actually needs it.

Recommended sequence:

```text
1. finish monorepo foundation
2. create apps/platform
3. identify UI primitives shared by Orca + Platform
4. move those into packages/ui
5. grow the design system from real reuse
```

---

# 18. Repository Naming

Current GitHub repo:

```text
SignalThread/SignalThread-Orca
```

Once the monorepo contains more than Orca, that name becomes misleading.

Loop 5 should inspect whether it is safe to rename it.

Before renaming check:

- Git remotes;
- Vercel integration;
- CI;
- GitHub Actions;
- deployment hooks;
- local SSH aliases;
- documentation links.

Rename is optional if operational risk is higher than the benefit.

---

# 19. Testing Expectations

Known recent full-suite state:

```text
2609 pass
12 fail
7 skipped
```

The 12 failures matched the existing baseline.

Target:

```text
ZERO NEW FAILURES
```

Final checks should include:

- Prisma validate;
- Prisma generate;
- TypeScript;
- lint;
- Platform Phase 1 tests;
- Platform Phase 2 tests;
- Platform Phase 3 canonical-context tests;
- baseline/native-integrity tests;
- journey tests;
- full test summary;
- production build;
- Platform → Orca handoff smoke where safe.

---

# 20. Vercel / Deployment Expectations

Moving Orca from `web/` to `apps/orca/` changes deployment path assumptions.

The branch must determine:

- Vercel Root Directory;
- build command;
- install command if needed;
- env scoping;
- workspace handling.

Desired deployment model:

```text
one Vercel project per app
```

Example:

```text
SignalThread Platform Vercel → apps/platform
SignalThread Orca Vercel     → apps/orca
Registration Vercel          → apps/registration
```

This is essential to product failure isolation.

---

# 21. Environment Boundary

Do not commit env files.

Do not centralize all product secrets into one shared root file.

Each deployed application should receive only the env it needs.

Current Orca architecture examples:

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

---

# 22. Living Handoff

Canonical durable handoff:

```text
docs/PLATFORM_CORE_ORCA_HANDOFF.md
```

Each loop should update it when verified state materially changes.

The final loop must record:

- new monorepo layout;
- canonical Orca app path;
- canonical Prisma path;
- root workspace commands;
- deployment boundaries;
- Vercel path;
- tests;
- deferred work;
- exact next task.

Do not create another overlapping handoff.

---

# 23. Definition of Success

Monorepo Phase 1 succeeds when:

```text
Orca lives at apps/orca
```

and:

```text
one active Orca Prisma schema exists
one active clean Orca baseline exists
legacy migrations are clearly historical/test-only
root workspace commands work
Orca builds independently
Orca deploys independently
future app boundaries are explicit
apps cannot directly depend on sibling app runtime/code
Platform → Orca auth/context behavior is unchanged
Orca DB is unchanged
Platform Core is unchanged
zero new regressions
handoff is current
```

---

# 24. What Comes Immediately After

After this branch is verified and merged:

```text
Create apps/platform
```

Then build:

```text
Platform frontend
+
organizations registry
+
organization memberships
+
events registry
+
product entitlements
+
claim issuance derived from real Platform records
```

At that point begin genuine shared packages from actual reuse:

```text
packages/ui
packages/auth
packages/platform
packages/types
packages/config
```

---

# 25. Simple Mental Model

```text
ONE SIGNALTHREAD CODEBASE
        |
        +-- independent apps
        |
        +-- shared packages
        |
        +-- independent product DBs
        |
        +-- independent deployments
        |
        +-- central Platform identity/access
```

The monorepo creates shared engineering leverage.

It must **not** create shared product failure domains.
