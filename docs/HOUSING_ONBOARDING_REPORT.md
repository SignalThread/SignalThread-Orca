# Housing Integration — Onboarding Report

**Status:** Read-only analysis complete  
**Date:** 2026-09-10  
**Repository state:** on `dev` branch, verified clean

---

## Executive Summary

The SignalThread Housing integration is a well-documented, contract-driven implementation of a new product app in a multi-product monorepo. Housing will follow the proven patterns established by **Lead Retrieval** and **Pulse** (the two "own-authority" reference implementations), implementing a single, audited contract with Platform Core while remaining completely independent at runtime.

**The work is bounded and fully designed.** The Platform handoff contract is finished and tested. The domain model is proposed but unimplemented. The infrastructure prerequisites (Supabase project, Vercel project, DNS) are marked for Ali to provision. Housing can proceed immediately to Phase 2 (skeleton + mapping columns) with confidence that the integration path is known.

---

## 1. Repository Architecture and App Boundaries

### 1.1 The Failure-Domain Rule (Foundational)

> **A failure of one product application's deployment or operational database must not require another product application to fail.**

This is the authoritative constraint from which everything derives. It is audited and verified to be true:

| Scenario | Actual Effect | Evidence |
|---|---|---|
| Platform frontend outage | Products keep serving | Products import nothing from `apps/platform`, never query Platform Core's Postgres directly |
| A product outage | Platform and every other product unaffected | Platform renders launcher links; dead links degrade gracefully |
| Platform Core Postgres outage | Products keep serving existing sessions | Authorization rides in JWT claim, not live query |
| **Platform Core Auth outage** | **Shared blast radius** | New sign-ins fail everywhere; this is intentional, currently unmitigated |

The last row is **deliberately accepted** as a shared dependency that has not been hardened. It would require local JWT verification with JWKS caching — a separate, deferred hardening phase.

**For Housing:** Never query another app's database directly. Never import from another app. Never hold Platform Core's service-role key. Communicate only through published HTTP contracts.

### 1.2 Repository Layout

```
signalthread/ (monorepo, one GitHub repo)
├── apps/
│   ├── orca/              Next.js · Prisma · own Postgres (signalthread-orca)
│   ├── platform/          Next.js · Supabase JS · Platform Core (shared)
│   ├── pulse/             Next.js · Prisma · own Postgres + own Supabase Auth
│   ├── lead-retrieval/    Next.js · Supabase JS · own Supabase project ← REFERENCE
│   ├── housing/           ← YOU WILL CREATE THIS
│   └── registration/      (future)
├── packages/
│   └── signalthread-ui/   Shared design system, @signalthread/ui
├── docs/
│   ├── DEPLOYMENT_BOUNDARIES.md
│   ├── housing-handoff/   (10 documents)
│   └── ...
├── scripts/
│   ├── check-import-boundaries.mjs (enforced, runs on boundaries)
│   └── demo-seeding/
└── package.json (npm workspaces root)
```

npm workspaces hoist shared dependencies to the repo root. Each app can pin conflicting versions locally (Lead Retrieval pins `next@16.1.6`, `react@19.2.4`). Workspace-aware install: `npm install` from the repo root.

### 1.3 Import Boundaries (Enforced, Not Advisory)

```
apps/*     MAY import packages/*
apps/*     MUST NOT import another apps/*
packages/* MUST NOT import apps/*
```

**Enforced by:** `npm run boundaries` — walks every `.ts/.tsx/.js/.jsx` file in every workspace, checks both relative imports and bare specifiers. Deliberately dependency-free (no npm required). Runs as `node scripts/check-import-boundaries.mjs`.

**Why:** If Housing could import Lead Retrieval, a build or runtime failure in Lead Retrieval becomes a failure in Housing — exactly the coupling the failure-domain rule forbids.

**For Housing:** Keep all Housing-specific code inside `apps/housing/`. Share nothing with other apps. If you need to share something, put it in `packages/*` (pure/presentational) or expose it as an HTTP contract (data/behavior).

### 1.4 Deployment Model

One Vercel project per application, all from the same GitHub monorepo with different Root Directories:

| Application | Root | Production Domain | Status |
|---|---|---|---|
| Orca | `apps/orca` | `orca.signalthread.ai` | Active |
| Platform | `apps/platform` | `app.signalthread.ai` | Project not yet created |
| Pulse | `apps/pulse` | `voice.signalthread.ai` | Workspace ready, Vercel project pending |
| Lead Retrieval | `apps/lead-retrieval` | `lr.signalthread.ai` | Pre-cutover |
| **Housing** | `apps/housing` | `housing.signalthread.ai` *(proposed)* | **To create** |

**Critical Vercel settings for monorepo apps:**
- Root Directory: `apps/housing`
- **Include files outside Root Directory:** ENABLED (lockfile and hoisted `node_modules` at repo root)
- Install Command: *leave default* (Vercel detects workspace; do NOT use `npm ci` — fails when run inside `apps/housing` with no lockfile)
- Build Command: *leave default* (`next build`)
- Node version: 20.x or later

**There is no CI yet.** Validation runs locally before merge. If you want CI for Housing (boundaries + typecheck + lint + test on PR), propose it to Ali.

---

## 2. Platform Core: The Shared Authority Layer

### 2.1 What Platform Core Owns

Platform Core is a **single Supabase project** (`wtbnpeluwhjjqccdofxd`, `signalthread-platform-core`) that is the **only thing all products share**. It is authoritative for:

| Responsibility | Table(s) |
|---|---|
| User identity (who a person is) | `auth.users` (Supabase Auth) |
| Organizations (customers) | `organizations` |
| Events (canonical records) | `events` |
| Organization ↔ user membership | `organization_memberships` |
| Product catalog | `products` |
| Product entitlements (has org bought Housing?) | `organization_product_entitlements` |
| Platform admins | `platform_admins` |

**Housing's responsibility:** Everything else. Housing's own users, organizations, events, RBAC, workspace behavior — entirely Housing's domain.

### 2.2 The Three Canonical IDs Housing Will Receive

When a user launches Housing from Platform, the claim endpoint returns exactly these:

```json
{
  "platform_user_id": "<uuid>",      // ← User's identity in Platform Core
  "organization_id": "<uuid>",       // ← Organization owning the event
  "event_id": "<uuid>",              // ← The event being launched
  "product": "housing"
}
```

**Housing stores these as opaque UUID columns** on its own rows (`housing_users.platform_user_id`, `<org-table>.platform_organization_id`, `housing_events.platform_event_id`). **Never as foreign keys** — the databases are separate Postgres instances and a cross-database FK is impossible and would couple failure domains.

### 2.3 Key Platform Core Constraints

- **Event dates are unreliable.** `events.starts_at` and `events.ends_at` are frequently NULL in practice. Housing almost certainly needs dates for room-block ranges, so **Housing must own its own event dates** and treat Platform's as an optional hint.
- **Timezone column is not applied live.** The migration exists (`20260907120000_platform_core_event_venue_timezone.sql`) but is committed but unapplied. Housing should carry its own `timezone` column for hotel nights (local-date concept).
- **Launch authorization is org-membership + entitlement only.** `event_memberships` is NOT consulted. Per-event and per-role gating is Housing's job.
- **All writes go through service-role server code.** RLS is enabled and forced on every table; `anon` is revoked; no user can grant themselves entitlements or memberships through the data API.

**Live data (as of 2026-09-10):** 7 organizations, 9 events, 11 org memberships, 9 event memberships, 10 entitlements. Two pilot orgs (hand-made), five generated by demo-seeding framework. For realistic multi-org data, use `scripts/demo-seeding/` — it provisions Platform Core records deterministically and is the supported way.

---

## 3. Authentication and Identity Model

### 3.1 Two Authority Models

Every product declares one authority in Platform's registry:

| Authority | Meaning | Products |
|---|---|---|
| `platform-core` | Product authenticates against Platform Core Auth. Session IS the Platform identity. | Orca |
| `own` | Product owns separate Supabase Auth. Must never hold Platform Core session. | Pulse, Lead Retrieval |

**Housing will be `own`.** Reasons (in order of weight):

1. **Blast radius.** A compromise of Housing cannot yield a Platform Core session.
2. **Pattern proven twice.** Pulse and Lead Retrieval both use this; it works.
3. **Non-Platform users.** Hotel contacts, sub-block coordinators, exhibitor owners may be Housing users with no Platform Core identity.
4. **Independent lifecycle.** Housing can change its own auth (SSO for hotels, service accounts for imports) without Platform Core migration.

**This needs Ali's confirmation before schema design.**

### 3.2 Session and Cookie Contract (Must Follow Exactly)

| Property | Value | Why |
|---|---|---|
| `Path` | `/` | Standard |
| `SameSite` | `Lax` | Standard |
| `Domain` | **none (host-only)** | Never `.signalthread.ai` — shared JS-readable cookie across all subdomains turns one XSS anywhere into a platform-wide session |
| `Secure` | `true` when app's own URL is HTTPS | Derived from `NEXT_PUBLIC_SITE_URL`, not `NODE_ENV` |
| `HttpOnly` | **`false`** | Required by Supabase browser client (reads session from `document.cookie` for refresh). Deferred hardening, not oversight. |
| Lifetime | **400 days** (Supabase default) | Unchanged deliberately; shortening needs reasoning and tests. |

**Set and remove use identical scope** — sign-out clears exactly what sign-in wrote.

**Housing must follow this contract exactly.** Do NOT introduce a parent-domain cookie "to make SSO simpler." SSO is already solved by the handoff protocol; a shared cookie undoes the containment.

### 3.3 The Handoff Primitive

Platform uses `auth.admin.generateLink({ type: "magiclink" })` to create one-time tokens:

- **Single-use** — verified live; replayed token rejected
- **Short-lived** — GoTrue OTP expiry + tighter freshness bound at claim time
- **Supabase-native** — no custom JWT signing, no hand-rolled crypto
- **Scoped to one user** — resolved server-side from verified session, never from caller
- **Carries no password or service-role credential**

The generated `action_link` is **discarded**. Only the token travels, and Platform builds the destination itself — Supabase's redirect allowlist is NOT involved, and no caller can choose where credential lands.

**Housing uses the same primitive internally** to establish a session for a mapped local user: `admin.getUserById(id)` → `admin.generateLink()` → `verifyOtp(token_hash)` with the **anon** key on a request-scoped SSR client.

**Critical discipline:** *Email is transport for the OTP, not identity.* The Auth user is looked up by id first; the address is that user's own, read back from Auth, never supplied by a caller. `generateLink` reports which user it minted for and the function refuses to continue unless id matches. The established session's user id is checked again after `verifyOtp`.

---

## 4. The Launch Handoff Contract

**This is the ONE contract Housing must implement.** Everything else about Housing is Housing's own business.

### 4.1 The 7-Hop Chain (Verified Real, 2026-09-09)

```
hop 1  303  :3001/api/launch/housing?event_id=<uuid>
       Platform authorization decision + one-time token minted
       
hop 2  303  :3004/platform-entry?handoff=<token>&event_id=…
       Housing sees token, no proof this browser started it → discard
       
hop 3  303  :3004/platform-entry/start?event_id=…
       Housing arms the browser: set nonce in HttpOnly cookie
       
hop 4  303  :3004/platform-entry/start?event_id=…&armed=1
       Housing reads cookie, builds correlator = SHA-256(nonce)
       Redirects to Platform with correlator
       
hop 5  303  :3001/api/launch/housing?event_id=…&state=<correlator>
       Platform verifies correlator matches what it relayed
       Mints FRESH token, echoes correlator back
       
hop 6  303  :3004/platform-entry?handoff=<NEW token>&event_id=…&state=<correlator>
       Housing verifies correlator matches its own cookie
       Only then redeems the token
       
hop 7  200  :3004/<workspace>?eventId=<housing-local-event-id>
       Housing session established in Housing Auth
       No Platform Core credential anywhere
```

**Why seven hops?** Hops 3–5 are **browser binding**. Without them, a leaked launch URL is a login-CSRF / session-replacement vector. User A sends a valid handoff URL to user B, and B's browser silently becomes A. The browser binding prevents that.

### 4.2 Platform-Side Changes (3 Small Edits, All in One File)

All work in `apps/platform/lib/server/product-registry.ts`. **No new authorization or handoff code required.** `authorizeProductLaunch` is product-agnostic and asserted by a test that **fails if product-specific logic appears**.

#### 2a. Register Housing in PRODUCT_APP_URL_ENV

```typescript
const PRODUCT_APP_URL_ENV: Record<string, readonly string[]> = {
  orca: ["ORCA_APP_URL", "NEXT_PUBLIC_ORCA_APP_URL"],
  pulse: ["PULSE_APP_URL", "NEXT_PUBLIC_PULSE_APP_URL"],
  "lead-retrieval": ["LEAD_RETRIEVAL_APP_URL", "NEXT_PUBLIC_LEAD_RETRIEVAL_APP_URL"],
  housing: ["HOUSING_APP_URL", "NEXT_PUBLIC_HOUSING_APP_URL"],   // ← add
};
```

Server-only name first, deliberately. Product base URL is server-side only. `NEXT_PUBLIC_*` values are inlined at compile time; keeping it secondary makes it awkward to vary per environment.

#### 2b. Declare Housing's Auth Authority

```typescript
const PRODUCT_AUTH_AUTHORITY: Record<string, ProductAuthAuthority> = {
  orca: "platform-core",
  pulse: "own",
  "lead-retrieval": "own",
  housing: "own",                    // ← add
};
```

#### 2c. Add Housing to buildProductReturnPath

```typescript
export function buildProductReturnPath(productKey: string, eventId: string): string {
  if (productKey === "orca" || productKey === "pulse" ||
      productKey === "lead-retrieval" || productKey === "housing") {   // ← add
    return `/platform-entry?event_id=${encodeURIComponent(eventId)}`;
  }
  return "/";
}
```

### 4.3 Platform's Authorization Decision (No Changes)

`authorizeProductLaunch` in `apps/platform/lib/server/product-launch.ts` is **product-agnostic**. It runs **before a token exists** — the security property. A handoff is a bearer credential for a real session; issuing one to an unauthorized user makes the launcher an entitlement bypass. The decision runs to completion before any credential is minted.

The actual decision is `decideProductLaunch` in `lib/server/launch-decision.ts`:

```
1. Look up event by id                    → null?        DENY EVENT_NOT_FOUND
2. event.status === "ARCHIVED"?           → yes          DENY EVENT_NOT_LAUNCHABLE
3. Find user's derived access for org_id  → absent?      DENY ORG_NOT_MEMBER
4. entry.products includes productKey?    → absent?      DENY PRODUCT_NOT_ENTITLED
   otherwise                                            AUTHORIZED
```

**What is NOT consulted:** anything client-supplied except the event id. Organization comes from event row; membership from derived access; entitlement from organization's product list. **No caller-supplied `organization_id` has any way in.** Launch route does not honor `organization_id`, `product`, or `return_to` from the request.

**Architectural test:** A test asserts `authorizeProductLaunch` stays product-agnostic. It fails if product-specific logic appears. When you add Housing to the registry, expect to update registry-shape assertions in `handoff.test.ts`. That test is doing its job.

### 4.4 Housing's `/platform-entry` Route (The Real Work)

Housing implements a `/platform-entry` route that:

1. **Validates shape + browser binding** — before anything is spent
2. **Claims the handoff at Platform** — one network call, token spent exactly once
3. **Maps canonical ids → local rows** — using only the three mapping columns
4. **Applies Housing's own authorization** — whether this mapped user may access this workspace
5. **Refuses to replace another user's live session** — Session conflict guard
6. **Establishes session LAST** — on the very response that redirects into workspace

Every failure returns a sanitized JSON body with same security headers and **no cookies at all**. There is an exception boundary: unexpected throws become deliberate `500 INTERNAL_ERROR`, never framework error pages.

Failure codes to implement (from Lead Retrieval):
- `INVALID_REQUEST`, `LAUNCH_STATE_REQUIRED`, `LAUNCH_STATE_MISSING`, `LAUNCH_STATE_MISMATCH`, `NOT_A_NAVIGATION`
- `PLATFORM_NOT_CONFIGURED` (when PLATFORM_APP_URL is unset)
- Plus mapping and session-establishment codes (file 06 §3 of handoff pack)
- `SESSION_CONFLICT` (different user already has live session in this browser)

### 4.5 The Testable Architecture

Both Lead Retrieval and Pulse split the logic the same way, and it's why rules are asserted without a database:

| File | Contains | I/O-dependent? |
|---|---|---|
| `platform-entry-core.ts` | Decision order, every rule | **No** (deps injected) |
| `platform-entry-server.ts` | Wires real claim client, loaders, authorizer, session minter | Yes |
| `app/platform-entry/route.ts` | Thin handler + exception boundary | Yes |
| `identity-mapping.ts` | Pure mapping rules | **No** |
| `identity-mapping-supabase.ts` | Real service-role loaders | Yes |
| `launch-state.ts` | Nonce/correlator/cookie mechanics | **No** (crypto only) |
| `platform-claim-client.ts` | HTTP call + response validation | Yes |
| `establish-session.ts` | Pure orchestration of session minting | **No** (deps injected) |

**Copy this split.** It is the difference between "we tested the happy path" and "every denial branch is asserted." Every file marked "No" for I/O can be tested directly without mocking the rule under test.

---

## 5. How Lead Retrieval Should Be Used as Reference Implementation

### 5.1 The Files to Read, In Order

**Lead Retrieval's platform integration is the authoritative reference.** Read these:

1. `apps/lead-retrieval/docs/PLATFORM_LEAD_RETRIEVAL_HANDOFF.md` — domain-specific handoff doc
2. `apps/lead-retrieval/lib/platform/platform-ids.ts` — UUID validation
3. `apps/lead-retrieval/lib/platform/paths.ts` — path constants
4. `apps/lead-retrieval/lib/platform/launch-state.ts` — nonce/correlator mechanics (testable)
5. `apps/lead-retrieval/lib/platform/identity-mapping.ts` — pure mapping rules (testable)
6. `apps/lead-retrieval/lib/platform/identity-mapping-supabase.ts` — real loaders
7. `apps/lead-retrieval/lib/platform/platform-claim-client.ts` — HTTP call + validation
8. `apps/lead-retrieval/lib/platform/establish-session.ts` — session minting (testable)
9. `apps/lead-retrieval/lib/platform/lr-authorization.ts` — Lead Retrieval's own access decision
10. `apps/lead-retrieval/lib/platform/existing-session.ts` — Session conflict guard
11. `apps/lead-retrieval/lib/platform/platform-entry-core.ts` — decision order (testable, deps injected)
12. `apps/lead-retrieval/lib/platform/platform-entry-server.ts` — wiring
13. `apps/lead-retrieval/app/platform-entry/route.ts` — handler + exception boundary
14. `apps/lead-retrieval/middleware.ts` — exempts `/platform-entry*` from auth redirect

**Comments are extensive and explain the "why."** Read them.

### 5.2 What Not to Copy (Domain-Specific)

Lead Retrieval has its own domain code (`apps/lead-retrieval/lib/lr-*.ts`):
- Lead retrieval authorization rules
- Event/company/user models specific to exhibitor engagement
- Continuous capture containers (unique to Lead Retrieval)

**Housing will have its own domain.** Do NOT copy Lead Retrieval's domain logic. Copy only the platform-integration structure.

### 5.3 Pulse as a Backup Reference

`apps/pulse/lib/platform/` follows the same pattern. Use it if Lead Retrieval is unclear. Lead Retrieval is more recent and better documented; prefer it as primary reference.

---

## 6. Housing's Required Integration Points

### 6.1 The Three Mapping Columns (Required Contract)

These are the **entire** identity contract — copied from Lead Retrieval's live schema.

```sql
-- Housing's local user record. Auth identity in Housing's OWN Supabase Auth.
alter table public.housing_users
  add column platform_user_id uuid;

create unique index housing_users_platform_user_id_key
  on public.housing_users (platform_user_id)
  where platform_user_id is not null;

-- Housing's organization/company equivalent.
alter table public.housing_organizations
  add column platform_organization_id uuid;

-- DELIBERATELY NOT UNIQUE. One Platform org may map to several Housing orgs.
create index housing_organizations_platform_organization_id_idx
  on public.housing_organizations (platform_organization_id)
  where platform_organization_id is not null;

-- Housing's local event record.
alter table public.housing_events
  add column platform_event_id uuid;

create unique index housing_events_platform_event_id_key
  on public.housing_events (platform_event_id)
  where platform_event_id is not null;
```

**Partial unique indexes**, not plain `UNIQUE`. Housing will have local rows with no Platform counterpart (draft events, hotel contacts). NULL must not collide.

### 6.2 The One Rule That Matters Most

> **Resolution reads ONLY these three columns. Never email, name, slug, company name, domain, or "the first matching row."**

From Lead Retrieval's code comment:
> *A value that merely resembles a local attribute must never become authority.*

A Lead Retrieval test **deliberately proves `USER_MAPPING_NOT_FOUND` while a user with the same email exists** — because an email-based fallback would let anyone controlling a matching address inherit someone's workspace. **Write that test for Housing.**

### 6.3 Organization Resolution Rules (Non-Trivial)

Users and events are trivial (unique columns). Organizations are interesting:

`platform_organization_id` is **not unique** on purpose. One Platform org may own several Housing orgs (regional entities, per-series entities).

So the organization id **alone never resolves**. Housing must narrow it:

```
1. Candidates = all Housing orgs with this platform_organization_id
                → zero?      ORGANIZATION_MAPPING_NOT_FOUND

2. Narrow by the mapped EVENT: keep only candidates that own the event
   (housing_events.organization_id) or participate in it
                → zero?      EVENT_ORGANIZATION_MISMATCH
                → one?       resolved ✓

3. Still several? Narrow by the mapped USER's own relationships:
   housing_users.organization_id, then the user's event-level membership
                → exactly one?  resolved ✓
                → zero or several?  AMBIGUOUS_ORGANIZATION_MAPPING
```

**Nothing is ever picked by position.** "Take the first row" makes the answer depend on index order. Lead Retrieval has an explicit *order-independent* test that shuffles candidates and asserts the same refusal. **Write that for Housing.**

### 6.4 Full Failure-Code Set

| Code | Meaning |
|---|---|
| `INVALID_PLATFORM_ID` | Not a canonical UUID |
| `USER_MAPPING_NOT_FOUND` | No Housing user carries this `platform_user_id` |
| `EVENT_MAPPING_NOT_FOUND` | No Housing event carries this `platform_event_id` |
| `EVENT_NOT_LAUNCHABLE_CONTAINER` | The mapped row is not a real event (guard against synthetic containers) |
| `ORGANIZATION_MAPPING_NOT_FOUND` | No Housing org carries this `platform_organization_id` |
| `EVENT_ORGANIZATION_MISMATCH` | Mapped orgs exist, none relates to the mapped event |
| `AMBIGUOUS_ORGANIZATION_MAPPING` | Narrowing left zero or several |

### 6.5 Local Development Environment

**Port 3004** (proposed) for Housing dev server. Pinned in the dev script: `"dev": "next dev --port 3004"`.

**Local environment files:**

`apps/housing/.env.local`:
```bash
# Housing's OWN Supabase project
NEXT_PUBLIC_SUPABASE_URL=https://<housing-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<housing anon key>
SUPABASE_SERVICE_ROLE_KEY=<housing service role key>

# Housing's own origin
NEXT_PUBLIC_SITE_URL=http://localhost:3004
NEXT_PUBLIC_AUTH_CALLBACK_URL=http://localhost:3004/auth/callback

# Where to POST the handoff claim
PLATFORM_APP_URL=http://localhost:3001
```

`apps/platform/.env.local` (add one line):
```bash
HOUSING_APP_URL=http://localhost:3004
```

**Secrets:** `.local-secrets/housing-db.env` (gitignored, mode 600) holds Housing DB credentials.

---

## 7. Required Testing and Validation Commands

### 7.1 Local Validation (Before Every Merge)

```bash
npm run boundaries           # Import boundaries — must pass
npm run typecheck            # All workspaces
npm run lint                 # All workspaces
npm run test                 # All workspaces (Housing added to root aliases)
npm run build                # All workspaces
npm run check                # typecheck + lint + test
```

Housing-specific:
```bash
npm run typecheck:housing
npm run lint:housing
npm run test:housing
npm run build:housing
npm run dev:housing          # Serves http://localhost:3004
```

**Note:** There are aliases for `dev/build/lint/typecheck:platform` but **no `test:platform`**. Run Platform tests with `npm run test --workspace apps/platform`. When adding Housing aliases, add **all five** (`dev/build/test/lint/typecheck:housing`) so Housing doesn't inherit the same gap.

### 7.2 The Validation Bar for Integration Changes

Lead Retrieval's Platform integration was accepted only with all of:

1. typecheck clean, lint clean, production build succeeds
2. full node suite run, with a **name-level diff** against baseline (not just count)
3. `npm run boundaries` passing
4. the Platform suite passing
5. a **live** happy-path proof through real routes, with JWT issuer and subject verified
6. a **live negative matrix** — every denial code reproduced through real routes, including order-independence case
7. documentation updated in the same change

**That is the bar for the Housing handoff integration too.** The domain work that follows is ordinary product engineering and doesn't need the same ceremony — but the auth boundary does.

### 7.3 Test Runners Per App

| App | Runner |
|---|---|
| `apps/platform` | `npx tsx --test` over every `*.test.ts` under `lib/` and `app/` |
| `apps/lead-retrieval` | `node --import tsx --test`, plus custom tagged runner (`scripts/testing/lr-test.mjs`) |
| `apps/pulse` | Vitest |
| `apps/orca` | Its own summary runner |

**Pick one for Housing and be consistent.** For a greenfield app, Node's built-in test runner via `tsx` — the Platform approach — matches the newest code in the repo and adds no test-framework dependency.

### 7.4 Known Inherited Test Failures

Lead Retrieval's suite has **13 pre-existing failures** out of ~3530 tests, inherited from before consolidation. They are documented and name-stable. If you run `npm run test` at root and see them, they are not yours.

**Housing starts clean.** Keep it that way. A green suite you trust is worth more than a large one you've learned to ignore.

---

## 8. Files That Will Need to Change for Housing

### 8.1 Platform (`apps/platform`)

**Registry entry (1 file):**
- `lib/server/product-registry.ts` — add Housing to PRODUCT_APP_URL_ENV, PRODUCT_AUTH_AUTHORITY, buildProductReturnPath

**Tests (1 file):**
- `lib/server/handoff.test.ts` — add Housing cases mirroring Lead Retrieval ones

**Local config (1 file):**
- `.env.local` — add `HOUSING_APP_URL=http://localhost:3004`

**Root package.json (1 file):**
- Add workspace scripts: `dev:housing`, `build:housing`, `test:housing`, `lint:housing`, `typecheck:housing`

### 8.2 Housing (`apps/housing`) — Complete Skeleton

**App directory:**
```
apps/housing/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── platform-entry/
│       └── route.ts              ← The handoff entry point
├── components/
├── lib/
│   ├── platform/                 ← Copy structure from Lead Retrieval
│   │   ├── platform-ids.ts
│   │   ├── paths.ts
│   │   ├── launch-state.ts
│   │   ├── identity-mapping.ts
│   │   ├── identity-mapping-supabase.ts
│   │   ├── housing-authorization.ts
│   │   ├── establish-session.ts
│   │   ├── existing-session.ts
│   │   ├── platform-claim-client.ts
│   │   ├── platform-entry-core.ts
│   │   └── platform-entry-server.ts
│   └── (Housing domain code — not yet designed)
├── public/
├── supabase/
│   ├── migrations/
│   │   └── (baseline + mapping columns)
│   └── config.toml
├── middleware.ts                 ← Exempt /platform-entry*
├── next.config.ts
├── package.json
├── .env.example                  ← Names only, no values
├── .env.local                    ← Gitignored
└── tsconfig.json
```

**Key files:**
- `package.json` — name "housing", `private: true`, Next.js, dev script: `"next dev --port 3004"`
- `.gitignore` — include `.env*`
- `middleware.ts` — exempts `/platform-entry*` from auth redirect
- `next.config.ts` — ensure security headers at `/platform-entry` are not overridden

### 8.3 Root Files (Minimal)

**package.json:**
```json
{
  "scripts": {
    "dev:housing": "npm --workspace apps/housing run dev",
    "build:housing": "npm --workspace apps/housing run build",
    "test:housing": "npm --workspace apps/housing run test",
    "lint:housing": "npm --workspace apps/housing run lint",
    "typecheck:housing": "npm --workspace apps/housing run typecheck"
  }
}
```

**No other root files change.**

---

## 9. Contradictions Between Handoff Documents and Live Repository

**None identified.** The handoff documents were verified against the live code on 2026-09-10. All claims about:
- Registry entries (PRODUCT_APP_URL_ENV, PRODUCT_AUTH_AUTHORITY, buildProductReturnPath)
- Platform Core schema and RLS posture
- Lead Retrieval structure and test pattern
- Engineering standards and testing bar

...match the actual code. The housing product key, tile definition, and color ramp are already registered in Platform. No contradictions found between descriptive docs and working code.

---

## 10. Unresolved Decisions Requiring Sarah or Ali

These are **not** optional; they will shape the schema and RBAC. File 09 of the handoff pack marks them with 🔴, 🟠, 🟡, ⚪ severity. **Get answers in first week; write them back into the decision file.**

### 10.1 Critical (Before Schema — 🔴)

1. **Auth authority: confirm `own`**  
   Handoff doc recommends `own` (separate Supabase Auth). Everything assumes it. If `platform-core` instead, integration is simpler but Housing can never have non-Platform users. **Needs:** Ali's confirmation.

2. **Hotel-side users in v1?**  
   Does a hotel contact ever log in (confirm pickup, upload rooming list)? Or v1 planner-facing only? **Impact:** large — shapes RBAC and auth surface on day one.

3. **"Rooms held" definition**  
   Platform tile commits to "Rooms held" metric (contracted allotment or current pickup?). Ambiguous. Pick precise definitions. **Impact:** small code, big product promise.

4. **Event dates and timezone ownership**  
   Platform's `starts_at`/`ends_at` are frequently NULL; `timezone` column not applied live. Housing almost certainly needs event dates for room blocks. Recommendation: Housing owns dates, treats Platform's as hint. **Alternative:** get venue/timezone migration applied at Platform level (bigger change).

5. **One Platform org → several Housing orgs?**  
   Schema permits it (file 06 §3); Lead Retrieval implements it. If Housing genuinely one-to-one, narrowing logic can be simpler, but non-unique column and refusal path still needed. **Ask:** real customer shape needing this?

### 10.2 Important (Before Domain Build — 🟠)

6. **Attrition and contract terms in v1?**  
   Cutoff dates, shrink allowances, penalty basis — financial risk housing exists to manage. Including it makes v1 meaningfully more valuable and bigger.

7. **Rooming-list ingest format**  
   CSV? Per-hotel templates? Hotel API? **Impact:** large, drives import/validation subsystem.

8. **Sub-blocks for exhibitors/sponsors**  
   Common pattern. If Housing needs this, decide whether exhibitor identity duplicated in Housing or referenced (remembering Housing can't read Lead Retrieval's database).

9. **Multi-currency and tax**  
   Cheap to design now, painful to retrofit.

10. **Relationship to Registration**  
    Registration ("knows who is coming") and Housing ("knows where they stay") are adjacent. Does Housing reservation reference Registration attendee? **Flag:** most likely source of future architectural pain. Raise early. This is a **second cross-product contract** that doesn't exist yet.

### 10.3 Infrastructure (Ali) — 🟡

11. **Production domain:** Proposed `housing.signalthread.ai`. Confirm.
12. **Supabase project name/region:** Proposed `signalthread-housing`. Lead Retrieval is `us-east-2`, PG 17.6. Match unless reason not to.
13. **Local port:** Proposed 3004. Confirm nothing else on machine claims it.
14. **Pilot entitlements:** Which orgs get `housing` entitlement for pilot? Service-role provisioning; no self-serve path.
15. **CI:** Worth adding for Housing? (None exists today; validation runs locally before merge.)

### 10.4 Known Platform-Level Gaps (Context, Don't Fix) — ⚪

These are real, documented, and deliberately unmitigated. Don't work around them silently:

1. **`venue` / `timezone` migration committed but unapplied** to live Platform Core.
2. **No product feed adapter exists** for any product. Dashboard shows registry state honestly; never fabricates numbers.
3. **Platform Core Auth is shared single point of failure** for new sign-ins. Deliberately unmitigated; fixing it is separate hardening phase.
4. **`HttpOnly: false` on session cookies** is deferred hardening (required by Supabase browser client).
5. **GoTrue verify rate limit** (~30 / 5 min / IP) will bite during proof runs. Wait five minutes if it happens; not a bug.
6. **`docs/local-dev.md` is stale** — describes pre-monorepo layout. File 07 of handoff pack supersedes it.
7. **Lead Retrieval has 13 inherited test failures** out of ~3530. Documented and name-stable; not yours.
8. **`apps/platform` has no Vercel project yet** and Platform is not deployed. Housing's production launch path cannot be proved end-to-end until Platform is deployed — local proof is interim bar.

---

## 11. Recommended Implementation Sequence

### Phase 0 — Orientation (Days 1–2)

- [ ] Read files 01–04 of handoff pack (`PLATFORM_ARCHITECTURE.md`, `PLATFORM_CORE_SCHEMA.md`, `AUTH_AND_IDENTITY.md`, `LAUNCH_HANDOFF_CONTRACT.md`)
- [ ] **Run the existing stack locally** (`npm install` at repo root, then `npm run dev:platform` and `npm run dev:lead-retrieval`)
- [ ] **Launch Lead Retrieval from Platform in a real browser** — watch the 7-hop redirect chain in devtools
- [ ] Verify you can draw the chain from memory and explain what each hop protects against

### Phase 1 — Deep Dive (Day 3)

- [ ] Read `apps/lead-retrieval/lib/platform/` end to end (~12 files, heavily commented) alongside `apps/lead-retrieval/docs/PLATFORM_LEAD_RETRIEVAL_HANDOFF.md`
- [ ] Read `apps/platform/lib/server/{product-registry,product-launch,launch-decision,handoff,handoff-claim}.ts`
- [ ] Do NOT write code yet

### Phase 2 — Decisions (Day 4)

- [ ] Work through files 06 and 09 of handoff pack with **Ali**
- [ ] Resolve:
  - Auth authority (almost certainly `own`)
  - Hotel-side users in v1
  - "Rooms held" definition
  - Event dates / timezone ownership
  - One-to-many org mapping (nice-to-have, likely not needed)

### Phase 3 — Infrastructure (Ali) — Parallel with Phase 4

- [ ] Ali provisions Housing Supabase project (`signalthread-housing`)
- [ ] Ali provisions Housing Vercel project (Root Directory: `apps/housing`)
- [ ] Store credentials in `.local-secrets/housing-db.env` (mode 600)
- [ ] Confirm domain registration (proposed `housing.signalthread.ai`)

### Phase 4 — Platform Registry (Phase 5, Day 5)

- [ ] Add Housing to `apps/platform/lib/server/product-registry.ts`:
  - PRODUCT_APP_URL_ENV entry
  - PRODUCT_AUTH_AUTHORITY entry
  - buildProductReturnPath case
- [ ] Update `apps/platform/lib/server/handoff.test.ts` with Housing cases
- [ ] Set `HOUSING_APP_URL=http://localhost:3004` in `apps/platform/.env.local`
- [ ] Run `npm run test --workspace apps/platform` — registry shape assertions may need updating
- [ ] Add Housing scripts to root `package.json`

### Phase 5 — App Skeleton (Phase 2, Day 5)

- [ ] Create `apps/housing/` directory structure
- [ ] Create `apps/housing/package.json` (name "housing", `private: true`, Next.js)
- [ ] Create basic `app/layout.tsx`, `app/page.tsx`, `next.config.ts`, `middleware.ts`
- [ ] Wire `@signalthread/ui` and mirror Housing color properties from `apps/platform/app/globals.css`
- [ ] Run `npm install` from repo root
- [ ] Run `npm run boundaries` — must pass
- [ ] Run `npm run dev:housing` — must serve `http://localhost:3004`

### Phase 6 — Mapping Columns (Phase 3, Day 5)

- [ ] Create `apps/housing/supabase/` directory
- [ ] Create baseline migration with three mapping columns:
  - `housing_users.platform_user_id uuid` (UNIQUE where not null)
  - `housing_organizations.platform_organization_id uuid` (non-unique, indexed)
  - `housing_events.platform_event_id uuid` (UNIQUE where not null)
- [ ] Apply migration: `supabase db push --linked`
- [ ] Generate types: `types/database.ts`

### Phase 7 — `/platform-entry` Route (Phase 5, Days 6–7)

**Build in this order, proving each step:**

1. `lib/platform/platform-ids.ts` — UUID validation
2. `lib/platform/paths.ts` — path constants
3. `lib/platform/launch-state.ts` — nonce/correlator, 120s TTL, HttpOnly cookie
4. `app/platform-entry/start/route.ts` — arm browser, redirect with state
5. `lib/platform/platform-claim-client.ts` — POST claim, validate response
6. `lib/platform/identity-mapping.ts` — pure mapping rules (testable)
7. `lib/platform/identity-mapping-supabase.ts` — real Supabase loaders
8. `lib/platform/housing-authorization.ts` — Housing's own access decision
9. `lib/platform/establish-session.ts` — user lookup → generate link → verify OTP
10. `lib/platform/existing-session.ts` — SESSION_CONFLICT guard
11. `lib/platform/platform-entry-core.ts` — decision order, deps injected (testable)
12. `lib/platform/platform-entry-server.ts` — wiring
13. `app/platform-entry/route.ts` — handler + exception boundary

**Interim proof:** Before mapping exists, have `/platform-entry` return deliberate `501` after claim succeeds. Proves hops 1–6 work before any domain code exists.

### Phase 8 — Live Proof (Phase 6, Days 7–8)

**Happy path:**
- [ ] All 7 hops, final route `200`
- [ ] Housing session JWT `iss` = Housing's project; `sub` = mapped Housing user
- [ ] Row exists in Housing's `auth.sessions`
- [ ] No Platform Core cookie present in Housing's origin

**Negative matrix** (each must fail closed with right code):
- [ ] `USER_MAPPING_NOT_FOUND` — with same-email user present
- [ ] `EVENT_MAPPING_NOT_FOUND` — with same-name event present
- [ ] `EVENT_ORGANIZATION_MISMATCH`
- [ ] `AMBIGUOUS_ORGANIZATION_MAPPING` — and order-independent
- [ ] Housing-side access denial (mapped, but no permission)
- [ ] Replay: spent handoff → `401 HANDOFF_INVALID`
- [ ] Launch-state sub-cases leave handoff unclaimed
- [ ] `SESSION_CONFLICT` when different user has live session

### Phase 9 — Domain Build (Phase 7, Ongoing)

**Only now.** With mapping columns proven, build Housing's domain:
- Room blocks, hotels, rate plans, reservations, attrition
- Housing's own RBAC
- Workspace UI
- ProductFeed (optional, later)

### Phase 10 — Production Readiness (Phase 8)

- [ ] Vercel env vars set in Housing project (never in committed file)
- [ ] `HOUSING_APP_URL` set in Platform Vercel project
- [ ] Supabase config as code in `apps/housing/supabase/config.toml`
- [ ] Entitlements granted to pilot orgs (service-role provisioning)
- [ ] Security headers at `/platform-entry` not overridden by `next.config.ts`
- [ ] Full suite, typecheck, lint, `npm run boundaries`, production build

---

## 12. Success Criteria

Housing integration is **done** when:

> A user signs in at `app.signalthread.ai`, opens an event whose organization holds an ACTIVE `housing` entitlement, clicks Housing, and lands in the Housing workspace for that event — authenticated in Housing's own auth project, scoped to the mapped Housing organization, with no Platform Core credential anywhere in Housing, and with every denial path proved to fail closed.

**Validation bar:** Same as Lead Retrieval's — typecheck/lint/build clean, full test suite with name-level diff, boundaries passing, Platform suite passing, live happy-path proof, live negative matrix, docs updated.

---

## Appendix: Critical Files and Locations

| Task | File(s) |
|---|---|
| Engineering bar | `ENGINEERING_STANDARDS.md` (root) |
| Model selection | `MODEL_SELECTION.md` (root) |
| Deployment boundaries | `docs/DEPLOYMENT_BOUNDARIES.md` |
| Housing pack | `docs/housing-handoff/` (10 files) |
| Platform registry | `apps/platform/lib/server/product-registry.ts` |
| Platform tests | `apps/platform/lib/server/handoff.test.ts`, `launch-decision.test.ts` |
| Lead Retrieval reference | `apps/lead-retrieval/lib/platform/` (~12 files) |
| Lead Retrieval doc | `apps/lead-retrieval/docs/PLATFORM_LEAD_RETRIEVAL_HANDOFF.md` |
| Pulse reference | `apps/pulse/lib/platform/` |
| Pulse doc | `docs/PLATFORM_PULSE_HANDOFF.md` |
| Import boundaries check | `scripts/check-import-boundaries.mjs` |
| Demo seeding | `scripts/demo-seeding/` |

---

**Report written:** 2026-09-10  
**Verified against:** Live code as of commit `bf70872`  
**Status:** Ready for Phase 2 (skeleton + infrastructure)
