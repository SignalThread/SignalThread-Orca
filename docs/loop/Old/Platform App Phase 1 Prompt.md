# Opus Prompt — SignalThread Platform App Phase 1 (5-Loop Execution)

## Model
Opus

## Strength
High

# Starting Context

Working repository:

```text
~/Documents/orca-clean
```

Expected branch:

```text
platform-app-phase-1
```

Read first:

```text
docs/LOOP_CONTROLLER.md
docs/PLATFORM_CORE_ORCA_HANDOFF.md
docs/DEPLOYMENT_BOUNDARIES.md
docs/PLATFORM_APP_PHASE1_PLAN.md
docs/PLATFORM_APP_PHASE1_PROMPTS.md
```

Current monorepo:

```text
apps/orca
packages/signalthread-ui
```

You are now creating:

```text
apps/platform
```

Do not redo the monorepo restructure.

## Required Inputs

Schema mode:

```text
OPEN for Platform Core only
ORCA SCHEMA LOCKED
```

Allowed scope:

```text
apps/platform
Platform Core registry schema
Platform-owned provisioning/claims
minimal shared contract changes required for Platform ↔ Orca compatibility
packages/signalthread-ui reuse
Orca claim-parser compatibility changes only when necessary
```

Out of scope:

```text
Orca feature work
Orca operational schema changes
Registration implementation
Housing implementation
Pulse migration
Lead Retrieval migration
billing
CRM
large design-system rewrite
custom auth replacement
legacy Orca DB
```

Canonical infrastructure:

```text
Platform Core Supabase:
signalthread-platform-core
wtbnpeluwhjjqccdofxd

Orca operational Supabase:
signalthread-orca
qgxvtgnzptepimuawnku
```

# Global Safety Rules

Before every Supabase mutation, positively identify the target project.

Platform migrations may only target:

```text
wtbnpeluwhjjqccdofxd
```

Never apply Platform registry SQL to:

```text
qgxvtgnzptepimuawnku
```

Never touch the legacy Orca database.

Never print secrets.

Never commit `.env.local`.

Never expose a service-role key to client code.

Do not commit or push automatically.

# Global Architecture Rules

Platform Core owns:

```text
Auth
canonical user identity
organizations
organization memberships
events
event memberships/access
product catalog
organization product entitlements
Platform admin authority
claim derivation
```

Product apps own:

```text
operational data
product workflows
product RBAC
product-local event membership/roles where required
```

Orca must remain able to operate independently of the Platform frontend.

Orca runtime must not synchronously query Platform Core Postgres for normal product requests.

No cross-database FKs.

# Claim Contract Rule

Do not ship the long-term authorization model as two independent flat arrays:

```text
organizations[]
products[]
```

because product access must be scoped to organization.

Implement or establish a structured org-scoped claim contract.

Preferred concept:

```json
{
  "signalthread": {
    "access": [
      {
        "organization_id": "...",
        "organization_role": "ADMIN",
        "products": ["orca"]
      }
    ]
  }
}
```

Do not put every event ID into the JWT.

If backward compatibility is temporarily required:

```text
structured claim wins
legacy flat claim is migration compatibility only
legacy format must never widen authorization
```

# LOOP 1/5 — PLATFORM APP + REAL LOGIN

Create the real Platform app at:

```text
apps/platform
```

Use the existing workspace/package manager.

Use `packages/signalthread-ui` for genuine shared primitives where appropriate.

Build at minimum:

```text
/signin
/signout
auth callback/session handling
authenticated application shell
/home
```

Connect exclusively to `signalthread-platform-core` for Auth.

Keep Platform Supabase Auth/API URL separate from Platform frontend URL.

Never treat `*.supabase.co` as the Platform frontend.

Inspect actual enabled auth providers before choosing the login flow.

Use existing Supabase SSR/browser patterns where appropriate.

Do not invent a custom auth protocol.

Prove:
- unauthenticated → `/signin`;
- valid login → authenticated shell;
- session survives navigation;
- logout clears session;
- invalid session fails closed;
- Platform frontend URL is not confused with Supabase project URL;
- Orca build/tests unaffected.

Gate:

```text
LOOP 1 VERIFIED
```

Only continue if real browser login works locally.

# LOOP 2/5 — PLATFORM CORE REGISTRY

Build the first canonical Platform relational model in `signalthread-platform-core`.

Use tracked Supabase SQL migrations in one canonical location associated with `apps/platform`.

Minimum registry:

```text
organizations
organization_memberships
events
event_memberships
products
organization_product_entitlements
platform_admins
```

Use production-quality UUIDs, FKs, uniqueness constraints, indexes, timestamps, status fields where justified, RLS, and policies.

Link Platform users to `auth.users.id` where supported/safe.

Do not copy Orca product RBAC into Platform Core.

Seed stable product keys at minimum:

```text
orca
registration
housing
pulse
lead-retrieval
```

Do not implement billing.

RLS must prove at minimum:
- member can read own org;
- member cannot read foreign org;
- member can read permitted events;
- member cannot mutate membership;
- member cannot grant entitlement;
- member cannot self-promote to Platform admin;
- cross-org access fails.

Before applying migration:
- verify target project ref;
- verify public schema state;
- verify migration status.

Do not run destructive reset commands.

Gate:

```text
LOOP 2 VERIFIED
```

Required:
- registry deployed to Platform Core;
- RLS verified;
- Orca DB unchanged.

# LOOP 3/5 — PROVISIONING + ORG-SCOPED CLAIMS

Replace manual `app_metadata` editing with canonical derivation.

Build server-side Platform services for:

```text
organizations
memberships
events
event memberships
products
entitlements
Platform admins
```

Keep route handlers thin.

Build one canonical claim builder from:
- auth user;
- active organization memberships;
- organization product entitlements;
- Platform admin authority.

Output structured org-scoped `app_metadata.signalthread` authorization context.

Do not authorize from `user_metadata`.

Claim synchronization must be deterministic, idempotent, server-only, and tested.

Use Supabase Admin API only from server-only code.

Handle/document token refresh after metadata changes.

Inspect current Orca Phase 2/3 claim parser.

Update it only as needed.

Requirements:
- product entitlement checked within organization context;
- structured claim authoritative;
- legacy compatibility cannot widen access;
- existing Phase 1/2/3 security tests remain green.

Security tests must prove:
- user in org A with Orca → Orca allowed in A;
- same user in org B without Orca → Orca denied in B;
- flat legacy product claim cannot widen B;
- wrong org denied;
- removed entitlement denied after refresh;
- foreign org denied;
- Platform admin claim derived only from canonical authority.

Gate:

```text
LOOP 3 VERIFIED
```

# LOOP 4/5 — PLATFORM ADMIN + EVENT PRODUCT LAUNCHER

Make Platform usable without manual Supabase editing.

Build a minimal production-quality Platform admin experience for authorized Platform admins.

Capabilities:
- create organization;
- manage organization memberships;
- create event;
- manage event memberships;
- enable/disable product entitlement;
- inspect effective access;
- sync/reconcile claims.

Do not build billing.

Authenticated Platform home should show authorized organizations, authorized events, and enabled products.

For an event with Orca enabled, render an Orca product action.

Target handoff:

```text
ORCA_APP_URL/platform-entry?event_id=<canonical-event-id>
```

Do not treat the event ID as authorization.

Orca must still enforce its existing validation.

Prove with a real controlled identity:

```text
/signin
→ Platform home
→ organization
→ event
→ Orca enabled
→ Open Orca
→ Orca platform-entry
→ canonical event
→ page renders
```

No second login.

No duplicate event selection.

Also prove denial paths.

Gate:

```text
LOOP 4 VERIFIED
```

# LOOP 5/5 — HARDENING + DEPLOYMENT READINESS

Run:
- Platform targeted tests;
- Platform RLS/security tests;
- claim tests;
- Orca Platform Core P1/P2/P3 tests;
- TypeScript;
- lint;
- Platform production build;
- Orca production build;
- relevant full test summaries.

Compare failures against current `main`.

Target:

```text
ZERO NEW FAILURES
```

Confirm:
- no env files staged;
- no service-role key in client code;
- no DB credentials committed;
- no password fixtures.

Document exact Vercel setup for Platform:

```text
same GitHub monorepo
Root Directory: apps/platform
independent Vercel project
target domain: app.signalthread.ai
```

Do not deploy automatically unless explicitly asked.

Document failure boundaries accurately:
- Platform frontend outage does not take Orca runtime down;
- Orca DB outage does not take Platform/other products down;
- central Auth is still shared;
- current Orca use of `auth.getUser()` means do not claim full offline-auth resilience yet.

Update the living handoff.

Final verdict:

```text
PLATFORM APP PHASE 1 VERIFIED
```

or:

```text
PLATFORM APP PHASE 1 NOT VERIFIED
```

# Hard Stops

Stop for human review if:
- target Supabase project cannot be positively verified;
- Platform schema design requires a material product decision not resolved by the plan;
- existing live Platform data conflicts with the proposed registry;
- a destructive migration would be required;
- Orca schema change appears necessary;
- structured claims cannot be made backward-compatible without widening authorization;
- login requires changing auth-provider policy not covered by the plan;
- tests reveal a real authorization regression;
- a shared package change would create runtime coupling between apps.

# Git

Do not commit.

Do not push.

At final stop show:

```bash
git status
git diff --stat
git diff --check
```

# Final Response Format

```text
VERDICT:
PLATFORM APP PHASE 1 VERIFIED / NOT VERIFIED

LOOP 1 — PLATFORM AUTH:
...

LOOP 2 — REGISTRY:
...

LOOP 3 — CLAIMS:
...

LOOP 4 — ADMIN + LAUNCHER:
...

LOOP 5 — HARDENING:
...

PLATFORM APP:
<path/routes>

PLATFORM CORE SCHEMA:
<tables/migrations>

RLS:
<summary>

CLAIM CONTRACT:
<shape/version/compatibility>

ADMIN:
<capabilities>

PLATFORM → ORCA:
<exact result>

AUTH FAILURE BOUNDARY:
<current verified reality>

TESTS:
<exact results>

DATABASES:
Platform Core: <changes>
Orca: schema unchanged
Legacy: untouched

VERCEL:
<exact setup>

FILES CHANGED:
...

HANDOFF UPDATED:
yes/no

DEFERRED:
...

NEXT:
...
```

Execute all five loops in order.

Do not continue past a failed gate.
Do not stop after writing another plan.
