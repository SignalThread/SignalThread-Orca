# SignalThread Platform App — Phase 1 Detailed Brief

**Working repo:** `~/Documents/orca-clean`  
**Branch:** `platform-app-phase-1`  
**Purpose:** Build the real SignalThread Platform application and the first production-grade Platform Core registry on top of the existing `signalthread-platform-core` Supabase project.

## 1. Current State

The monorepo foundation is complete and merged to `main`.

Current repository direction:

```text
repo/
├── apps/
│   └── orca/
├── packages/
│   └── signalthread-ui/
├── docs/
└── package.json
```

Current infrastructure:

```text
SignalThread Supabase
├── signalthread-platform-core
│   └── canonical Auth authority
└── signalthread-orca
    └── Orca operational PostgreSQL
```

Platform Core:
- name: `signalthread-platform-core`
- ref: `wtbnpeluwhjjqccdofxd`
- region: `us-east-2`

Orca:
- name: `signalthread-orca`
- ref: `qgxvtgnzptepimuawnku`
- region: `us-east-2`

The legacy Orca database remains historical reference only.

## 2. What Has Already Been Proven

The existing Orca integration already proves:

```text
Platform Core Auth
→ Platform user_id
→ Orca User.platformUserId

Platform organization_id
→ Orca Organization.id

Platform event_id
→ Orca Event.id

Platform entitlement
→ Orca authorization ceiling
→ Orca EventMember/EventMemberRole
→ Orca operational data
```

The Phase 3 backend handoff proved:
- one Platform-authenticated session can enter Orca;
- no second Orca login is required;
- canonical org/event IDs can be shared;
- Orca-specific RBAC remains product-owned;
- wrong org/event/tampered context fails closed;
- missing Orca entitlement fails closed.

However, that proof used controlled provisioning and server-controlled `app_metadata`.

There is **no real Platform frontend yet** and there is **no real Platform relational registry yet**.

## 3. Current Platform Core Reality

`signalthread-platform-core` currently provides Supabase Auth, but its application `public` schema is essentially empty.

The following canonical Platform capabilities still need to be built:

```text
organizations
organization memberships
events
event memberships/access
product catalog
organization product entitlements
Platform admin authority
systematic claim issuance
```

Current temporary claim transport has been:

```text
app_metadata.signalthread
```

Historically this used concepts similar to:

```text
products[]
organizations[]
events[]
```

That temporary flat model is not a sufficient long-term authorization contract.

## 4. Main Goal of Phase 1

Build:

```text
apps/platform
```

as the actual user-facing SignalThread front door.

Target experience:

```text
app.signalthread.ai
        ↓
/signin
        ↓
Platform Core Supabase Auth
        ↓
Platform Home
        ↓
organization + event context
        ↓
products available for that org/event
        ↓
Open Orca
        ↓
Orca validates canonical context
        ↓
event opens
```

This phase should produce a real Platform application, not another prototype.

## 5. Platform Frontend Responsibilities

`apps/platform` should own the user-facing Platform experience:

```text
/signin
/signout
/home
/organizations
/organizations/[organizationId]
/events
/events/[eventId]
/admin
/admin/users
/admin/organizations
/admin/events
/admin/products
```

Exact routes may vary if current framework conventions suggest cleaner equivalents.

The important capabilities are:
- real login/logout;
- authenticated shell;
- current user;
- current organization;
- event list;
- product availability;
- launch product;
- Platform administration/provisioning.

## 6. Platform Core Registry

Phase 1 should establish the first canonical relational registry.

Recommended minimum tables:

```text
organizations
organization_memberships
events
event_memberships
products
organization_product_entitlements
platform_admins
```

### Organizations
Canonical organization identity.

### Organization memberships
Canonical Platform-level user access to organizations.

Platform roles should be broad Platform roles, not Orca product roles.

### Events
Canonical event identity.

The Event UUID is the canonical SignalThread event ID that product apps adopt directly.

### Event memberships
Platform-level event visibility/access.

This determines which events Platform itself displays to a user.

It must **not** replace product-specific event membership/RBAC.

For Orca:

```text
Platform event membership
+
Orca EventMember
```

provide defense in depth.

### Products
Canonical product catalog.

Examples:

```text
orca
registration
housing
pulse
lead-retrieval
```

Keep stable machine keys separate from display names.

### Organization product entitlements
Which SignalThread products an organization is allowed to use.

Start with organization-level entitlement.

### Platform admins
Platform-wide administrative authority.

This becomes canonical Platform admin authority instead of hiding it in a product database.

## 7. Critical Claim-Model Improvement

Do **not** make the long-term claim model:

```text
organizations: [A, B]
products: [orca, registration]
```

because that can incorrectly imply Orca access in an organization where Orca is not entitled.

Authorization must be organization-scoped.

Preferred direction:

```json
{
  "signalthread": {
    "access": [
      {
        "organization_id": "...",
        "organization_role": "ADMIN",
        "products": ["orca", "registration"]
      },
      {
        "organization_id": "...",
        "organization_role": "MEMBER",
        "products": ["housing"]
      }
    ]
  }
}
```

Exact shape may be adjusted after current Orca claim parsing is inspected, but the invariant is mandatory:

> Product entitlement must be evaluated within organization context.

Do not put every event ID into the JWT.

Event lists can become large and change frequently.

Event access belongs in the Platform registry and product-local event authorization.

## 8. Backward Compatibility With Orca

Current Orca already consumes the Phase 3 claim format.

Platform Phase 1 must not simply break it.

Use a staged contract:

```text
new structured org-scoped claim
        +
temporary compatibility parsing/claims where required
        ↓
Orca updated and regression-tested
        ↓
legacy flat claim format retired later
```

Do not create an insecure transitional state where flat claims can widen authorization.

If both old and new claim formats are accepted during migration, the new structured claim must be authoritative when present.

## 9. Claim Issuance

Claims must be **derived from canonical registry records**.

Target:

```text
organization membership
+
organization product entitlement
+
Platform admin authority
        ↓
canonical claims builder
        ↓
auth.admin.updateUserById(...)
        ↓
app_metadata.signalthread
```

Do not hand-write arbitrary claims as the normal operating model.

The claim builder should be deterministic, idempotent, server-only, testable, and centralized.

## 10. Authentication

`apps/platform` is the real login UI.

It should authenticate against:

```text
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY
```

These point to `signalthread-platform-core`.

The Platform frontend URL is separate.

Local target:

```text
http://localhost:<platform-port>
```

Production target:

```text
https://app.signalthread.ai
```

The Supabase project URL must never be treated as the frontend URL.

## 11. Auth Failure-Domain Reality

Desired architecture:

```text
Platform frontend outage
→ product apps remain independently available

Orca outage
→ Registration/Housing/etc unaffected
```

Central Auth remains an intentional shared dependency.

Important current reality:

Orca currently uses Supabase `auth.getUser()` in canonical request resolution, which is a network verification call.

Therefore we should **not claim yet** that all existing sessions are completely independent of an Auth outage.

A later shared-auth hardening phase can evaluate local JWT verification, JWKS caching, token lifetime, refresh behavior, and graceful degradation.

Do not silently add a risky custom auth verifier in this Platform build.

## 12. Database Boundaries

Platform:

```text
apps/platform
→ signalthread-platform-core
```

Orca:

```text
apps/orca
→ signalthread-orca
```

Hard rules:
- no cross-database foreign keys;
- Orca runtime does not query Platform Core Postgres;
- Platform does not query Orca as canonical Platform truth;
- products remain independently deployable;
- shared code does not mean shared runtime.

## 13. RLS / Security

Platform Core tables should use RLS.

At minimum:
- users can see organizations they belong to;
- users can see events they are entitled to see;
- normal members cannot mutate organization membership;
- normal members cannot grant product entitlements;
- normal members cannot make themselves Platform admins;
- Platform admin operations require server-side authority;
- cross-org reads/writes are denied.

Use the Supabase service-role key only in server-only admin/provisioning code.

Never expose it to client bundles.

## 14. Shared Design System

The monorepo already contains:

```text
packages/signalthread-ui
```

and Orca genuinely consumes it.

`apps/platform` should use that package where appropriate.

Do not move every Orca component into the shared package.

Only common primitives should be shared.

## 15. Platform Shell

The Platform should feel like the SignalThread front door, not like Orca with a different logo.

Suggested shell:

```text
SignalThread logo
Organization context
Events
Products
Users/Admin where authorized
Account/profile
Sign out
```

Home should answer:
- What organizations can I access?
- What events can I access?
- Which SignalThread products are enabled?
- What should I open next?

Do not make the first Platform home a giant analytics dashboard.

## 16. Product Launcher

For a selected event, Platform should show entitled products.

For Orca, the launcher should use the verified handoff:

```text
ORCA_APP_URL/platform-entry?event_id=<canonical-event-id>
```

The event ID is still untrusted input to Orca.

The launcher does not bypass product authorization.

## 17. Controlled Seed/Test Data

Use controlled development records for the first real Platform flow.

Create:
- one Platform admin user;
- one organization;
- one organization membership;
- one event;
- one event membership;
- Orca product;
- one org-level Orca entitlement.

Use canonical UUIDs from Platform Core.

Do not invent a mapping table.

Seed/provisioning must be idempotent and safe.

Do not embed passwords/secrets in tracked files.

## 18. Platform Admin MVP

Phase 1 needs enough admin capability to stop manually editing Supabase metadata.

Minimum:
- create organization;
- add/remove organization membership;
- create event;
- add/remove event membership;
- enable/disable product entitlement;
- view resulting user access;
- trigger/perform canonical claim sync.

This can be an internal admin experience.

It does not need billing/CRM functionality.

## 19. Invitations

Platform Core should ultimately own staff invitations.

Current Orca invitation endpoint remains gated from Phase 2.

If a safe invitation flow can be completed inside the phase, implement it.

Otherwise keep Orca invitation disabled and clearly defer invitation UX/API.

## 20. Monorepo / Deployment Structure

Target repository:

```text
apps/
├── platform/
└── orca/

packages/
└── signalthread-ui/
```

Each app gets a separate Vercel project.

Platform:

```text
Git repo: same monorepo
Root Directory: apps/platform
Domain: app.signalthread.ai
```

Orca later:

```text
Git repo: same monorepo
Root Directory: apps/orca
Domain: orca.signalthread.ai
```

Do not couple deployments.

## 21. Testing Expectations

The Platform phase should add focused tests for:
- login/logout;
- auth callback/session;
- RLS/access boundaries;
- organizations;
- organization membership;
- events;
- event membership;
- product entitlements;
- claim derivation;
- claim synchronization;
- Platform admin authority;
- cross-org denial;
- product launcher;
- Orca handoff;
- old/new claim compatibility;
- tampering/fail-closed behavior.

Orca's existing Phase 1/2/3 auth/context regression suites must remain green.

## 22. Five-Loop Implementation Plan

### LOOP 1 — Scaffold Platform + Real Auth

Create `apps/platform`.

Build:

```text
/signin
/signout
auth callback/session plumbing
authenticated shell
basic home
shared UI package consumption
```

Gate:

```text
real browser login works locally
authenticated shell renders
logout works
no Supabase-URL-as-frontend bug
Orca unchanged
```

### LOOP 2 — Platform Core Registry Schema

Create tracked Supabase migrations for:

```text
organizations
organization_memberships
events
event_memberships
products
organization_product_entitlements
platform_admins
```

Add keys, constraints, indexes, timestamps, RLS, and policies.

Gate:

```text
registry exists
RLS tests pass
cross-org access denied
Orca DB untouched
```

### LOOP 3 — Provisioning + Claims

Build server-side Platform services and structured org-scoped claim derivation/sync.

Update Orca claim parsing safely if required.

Gate:

```text
real registry records derive claims
claim sync is deterministic
org/product scoping is correct
no cross-org entitlement widening
Orca regression suites green
```

### LOOP 4 — Platform Admin + Product Launcher

Build:
- organization/event administration;
- user membership management;
- product entitlement management;
- event/product launcher;
- Open in Orca.

Gate:

```text
signin
→ Platform home
→ event
→ Open Orca
→ same session/context
→ event renders
```

### LOOP 5 — Hardening + Deployment Readiness

Run full tests/build/security/env/deployment review.

Document exact Vercel setup for:

```text
apps/platform
```

Update the living handoff.

Gate:

```text
PLATFORM APP PHASE 1 VERIFIED
```

## 23. Schema Mode

For this phase:

```text
OPEN
```

but only for **Platform Core** schema work described in the plan.

The Orca operational schema is:

```text
LOCKED
```

No destructive Platform migration without explicit review.

## 24. Definition of Success

Phase 1 succeeds when:
- `apps/platform` exists;
- real `/signin` works;
- Platform Core owns persisted orgs/memberships/events/event memberships/products/entitlements/admin authority;
- claims are derived from registry records;
- product entitlement is scoped to organization;
- Platform home shows authorized orgs/events/products;
- Open Orca launches canonical event context;
- Orca independently re-validates access/RBAC;
- Platform and Orca remain separate deployments/DBs;
- no manual app_metadata editing is required for normal provisioning.

## 25. What Comes After

After Platform Phase 1:

```text
shared auth hardening
invitation workflow
packages/platform contracts
packages/auth
further packages/ui extraction
deploy new Orca canonical app
Registration integration
Housing integration
Pulse migration
Lead Retrieval migration
```

The Platform app becomes the reference front door for all future SignalThread products.
