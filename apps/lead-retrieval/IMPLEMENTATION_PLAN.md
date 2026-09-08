# Lead Intel Admin Web - Implementation Plan

## 1. Scope and Assumptions

- This plan covers **Admin Web only** (desktop-first), based on the provided screenshots.
- Mobile screens are acknowledged but intentionally excluded from this phase.
- Stack:
  - Next.js (App Router)
  - TypeScript
  - Tailwind CSS
  - Supabase (Auth + Postgres + RLS)
- Product is multi-tenant with two operational personas:
  - **Event Organizer** (global event scope)
  - **Exhibitor Admin** (company-scoped view within an event)

---

## 2. Proposed Project Structure

```txt
/
  app/
    (public)/
      login/page.tsx
      auth/callback/route.ts
    (app)/
      layout.tsx                # shell: top bar + left nav + profile footer
      dashboard/page.tsx
      leads/page.tsx
      campaigns/page.tsx        # exhibitor only
      integrations/page.tsx     # exhibitor only
      users/page.tsx
      settings/page.tsx
      licenses/page.tsx         # organizer only
      companies/page.tsx        # organizer only
      api/
        dashboard/route.ts
        leads/route.ts
        campaigns/route.ts
        integrations/route.ts
        users/route.ts
        companies/route.ts
        licenses/route.ts
  components/
    layout/
      app-shell.tsx
      top-switcher.tsx          # Organizer/Exhibitor toggle + event selector
      sidebar.tsx
      user-chip.tsx
    ui/
      card.tsx
      stat-card.tsx
      badge.tsx
      data-table.tsx
      filter-bar.tsx
      status-pill.tsx
    dashboard/
    leads/
    campaigns/
    integrations/
    users/
    companies/
    licenses/
    settings/
  lib/
    supabase/
      client.ts
      server.ts
      middleware.ts
    auth/
      permissions.ts
      guards.ts
    db/
      queries/
      mappers/
    constants/
      roles.ts
      nav.ts
      status.ts
    utils/
      dates.ts
      numbers.ts
  supabase/
    migrations/
    seeds/
    policies/
  types/
    db.ts
    domain.ts
  middleware.ts
  tailwind.config.ts
  next.config.ts
```

### Architectural notes

- Use server components for page-level data hydration; client components for filters, charts, table interactions.
- Use a single app shell with dynamic nav configuration by active persona and permissions.
- Keep all tenant-bound access in SQL/RLS; do not rely on frontend filtering for security.

---

## 3. Domain Model and Database Schema (Supabase Postgres)

## 3.1 Core tenancy and identity

### `profiles`
- `id uuid pk` (references `auth.users.id`)
- `full_name text`
- `avatar_url text`
- `default_event_id uuid null`
- `created_at timestamptz`

### `organizations`
- Organizer account container
- `id uuid pk`
- `name text`
- `industry text`
- `company_size text`
- `timezone text`
- `date_format text`
- `language text`
- `created_at timestamptz`

### `events`
- `id uuid pk`
- `organization_id uuid fk -> organizations.id`
- `name text`
- `starts_on date`
- `ends_on date`
- `city text`
- `country text`
- `status text` (`draft|active|archived`)
- `created_at timestamptz`

### `companies`
- Exhibitor companies
- `id uuid pk`
- `organization_id uuid fk -> organizations.id`
- `name text`
- `crm_status text` (`connected|not_connected|error`)
- `is_active boolean`
- `created_at timestamptz`

### `event_companies`
- Company participation in an event (many-to-many)
- `id uuid pk`
- `event_id uuid fk -> events.id`
- `company_id uuid fk -> companies.id`
- `booth_label text null`
- `status text` (`active|inactive`)
- `unique(event_id, company_id)`

### `memberships`
- Role assignment at event scope, optionally tied to company
- `id uuid pk`
- `user_id uuid fk -> profiles.id`
- `organization_id uuid fk -> organizations.id`
- `event_id uuid fk -> events.id`
- `company_id uuid null fk -> companies.id`
- `role text` (`organizer_admin|exhibitor_admin|booth_staff`)
- `status text` (`active|inactive|invited`)
- `unique(user_id, event_id, coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid), role)`

---

## 3.2 Licensing and seat management (Organizer UI)

### `licenses`
- `id uuid pk`
- `organization_id uuid fk`
- `event_id uuid fk`
- `company_id uuid fk`
- `seat_limit int`
- `expires_on date`
- `status text` (`active|expired|suspended`)
- `created_at timestamptz`

### `license_assignments`
- User seat consumption
- `id uuid pk`
- `license_id uuid fk`
- `user_id uuid fk -> profiles.id`
- `assigned_at timestamptz`
- `unique(license_id, user_id)`

---

## 3.3 Leads and intelligence

### `leads`
- `id uuid pk`
- `event_id uuid fk`
- `company_id uuid fk` (owner exhibitor)
- `owner_user_id uuid null fk -> profiles.id`
- `full_name text`
- `job_title text`
- `email text null`
- `phone text null`
- `account_name text null`
- `priority_score int` (0-100)
- `priority_band text` (`hot|high|medium|low`)
- `rating int` (1-5)
- `status text` (`new|working|follow_up|closed`)
- `follow_up_at timestamptz null`
- `sync_status text` (`synced|pending|failed`)
- `source text` (`badge_scan|manual|import|api`)
- `created_at timestamptz`
- `updated_at timestamptz`

### `lead_tags`
- Controlled tags for quick labels
- `id uuid pk`
- `organization_id uuid fk`
- `name text`
- `category text` (`budget|authority|timeline|need|other`)
- `is_active boolean`

### `lead_tag_links`
- `lead_id uuid fk`
- `tag_id uuid fk`
- `created_by uuid fk -> profiles.id`
- `created_at timestamptz`
- `pk(lead_id, tag_id)`

### `lead_notes`
- `id uuid pk`
- `lead_id uuid fk`
- `author_user_id uuid fk`
- `note_text text`
- `source text` (`manual|transcription|ai`)
- `created_at timestamptz`

### `lead_activities`
- Event feed powering "Recent Activity"
- `id uuid pk`
- `event_id uuid fk`
- `company_id uuid null fk`
- `actor_user_id uuid null fk`
- `entity_type text` (`lead|campaign|integration|license|user`)
- `entity_id uuid null`
- `activity_type text`
- `payload jsonb`
- `created_at timestamptz`

---

## 3.4 Campaigns (Exhibitor UI)

### `campaigns`
- `id uuid pk`
- `event_id uuid fk`
- `company_id uuid fk`
- `name text`
- `subject text`
- `body_html text`
- `status text` (`draft|scheduled|sent`)
- `scheduled_at timestamptz null`
- `sent_at timestamptz null`
- `created_by uuid fk`
- `created_at timestamptz`

### `campaign_recipients`
- `id uuid pk`
- `campaign_id uuid fk`
- `lead_id uuid fk`
- `delivery_status text` (`queued|sent|failed`)
- `opened_at timestamptz null`
- `clicked_at timestamptz null`
- `unique(campaign_id, lead_id)`

---

## 3.5 Integrations and sync health (Exhibitor UI)

### `integrations`
- `id uuid pk`
- `event_id uuid fk`
- `company_id uuid fk`
- `provider text` (`salesforce|hubspot|marketo|pipedrive`)
- `status text` (`connected|not_connected|error`)
- `settings jsonb`
- `last_sync_at timestamptz null`
- `sync_health numeric(5,2) null`
- `created_at timestamptz`
- `updated_at timestamptz`
- `unique(event_id, company_id, provider)`

### `integration_sync_runs`
- `id uuid pk`
- `integration_id uuid fk`
- `started_at timestamptz`
- `completed_at timestamptz null`
- `status text` (`running|success|failed`)
- `processed_count int`
- `error_count int`
- `details jsonb`

---

## 3.6 Settings and preferences

### `notification_preferences`
- `id uuid pk`
- `user_id uuid fk`
- `event_id uuid fk`
- `new_lead_alerts boolean`
- `daily_digest boolean`
- `crm_sync_errors boolean`
- `license_expiration boolean`
- `updated_at timestamptz`

### `billing_accounts` (Organizer-facing summary only in v1)
- `id uuid pk`
- `organization_id uuid fk`
- `plan_name text`
- `monthly_cost numeric(10,2)`
- `next_billing_date date`
- `status text`

---

## 3.7 Suggested indexes

- `leads(event_id, company_id, priority_score desc)`
- `leads(event_id, status, follow_up_at)`
- `campaigns(event_id, company_id, status)`
- `integrations(event_id, company_id, provider)`
- `memberships(user_id, event_id, company_id, status)`
- `licenses(event_id, company_id, status)`
- `lead_activities(event_id, created_at desc)`

---

## 4. RBAC Model

## 4.1 Roles

- `organizer_admin`
  - Global across an event.
  - Access to organizer nav and all exhibitors in selected event.
- `exhibitor_admin`
  - Scoped to one company (or more, if explicitly assigned) in selected event.
  - Full CRUD for that company data.
- `booth_staff`
  - Scoped to company in selected event.
  - Can read leads, create notes, update lead follow-up/status; no user/license/integration admin.

## 4.2 Permission matrix

- Dashboard:
  - Organizer: global event metrics.
  - Exhibitor roles: company-scoped metrics.
- Leads:
  - Organizer: read/update across all event companies.
  - Exhibitor admin: read/update own company leads.
  - Booth staff: read/update assigned or company leads (configurable).
- Campaigns:
  - Organizer: no direct access in v1 nav.
  - Exhibitor admin: full access.
  - Booth staff: read only or no access (start with no access).
- Integrations:
  - Organizer: no direct access in v1 nav.
  - Exhibitor admin: manage CRM integrations.
  - Booth staff: no access.
- Users:
  - Organizer: manage all event users and assignments.
  - Exhibitor admin: manage users for their company only.
  - Booth staff: no access.
- Companies + Licenses:
  - Organizer only.
- Settings:
  - All: own profile and notification preferences.
  - Organizer: org/regional/billing controls.
  - Exhibitor admin: company-level settings and security actions shown in design.

---

## 5. RLS Policy Plan (Supabase)

## 5.1 Helper functions (SQL)

- `current_user_id()` -> `auth.uid()`
- `is_event_member(p_event_id uuid)`
- `has_event_role(p_event_id uuid, p_roles text[])`
- `has_company_access(p_event_id uuid, p_company_id uuid, p_roles text[])`
- `current_membership_event_ids()`

All table policies reference memberships, never raw email/domain checks.

## 5.2 Policy strategy by data class

- Organizer-global event tables (`companies`, `licenses`, event-wide dashboards):
  - `select` allowed for `organizer_admin` where `memberships.event_id = row.event_id`.
  - `insert/update/delete` restricted to `organizer_admin`.
- Company-scoped operational tables (`leads`, `campaigns`, `integrations`):
  - `select` allowed when user has membership for `row.event_id` and:
    - role is `organizer_admin`, or
    - role in (`exhibitor_admin`, `booth_staff`) and `memberships.company_id = row.company_id`.
  - `insert/update/delete`:
    - organizer admin: yes (event-wide)
    - exhibitor admin: yes (own company)
    - booth staff: limited update (notes/status/follow-up only via RPC or guarded API route)
- `memberships` and user admin tables:
  - organizer admin can manage all rows in event.
  - exhibitor admin can manage only rows for same company and non-organizer roles.
- `profiles`:
  - users can read/update own profile.
  - organizer admins can read event users' basic fields via secure view.

## 5.3 Secure access pattern

- Prefer querying through:
  - policy-protected base tables for simple CRUD.
  - `security definer` RPC/functions for privileged aggregates (dashboard cards/charts) with explicit role checks.
- For charts and stat cards, expose read-only SQL views per scope:
  - `v_dashboard_organizer_event`
  - `v_dashboard_exhibitor_company`

---

## 6. Navigation Structure (Desktop Admin)

## 6.1 Shared shell

- Left sidebar + top context bar + profile avatar/footer.
- Top context controls:
  - Persona switch: `Event Organizer` / `Exhibitor Admin`
  - Event selector dropdown

## 6.2 Organizer navigation

- `Dashboard` (Global Event Scope)
- `Licenses`
- `Companies`
- `Leads` (Global Access)
- `Users`
- `Settings`

## 6.3 Exhibitor navigation

- `Dashboard` (Company Scoped View)
- `Leads`
- `Campaigns`
- `Integrations`
- `Users`
- `Settings`

## 6.4 Route gating

- Hide unauthorized nav items at render-time.
- Enforce authorization again server-side and via RLS.
- If persona switch is selected but user lacks role in selected event, redirect to allowed persona/default screen.

---

## 7. Build Phases

## Phase 0 - Foundation
- Initialize Supabase project settings (env, auth providers, email templates).
- Implement base schema migrations for tenancy, memberships, and profiles.
- Add shared design tokens/components in Tailwind matching desktop screenshots.

## Phase 1 - Auth and App Shell
- Supabase Auth (email/password or magic link).
- Session handling in middleware and server components.
- Desktop shell: sidebar, top persona switcher, event selector, avatar menu.
- Role/persona-aware nav rendering.

## Phase 2 - Core Data + RLS
- Build tables for events, companies, memberships, licenses, leads.
- Implement RLS helper functions and policies.
- Seed realistic demo data for organizer and exhibitor contexts.

## Phase 3 - Organizer Module Delivery
- Organizer Dashboard (cards + charts + recent activity).
- Licenses page (seat usage table + statuses).
- Companies page (company KPIs + CRM status).
- Leads (global event list with company filter).

## Phase 4 - Exhibitor Module Delivery
- Exhibitor Dashboard (company-scoped metrics + activity).
- Leads page (company-scoped list + filters + follow-up/status updates).
- Campaigns page (draft/scheduled/sent + recipient/open/click metrics).
- Integrations page (provider cards, connection status, last sync, health).

## Phase 5 - User and Settings
- Users page with role assignment flows and invite actions.
- Settings page:
  - Organization/regional values
  - Notification preferences
  - Security actions
  - Billing summary (read-first)

## Phase 6 - Hardening and QA
- Add API/route tests for authorization boundaries.
- Add SQL policy tests for cross-tenant isolation.
- Add observability: audit events in `lead_activities`.
- Performance pass (indexes, pagination, query plans).

## Phase 7 - Release Readiness
- UAT against organizer + exhibitor scenarios.
- Backup/restore verification.
- Production migration runbook + rollback plan.
- Post-launch monitoring dashboards.

---

## 8. Non-Functional Requirements

- Strict tenant isolation with RLS first.
- P95 list page response under 500ms at moderate dataset size.
- All critical actions logged to activity/audit stream.
- Accessibility baseline (keyboard navigation, contrast, focus).
- Deterministic date/time formatting using event/org timezone settings.

---

## 9. Step 1 Deliverable Status

- `IMPLEMENTATION_PLAN.md` created.
- No scaffolding/code generation performed yet.
