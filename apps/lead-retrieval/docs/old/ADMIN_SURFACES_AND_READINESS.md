# Lead Intel Admin: Project Summary (Production Readiness)

**Related docs:** Machine-readable manifest [`ADMIN_PROJECT_SUMMARY.md`](./ADMIN_PROJECT_SUMMARY.md) · Platform + mobile overview [`PROJECT_SUMMARY_APP.md`](./PROJECT_SUMMARY_APP.md) · App architecture [`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md) · Architecture [`SYSTEM_ARCHITECTURE.json`](./SYSTEM_ARCHITECTURE.json), [`System_Architecture_Map.md`](./System_Architecture_Map.md).

## Mobile app (Lead Intel Scan)

- **Repo:** Not this codebase; consumes the **same** Supabase backend as Admin.
- **Current:** Capture path is **online-dependent** for persisting leads to Postgres.
- **Planned:** Offline-first SQLite (`local_leads`, `sync_outbox`), sync engine with retry/backoff, audio upload **after** lead sync (see [`APP_SCHEMA.md`](./APP_SCHEMA.md)). *Not implemented here.*

## Product Overview
Lead Intel Admin is a Next.js App Router web application for operating the Lead Intel platform across three user surfaces:
- Platform Admin (`/admin`)
- Organizer Admin (`/app/organizer`)
- Exhibitor Admin (`/exhibitor/*`, with partial `/app/exhibitor/*` redirect wrappers)

The app manages event operations, exhibitor onboarding, user access, licenses/seats, leads, campaign authoring, and signal management against a shared Supabase backend.

## What This Admin App Is Responsible For
Current implemented responsibilities (code-verified):
- Authentication and session routing via Supabase Auth (`@supabase/ssr`) and `public.users.role`
- Route-level RBAC enforcement in middleware and page guards
- Platform event, exhibitor, user, and license management surfaces
- Organizer event-scoped dashboards and operations
- Exhibitor company-scoped dashboard, leads, campaigns, and settings
- Membership activation flow (`event_users.status: invited -> active`) after login/callback
- Campaign draft generation pipeline (OpenAI-backed)

## Relationship to Mobile App and Shared Backend
Verified in this repo:
- Shared backend is Supabase (Auth + Postgres)
- Shared core entities include `users`, `event_users`, `events`, `companies`, `exhibitors`, `licenses`, `leads`

Needs verification:
- Mobile app repository/contracts are not present here, so mobile-specific behavior and cross-client API guarantees cannot be fully validated from this codebase alone.

## Current Production-Oriented Architecture
- Framework: Next.js 16.x (App Router) — see `package.json` for exact version
- Auth/session:
  - Browser: `lib/supabase/client.ts`
  - Server: `lib/supabase/server.ts`
  - Middleware refresh + route gating: `lib/supabase/middleware.ts`
- Service-role access: `lib/supabase/admin.ts` (`SUPABASE_SERVICE_ROLE_KEY`)
- Role/session utilities: `lib/auth/session.ts`
- Runtime schema contract: generated `types/database.ts`
- Tracked SQL migrations: `supabase/migrations/*.sql`

External integrations verified in code:
- Supabase
- OpenAI (`lib/campaigns/llm-draft-generator.ts`)

Not verified in this branch:
- SendGrid integration
- Cloudflare integration

## Route and Surface Overview

### Platform Admin Surface
Routes:
- `/admin`
- `/admin/events`, `/admin/events/new`, `/admin/events/[eventId]`
- `/admin/exhibitors`, `/admin/exhibitors/[exhibitorId]`
- `/admin/users`
- `/admin/licenses`
- `/admin/signals`

Notes:
- Guarded by middleware and `app/admin/layout.tsx`
- `/admin` dashboard currently uses mock/static data via `lib/data/platform-admin.ts`

### Organizer Admin Surface
Canonical routes:
- `/app/organizer`
- `/app/organizer/dashboard` (redirects to `/app/organizer`)
- `/app/organizer/events`
- `/app/organizer/exhibitors`, `/app/organizer/exhibitors/[exhibitorId]`
- `/app/organizer/leads`
- `/app/organizer/licenses`
- `/app/organizer/users`
- `/app/organizer/performance`

Notes:
- Scope derived from `event_users` (`active` or `invited`) using `lib/data/organizer-scope.ts`
- Route group `app/(app)/organizer/*` is mostly legacy redirects to `/app/organizer/*`

### Exhibitor Admin Surface
Primary implemented routes are in `app/(app)/exhibitor/*` and resolve to URL paths under `/exhibitor/*`:
- `/exhibitor/dashboard`
- `/exhibitor/leads`, `/exhibitor/leads/[leadId]`
- `/exhibitor/users`
- `/exhibitor/campaigns`
- `/exhibitor/companies`
- `/exhibitor/integrations`
- `/exhibitor/settings`

Additional route wrappers:
- `/app/exhibitor/*` routes often redirect to `/exhibitor/*`

## Feature Areas Implemented
- Event catalog and event detail CRUD (platform)
- Exhibitor create/delete and exhibitor detail views
- License create/edit/deactivate/add seats
- User invite/delete flows (platform + organizer interfaces)
- Organizer dashboard, exhibitors, leads, licenses, users, performance
- Exhibitor dashboard/leads/campaigns/settings
- Campaign builder and recipients/messages APIs
- Signal Library UI and APIs (currently platform-only in API guards)
- Auth callback + password reset flows

## Auth Model Summary
- Login: email/password (`signInWithPassword`)
- Recovery: `resetPasswordForEmail` -> `/auth/reset`
- Callback handling:
  - `/auth/callback` (client: hash/session setup and redirect)
  - `/auth/server-callback` (server: `exchangeCodeForSession` / `verifyOtp`)
- Post-auth activation:
  - `/api/auth/activate-memberships` updates invited memberships to active for current user
  - server callback also performs activation

## RBAC Summary
Normalized app roles (`lib/auth/session.ts`):
- `platform_admin`
- `organizer_admin` (also normalized from `event_organizer` and `organizer`)
- `exhibitor_admin`
- `viewer`

Home routing:
- `platform_admin` -> `/admin`
- `organizer_admin` -> `/app/organizer`
- `exhibitor_admin` -> `/app/exhibitor`
- unknown/missing -> `/login?error=role`

## Visibility and Scoping Summary
- Organizer visibility is membership/event scoped:
  - derived from `event_users` rows for current user
  - constrained to events where membership status is `active` or `invited`
- Exhibitor visibility is company scoped:
  - primarily via `users.company_id`
  - lead/campaign queries filter by `company_id`
- Platform visibility is global via service-role queries

## Invite, Redeem, Membership Summary (Current State)
Implemented invite flows:
- `app/admin/users/actions.ts` (server actions)
- `app/api/organizer/invite/route.ts`

Current behavior:
- Uses `supabase.auth.admin.inviteUserByEmail(...)`
- Upserts `public.users`
- Inserts `event_users` with `status='invited'`
- Seat checks + seat mutation are performed in invite flows

Implemented membership activation:
- `POST /api/auth/activate-memberships`
- `/auth/server-callback` internal activation path

Not present in this tracked branch:
- `app/api/exhibitor/invite/route.ts`
- `app/api/invites/redeem/route.ts`
- `app/api/invites/claim/route.ts`
- invite-code table-backed flow (`invite_codes`) in runtime types/migrations

## Leads Visibility Summary
- Exhibitor leads page filters by `leads.company_id == users.company_id` and optional `eventId`
- Organizer leads page filters by selected event within organizer scope
- Owner display resolves via `leads.owner_user_id -> users`

## Seat / License Logic Summary
Current implementation is mixed:
- Direct writes to `licenses.seats_used` exist in multiple places:
  - `app/admin/users/actions.ts`
  - `app/api/organizer/invite/route.ts`
  - `lib/data/license-management.ts` (`syncLicenseSeatUsage`)
- License checks for availability are performed before invite in admin/organizer flows
- This is not yet a pure derived/reconciled-only seat model

## Current Known Bugs / Gaps / Risks
1. **Schema drift between generated types and tracked migrations**
   - `types/database.ts` includes tables/columns not created in tracked SQL history (for example `event_users`, `exhibitors`, `license_plans`, expanded `events` shape).
2. **Role vocabulary drift**
   - Migrations and RLS policies still reference legacy `organizer`/`exhibitor` values.
   - Runtime app uses `platform_admin`/`organizer_admin`/`exhibitor_admin`.
3. **Signal RBAC inconsistency**
   - API strictly platform-only for signals.
   - Signal helper and UI contain TODO stubs that currently bypass intended granular RBAC.
4. **Mixed route trees**
   - `/app/*` and legacy `/exhibitor/*` + route-group wrappers coexist.
5. **Mock data still in platform dashboard**
   - `/admin` uses static datasets from `lib/data/platform-admin.ts`.
6. **Seat mutation race/consistency risk**
   - Multiple direct write paths to `licenses.seats_used`.

## Current State vs Production Hardening Priorities
### Implemented now
- Working auth/session + callback/recovery paths
- Core admin/org/exhibitor surfaces and APIs
- Organizer event scoping and exhibitor/company scoping patterns
- Campaign + signal feature foundations

### Recommended hardening before production scale
1. Align migrations with actual production schema used by generated types.
2. Standardize role vocabulary end-to-end (DB constraints, RLS functions/policies, app checks).
3. Finalize one seat accounting model and remove conflicting direct writes.
4. Unify canonical route tree (`/app/*` vs `/exhibitor/*` wrappers).
5. Complete signal RBAC consistently across API, helper layer, and UI.
6. Replace remaining mock dashboard data with DB-backed aggregates.

## Locked / Canonical Decisions (Code-Derived)
- Session role source is `public.users.role` (not JWT custom claim) for routing and guards.
- Organizer access must normalize legacy role strings (`event_organizer`, `organizer`) to organizer-admin behavior.
- Organizer scope is membership-driven from `event_users`.
- `/admin` is platform-admin-only (enforced in middleware + admin layout).
- Post-auth membership activation (`invited -> active`) is part of login/callback behavior.

## Open Questions / Needs Verification
1. Exact production DDL for tables present in generated types but absent/incomplete in tracked migrations.
2. Actual production `users.role` check constraint values.
3. Actual RLS policy set currently deployed for `event_users`, `exhibitors`, and updated role semantics.
4. Whether `/exhibitor/*` or `/app/exhibitor/*` is intended canonical long-term path.
5. Final intended signal permissions model beyond platform-only operations.
