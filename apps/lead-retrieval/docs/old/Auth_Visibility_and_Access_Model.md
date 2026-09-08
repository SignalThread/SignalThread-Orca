# Auth, Visibility, and Access Model (Canonical)

This document defines the implemented access model for the Lead Intel Admin app, grounded in current source code.

Primary references:
- `lib/auth/session.ts`
- `lib/supabase/middleware.ts`
- `middleware.ts`
- `app/auth/callback/page.tsx`
- `app/auth/server-callback/route.ts`
- `app/api/auth/activate-memberships/route.ts`
- `app/api/organizer/invite/route.ts`
- `app/admin/users/actions.ts`
- `lib/data/organizer-scope.ts`
- `types/database.ts`
- `supabase/migrations/*.sql`

## Authentication Architecture (End-to-End)

## Provider and Session Model
- Auth provider: Supabase Auth.
- Session creation:
  - Email/password (`signInWithPassword`) from login form.
  - Callback exchange (`exchangeCodeForSession`) for PKCE links.
  - OTP verify (`verifyOtp`) for token-hash flows.
- Session persistence:
  - Browser client via `@supabase/ssr` browser helper.
  - Server client via `@supabase/ssr` server helper and cookies.
- Middleware refreshes/validates session on route access (`updateSession`).

## `auth.users` vs `public.users`
- `auth.users`: identity credentials managed by Supabase.
- `public.users`: application profile + role + company linkage.
- Linkage: `public.users.id` is expected to equal `auth.users.id`.
- Role routing and authorization decisions are made from `public.users.role`, not JWT custom role claims.

## Callback and Login Flows

### Login flow
1. User signs in on `/login`.
2. App fetches auth user, then reads `public.users.role`.
3. App calls `/api/auth/activate-memberships` (best effort).
4. User is routed by role.

### Callback flow
- `/auth/callback` (client) handles hash-token and query-token entry.
- Query token flows are forwarded to `/auth/server-callback`.
- `/auth/server-callback` exchanges/verifies session, activates memberships, and redirects by role.

### Password reset flow
- `/auth/reset` exchanges recovery code and allows `updateUser({ password })`.
- On success user is signed out and sent to `/login?reset=1`.

## Authorization Model

## Canonical app roles (normalized)
Defined in `lib/auth/session.ts`:
- `platform_admin`
- `organizer_admin`
- `exhibitor_admin`
- `viewer`

Normalization:
- `event_organizer` -> `organizer_admin`
- `organizer` -> `organizer_admin`

## Role meanings (implemented)
- `platform_admin`: global admin surface (`/admin`) and global admin APIs.
- `organizer_admin`: organizer surface (`/app/organizer`) scoped by event membership.
- `exhibitor_admin`: exhibitor/app surface (`/exhibitor/*` and `/app/exhibitor` redirects) scoped by company.
- `viewer`: authenticated but non-admin/read-only fallback path (`/app`).

## Route guard behavior
- Middleware blocks route families by role:
  - `/admin*` -> platform only
  - `/app/organizer*` and `/organizer*` -> organizer only
  - `/app/exhibitor*` and `/exhibitor*` -> exhibitor only
- Page guards (`requireAuth`, `requireRole`) enforce the same expectations in server components.

## Scope Model

## Platform scope
- Unscoped/global.
- Platform routes and most admin APIs use service-role helpers for broad data access.

## Organizer scope
Derived by `getOrganizerScope(userId)`:
1. Validates user role is organizer-like.
2. Reads `event_users` rows for that user with status in `active|invited`.
3. Uses those event IDs to load scoped events.
4. Expands scoped company IDs from events + exhibitors + membership exhibitor scope.

Organizer screens filter data to this derived scope.

## Exhibitor scope
- Primarily driven by `public.users.company_id`.
- Exhibitor leads/campaign routes filter by `company_id` and optional event query param.

## Event scope
- Organizer: selected `eventId` constrained to organizer-scoped events.
- Exhibitor: optional filter where available; core scope remains company-based.

## event_users Model and Access Semantics

## Why `event_users` exists
- Event membership and permission context for users.
- Decouples app identity (`users`) from per-event assignment.

## Fields that matter for access
- `user_id`: membership owner.
- `event_id`: event scope key.
- `exhibitor_company_id`: exhibitor scope key (critical for exhibitor-scoped memberships).
- `status`: membership lifecycle state.
- `permissions`: JSON payload (currently not fully enforced in UI/API RBAC decisions).

## Status behavior in code
- Invite flows insert `status='invited'`.
- Activation endpoints update `invited -> active` for the authenticated user.
- Organizer scope includes both `invited` and `active` memberships.

## Invite and Membership Activation Flows

## Implemented happy path
1. Admin or organizer sends invite (`inviteUserByEmail`).
2. App upserts `public.users` row.
3. App inserts `event_users` row with invited status and permissions JSON.
4. User authenticates through callback/login.
5. `/api/auth/activate-memberships` and/or callback server route activates memberships.

## Backfill behavior
- No dedicated backfill/reconciliation job for memberships is present in current tracked code.

## Known failure points
- Missing/incorrect `public.users` row for auth user causes role-resolution failure.
- Missing organizer `event_users` rows yields empty organizer scope.
- Role vocabulary mismatch between app code and DB constraints/policies can deny access unexpectedly.

## Leads Visibility Model (Implemented)

## Organizer leads visibility
- Organizer leads pages query by selected event in organizer scope.
- Requires organizer membership scope from `event_users`.

## Exhibitor leads visibility
- Exhibitor leads pages query `leads.company_id == users.company_id`.
- Optional `eventId` narrows results.

## Conditions required for expected lead visibility
- Valid session user.
- `public.users` row exists.
- Correct role and route family.
- For organizer: scoped membership rows in `event_users`.
- For exhibitor: `users.company_id` populated and matching lead company.

## Session/JWT freshness implications
- Middleware and server loaders read role/company from DB each request.
- Re-login is usually not required for role/scope changes to take effect, but broken/missing rows still require data repair.

## RLS and Enforcement Model

## App-enforced
- Route family gating and redirects.
- Role checks in route handlers.
- Organizer scope filtering in server data helpers.

## DB-enforced (in tracked migrations)
- RLS policies exist for `companies`, `users`, `licenses`, `leads`, `campaigns`, `signals`, etc.
- Some policies reference legacy role strings (`organizer`, `exhibitor`).

## Ambiguous / needs verification
- Current production RLS policies for tables like `event_users`/`exhibitors` are not fully represented in tracked migrations.
- Tracked constraints and policy role strings may not match current runtime role values.

## Known Bugs and Risk Patterns
1. **"Missing exhibitor scope"-class failures**
   - Occur when scope-critical fields (`company_id`, `exhibitor_company_id`, membership rows) are missing or inconsistent.
2. **Role vocabulary drift**
   - App normalizes modern role names; migrations still include legacy values.
3. **Schema drift**
   - Generated types and tracked migrations diverge in several tables/columns.
4. **Signals RBAC inconsistency**
   - API is platform-only while helper/UI code includes TODO-based permissive placeholders.
5. **Seat writes spread across multiple paths**
   - Multiple code paths mutate `licenses.seats_used`, increasing consistency risk.

## Production Hardening Recommendations (Directly from Observed Code)
1. Reconcile and lock production schema history in-repo so migrations match generated types.
2. Standardize role values across DB constraints, RLS policies, and app checks.
3. Explicitly define and enforce event/user scope contracts for organizer and exhibitor flows.
4. Consolidate seat accounting writes into one controlled mechanism.
5. Resolve signal RBAC drift (API/helpers/UI alignment).
6. Reduce route duplication (`/app/*` vs legacy `/exhibitor/*` wrappers).

## Canonical Access Rules
- Access decisions are based on `public.users.role` (normalized in app), not JWT role claims.
- `/admin` is platform-admin-only.
- Organizer access requires organizer role and event membership scope from `event_users`.
- Exhibitor access requires exhibitor role and valid company assignment.
- Membership activation is required to transition invite records to active state.
- Scope keys that must remain correct: `users.company_id`, `event_users.event_id`, `event_users.exhibitor_company_id`, `exhibitors(event_id, company_id)`, `licenses(event_id, exhibitor_company_id)`.
- Unknown/missing role must route to safe login/error path.
