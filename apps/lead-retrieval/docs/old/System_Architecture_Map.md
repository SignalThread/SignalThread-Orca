# System Architecture Map

> Code-grounded. For a short JSON summary see [`SYSTEM_ARCHITECTURE.json`](./SYSTEM_ARCHITECTURE.json). For the product manifest see [`ADMIN_PROJECT_SUMMARY.md`](./ADMIN_PROJECT_SUMMARY.md). For product capability set vs code-verified behavior see [`PROJECT_SUMMARY_APP.md`](./PROJECT_SUMMARY_APP.md) and [`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md).

---

## 1. System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Lead Intel (Admin + Mobile)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐                       ┌──────────────────┐            │
│  │   Admin App      │                       │   Mobile App      │           │
│  │   (Next.js)      │                       │   Lead Intel Scan │           │
│  │                  │                       │   (Expo, ext repo)│           │
│  └────────┬─────────┘                       └────────┬─────────┘            │
│           │                ┌──────────────────────┘   │                      │
│           │                │  Planned offline path:  │                      │
│           │                │  SQLite (local_leads)   │                      │
│           │                │  → sync_outbox → sync   │                      │
│           │                └────────────┬────────────┘                      │
│           │                             │                                    │
│           └─────────────────────────────┴─────────────────────────┐         │
│                                     ▼                               │         │
│                    ┌────────────────────────────────┐               │         │
│                    │ Supabase (Postgres + Auth +    │               │         │
│                    │ RLS) — single system of record │               │         │
│                    │ Shared: public.leads, users, … │               │         │
│                    └────────────────────────────────┘               │         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Current vs planned (mobile):** Today, mobile capture depends on network to persist to Supabase. **Planned** (not in this repo): SQLite + outbox + sync engine so capture succeeds locally first; audio uploads queue behind lead sync. Admin is unchanged.

### Major Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Admin App** | Next.js App Router | Web dashboard for platform admins, organizers, exhibitors. Manages events, exhibitors, licenses, leads, campaigns, signals. |
| **Mobile App** | Expo Router (external repo) | Lead Intel Scan — capture, scoring, follow-up. Same Supabase project as Admin — **not** a separate backend. |
| **Supabase** | Postgres + Auth + RLS | Cloud system of record for both clients. |
| **Auth** | Supabase Auth | Email/password, magic links, invite flows. |

### How the Admin App Interacts with Supabase and Mobile

- **Admin ↔ Supabase**: Direct via `@supabase/ssr` (server) and browser client. Service-role client (`createAdminClient()`) for privileged server operations.
- **Mobile ↔ Supabase**: Direct Supabase client from the mobile app. Shares `public.leads` and related tables under the same contract as `types/database.ts`.
- **Admin ↔ Mobile**: No direct API. Both talk to Supabase; `leads` is the shared table when RLS and scoping align.

---

## 2. API Route Inventory

| Route | File Path | Method | Purpose | Auth |
|-------|-----------|--------|---------|------|
| `/api/auth/activate-memberships` | `app/api/auth/activate-memberships/route.ts` | POST | Activates `event_users` rows with `status = 'invited'` to `status = 'active'` for the current user | Session required |
| `/api/auth/server-callback` | `app/auth/server-callback/route.ts` | GET | Auth callback: exchanges `code` or verifies OTP, activates invited memberships, redirects to role home | None (handles auth) |
| `/api/organizer/invite` | `app/api/organizer/invite/route.ts` | POST | Invites exhibitor user: `auth.admin.inviteUserByEmail`, upserts `users`, inserts `event_users`, consumes license seat | `organizer_admin` |
| `/api/admin/licenses` | `app/api/admin/licenses/route.ts` | POST | Creates license for event + exhibitor company | `platform_admin` or `organizer_admin` |
| `/api/admin/licenses/[licenseId]` | `app/api/admin/licenses/[licenseId]/route.ts` | PATCH | Edit license, add seats, or deactivate | `platform_admin` or `organizer_admin` |
| `/api/v1/events/[eventId]` | `app/api/v1/events/[eventId]/route.ts` | DELETE | Deletes event | `platform_admin` |
| `/api/v1/exhibitors` | `app/api/v1/exhibitors/route.ts` | POST | Creates exhibitor (company + license + exhibitors row) for an event | `platform_admin` or `organizer_admin` |
| `/api/v1/exhibitors/[exhibitorId]` | `app/api/v1/exhibitors/[exhibitorId]/route.ts` | DELETE | Deletes exhibitor | `platform_admin` |
| `/api/campaigns` | `app/api/campaigns/route.ts` | GET, POST | List campaigns; create campaign for user's company | Session + `company_id` |
| `/api/campaigns/[campaignId]` | `app/api/campaigns/[campaignId]/route.ts` | PATCH | Update draft campaign (name, signals, draft content) | Session + `company_id` match |
| `/api/campaigns/[campaignId]/generate-draft` | `app/api/campaigns/[campaignId]/generate-draft/route.ts` | POST | Generates draft email content via LLM for campaign recipients | Session + `company_id` match |
| `/api/campaigns/[campaignId]/recipients` | `app/api/campaigns/[campaignId]/recipients/route.ts` | GET, POST, DELETE | List/add/remove campaign recipients (leads) | Session + `company_id` match |
| `/api/campaigns/[campaignId]/recipients/[leadId]` | `app/api/campaigns/[campaignId]/recipients/[leadId]/route.ts` | DELETE | Remove single recipient from campaign | Session + `company_id` match |
| `/api/campaigns/[campaignId]/messages` | `app/api/campaigns/[campaignId]/messages/route.ts` | GET, PATCH | List campaign messages; update draft subject/body per recipient | Session + `company_id` match |
| `/api/signals` | `app/api/signals/route.ts` | GET, POST | List signals (filtered by role); create signal | `platform_admin` |
| `/api/signals/[signalId]` | `app/api/signals/[signalId]/route.ts` | GET, PATCH, DELETE | Get/update/delete signal | `platform_admin` |
| `/auth/signout` | `app/auth/signout/route.ts` | POST | Signs out user, redirects to `/login` | Session |

**Note**: Invite redirect URL is hardcoded as `https://lr.signalthread.ai/auth/callback`. The `/auth/callback` page redirects to `/auth/server-callback` for server-side code/OTP handling.

---

## 3. Database Models

Source of truth: `types/database.ts` (generated from Supabase) and `supabase/migrations/*.sql`.

### Tables

| Table | Key Fields | Relationships | Where Defined |
|-------|------------|---------------|---------------|
| **companies** | `id`, `name`, `organizer_id` (→ auth.users) | - | `0001_phase1.sql` |
| **users** | `id` (→ auth.users), `role`, `company_id`, `license_id`, `email`, `full_name` | companies, licenses | `0001_phase1.sql`, `0002_users_email_license.sql`, `0002_exhibitor_pages.sql` |
| **licenses** | `id`, `company_id`, `event_id`, `exhibitor_company_id`, `seats_total`, `seats_used`, `status`, `expires_at` | companies, events | `0001_phase1.sql`; `event_id`/`exhibitor_company_id` added later; `0011` enforces `exhibitor_company_id` NOT NULL |
| **leads** | `id`, `company_id`, `event_id`, `owner_user_id`, `full_name`, `email`, `job_title`, `priority_score`, `status`, `follow_up_date`, enriched_* | companies, events, users | `0001_phase1.sql`, `0003`, `0004` |
| **lead_enrichments** | `id`, `lead_id`, `provider`, `raw_response` | leads | `0003_lead_enrichments.sql` |
| **events** | `id`, `name`, `city`, `state`, `start_date`, `end_date`, `status`, `company_id` | companies | `0009_admin_events.sql`; `company_id` in types (Needs verification: migration) |
| **exhibitors** | `id`, `event_id`, `company_id`, `status` | events, companies | **Needs verification** – used in code; `0010` adds unique index on `(event_id, company_id)` |
| **event_users** | `id`, `event_id`, `user_id`, `exhibitor_company_id`, `status`, `permissions` | events, users, companies | **Needs verification** – used in invite/organizer-scope; no create migration in repo |
| **campaigns** | `id`, `company_id`, `name`, `mode`, `status`, `selected_signals`, draft_* | companies | `0002_exhibitor_pages.sql`, `0005_campaign_messaging.sql` |
| **campaign_recipients** | `id`, `campaign_id`, `lead_id` | campaigns, leads | `0005_campaign_messaging.sql`, `0006` unique |
| **campaign_messages** | `id`, `campaign_id`, `recipient_id`, `subject`, `body_*`, `status` | campaigns, campaign_recipients | `0005`, `0007` unique |
| **email_events** | `id`, `campaign_message_id`, `event_type`, `metadata` | campaign_messages | `0005` |
| **signals** | `id`, `name`, `category`, `default_prompt`, `visibility`, `role_scope`, `is_active` | - | `0008_signal_library.sql` |
| **license_plans** | `id`, `code`, `name`, `default_term_months` | - | In types; migration **Needs verification** |

### Key Relationships

- **events.company_id** → companies (event owner/organizer company)
- **exhibitors** = (event_id, company_id) join; links events to exhibitor companies
- **licenses** = event + exhibitor_company scoped; `company_id` = payer (organizer company), `exhibitor_company_id` = exhibitor
- **leads.company_id** = exhibitor company that owns the lead
- **leads.event_id** = optional event scope
- **event_users** = membership: user ↔ event; `exhibitor_company_id` set for exhibitor admins

---

## 4. Authentication Flow

### Login

1. User visits `/login` (`app/(public)/login/page.tsx`).
2. `LoginForm` submits to Supabase Auth (email/password or magic link).
3. Supabase redirects to configured callback URL (e.g. `https://lr.signalthread.ai/auth/callback`).

### Session Creation

- **Server**: `createSupabaseServerClient()` in `lib/supabase/server.ts` – cookie-based session.
- **Client**: `createSupabaseBrowserClient()` in `lib/supabase/client.ts`.
- **Middleware**: `lib/supabase/middleware.ts` – `updateSession()` refreshes session, enforces route access by role.

### Auth Callback

1. User lands on `/auth/callback` (`app/auth/callback/page.tsx`).
2. **Hash params** (e.g. `access_token`, `refresh_token`): client calls `supabase.auth.setSession()`, then `POST /api/auth/activate-memberships`, then redirects by role.
3. **Query params** (`code` or `token_hash`): client redirects to `/auth/server-callback?…`.
4. **Server callback** (`app/auth/server-callback/route.ts`):
   - If `code`: `exchangeCodeForSession(code)`.
   - If `token_hash`: `verifyOtp({ type, token_hash })`.
   - Calls `activateInvitedMemberships()` (admin client: `event_users` status `invited` → `active`).
   - Resolves redirect path from `users.role` → `/admin`, `/app/organizer`, or `/app/exhibitor`.

### Relationship Between auth.users and public.users

- `public.users.id` = `auth.users.id` (FK, cascade delete).
- `public.users` holds `role`, `company_id`, `license_id`, `email`, `full_name`.
- Role is read from `public.users` after auth; middleware and pages use it for routing and scoping.
- Invite flow: `auth.admin.inviteUserByEmail()` creates auth user, then app upserts `public.users` and inserts `event_users`.

---

## 5. Invite System

### Invite Creation

**Entry points**:

- `app/api/organizer/invite/route.ts` (POST) – organizer invites exhibitor.
- `app/admin/users/actions.ts` – `addUserInviteAction()` – platform/organizer admin adds user.

**Flow**:

1. Actor: `organizer_admin` or `platform_admin`.
2. Validate: event in scope, exhibitor company in event, active license with free seats.
3. `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: INVITE_REDIRECT_TO })`.
4. Upsert `users`: `id` = invited user id, `role` = `exhibitor_admin`, `company_id` = exhibitor company, `license_id` = active license.
5. Insert `event_users`: `event_id`, `user_id`, `exhibitor_company_id`, `status = 'invited'`, `permissions`.
6. Increment `licenses.seats_used` (optimistic lock).
7. Rollback on failure: delete `event_users`, `users`, auth user; revert seat.

### Invite Redemption

1. User clicks link in email → `/auth/callback` (or `/auth/server-callback` with code/token).
2. Session established via `exchangeCodeForSession` or `verifyOtp`.
3. `activateInvitedMemberships()`: admin client updates `event_users` where `user_id` = current user and `status = 'invited'` to `status = 'active'`.
4. Redirect to role home (`/admin`, `/app/organizer`, `/app/exhibitor`).

### User Creation / Upsert

- Invite creates auth user; app upserts `users` with `onConflict: "id"`.
- `event_users` insert is separate; rollback deletes both if either fails.

### Membership Creation

- `event_users` row: `event_id`, `user_id`, `exhibitor_company_id` (for exhibitor_admin), `status` (`invited` → `active`), `permissions`.
- Organizer scope: `getOrganizerScope()` reads `event_users` where `user_id` = organizer and `status in ('active','invited')` to derive events and company IDs.

---

## 6. Membership / Event Access

### event_users Model

| Field | Purpose |
|-------|---------|
| `event_id` | Event membership |
| `user_id` | User (→ users.id) |
| `exhibitor_company_id` | Exhibitor company scope (required for exhibitor_admin) |
| `status` | `invited` or `active` |
| `permissions` | JSON array of permission strings |

### How Users Gain Access to Events

- **Organizers**: `event_users` row with `event_id`, `exhibitor_company_id` = null (or N/A). Scope from `getOrganizerScope(organizerUserId)`.
- **Exhibitors**: `event_users` row with `event_id` and `exhibitor_company_id` = their company. Access via `users.company_id` and exhibitor/event linkage.
- **Platform admins**: No `event_users` dependency; full access via `role = 'platform_admin'`.

### Exhibitor Company Scoping

- `exhibitors` links `event_id` ↔ `company_id` (exhibitor company).
- `licenses` has `event_id`, `exhibitor_company_id`; `company_id` = payer (organizer company).
- Exhibitor users have `users.company_id` = exhibitor company; leads and campaigns are scoped by `company_id`.

---

## 7. Leads Visibility Model

### Scoping Rules

| Actor | Condition | Query Filter |
|------|-----------|--------------|
| **Exhibitor** | `users.company_id` = exhibitor company | `leads.company_id = users.company_id`; optional `event_id` filter |
| **Organizer** | Events from `event_users` (organizer scope) | `leads.event_id` in scoped events; uses `createAdminClient()` |
| **Platform admin** | Full access | Admin client, no app-level filter |

### Key Fields

- **leads.company_id**: Exhibitor company that owns the lead (required).
- **leads.event_id**: Optional event scope.
- **leads.owner_user_id**: Optional lead owner.

### Implementation

- **Exhibitor**: `app/(app)/exhibitor/leads/page.tsx`, `app/(app)/exhibitor/leads/[leadId]/page.tsx` – filter by `company_id` from `users`, optional `event_id`.
- **Organizer**: `app/app/organizer/leads/page.tsx` – `getOrganizerScope()` → event IDs → `leads.event_id in (scope.events)`.
- **RLS**: `0001_phase1.sql` – leads visible if `company_id` in organizer’s companies or `company_id = current_company_id()` for exhibitor. (Policies use `organizer`/`exhibitor`; `current_role()` normalizes from `users.role`.)

---

## 8. RBAC / Role Model

### Roles

| Role | Value in DB | Home Path | Access |
|------|-------------|-----------|--------|
| **Platform admin** | `platform_admin` | `/admin` | Full; events, exhibitors, licenses, users, signals |
| **Organizer admin** | `organizer_admin` / `event_organizer` / `organizer` | `/app/organizer` | Scoped by `event_users`; events, exhibitors, licenses, leads, invite |
| **Exhibitor admin** | `exhibitor_admin` | `/app/exhibitor` | Scoped by `company_id`; leads, campaigns, dashboard |
| **Viewer** | `viewer` | `/app` | Fallback; limited use in types |

### Role Resolution

- `lib/auth/session.ts`: `normalizeSessionRole()` maps `event_organizer`/`organizer` → `organizer_admin`.
- `getRoleHomePath()`: `/admin`, `/app/organizer`, `/app/exhibitor`, or `/app`.

### Route Protection

- **Middleware** (`lib/supabase/middleware.ts`): Redirects unauthenticated to `/login`; redirects by role (`/admin` → platform_admin, `/app/organizer` → organizer_admin, `/app/exhibitor` → exhibitor_admin).
- **Pages**: `requireAuth()`, `requireRole(role)` in `lib/auth/session.ts`.
- **API routes**: `getCurrentSessionUser()`, then role checks.

### App User Behavior

- **Platform admin**: Admin dashboard, events, exhibitors, licenses, users, signals.
- **Organizer**: Event switcher, exhibitors, leads, performance, invite; scope from `getOrganizerScope()`.
- **Exhibitor**: Dashboard, leads, campaigns, integrations, settings; scope by `users.company_id`.

---

## 9. Known Fragile Areas

### Missing or Inconsistent Data

1. **users.company_id null for exhibitor**: Exhibitor pages show "Your account is not assigned to a company yet" and hide leads/dashboard. Invite flow sets `company_id`; manual edits or legacy data can leave it null.
2. **users.role not in allowed set**: Middleware redirects to `/login?error=role`. `normalizeSessionRole()` returns null for unknown roles.
3. **event_users missing for organizer**: `getOrganizerScope()` returns empty events; organizer sees "No events are scoped to your organizer account yet."
4. **license seats exhausted**: Invite fails with "No available seats"; seat increment uses optimistic lock; concurrent invites can still race.
5. **exhibitor_company_id null for exhibitor in event_users**: Exhibitor admin requires it; organizer scope uses it for company IDs. **Needs verification** for exact failure modes.

### Schema vs Migrations

6. **exhibitors / event_users**: Tables used in code; `0010` adds index on exhibitors. Creation migrations for `exhibitors` and `event_users` not found in repo. **Needs verification**.
7. **events.company_id**: In `types/database.ts`; `0009` does not add it. **Needs verification**.
8. **users.role check**: Migrations use `('organizer','exhibitor')`; types/code use `platform_admin`, `organizer_admin`, `exhibitor_admin`. Constraint may have been altered outside migrations. **Needs verification**.

### Auth / Redirect

9. **Invite redirect URL**: Hardcoded `https://lr.signalthread.ai/auth/callback`. Must match Supabase Auth config and deployment URL.
10. **Auth callback split**: Client `/auth/callback` handles hash params; redirects to `/auth/server-callback` for code/OTP. Both paths must stay in sync.

### RLS vs App Logic

11. **RLS role names**: Policies reference `organizer` and `exhibitor`; `current_role()` reads from `users.role`. If DB stores `organizer_admin`/`exhibitor_admin`, policies may not match. **Needs verification**.
12. **Admin client bypass**: `createAdminClient()` bypasses RLS. Used for organizer scope, invite, activate-memberships. Ensures server logic can perform privileged operations.

---

## File Reference

| Area | Key Files |
|------|-----------|
| Auth | `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`, `lib/supabase/admin.ts`, `lib/auth/session.ts` |
| Auth callback | `app/auth/callback/page.tsx`, `app/auth/server-callback/route.ts` |
| Invite | `app/api/organizer/invite/route.ts`, `app/admin/users/actions.ts` |
| Organizer scope | `lib/data/organizer-scope.ts` |
| Exhibitor context | `lib/data/exhibitor-context.ts` |
| Leads (exhibitor) | `app/(app)/exhibitor/leads/page.tsx`, `app/(app)/exhibitor/leads/[leadId]/page.tsx` |
| Leads (organizer) | `app/app/organizer/leads/page.tsx` |
| Database types | `types/database.ts` |
| Migrations | `supabase/migrations/*.sql` |
