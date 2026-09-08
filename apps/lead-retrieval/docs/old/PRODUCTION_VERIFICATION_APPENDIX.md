# Production Verification Appendix

> Verification pass on audit findings with exact file-level evidence. No application code modified.

---

## 1. RLS / Role Mismatch

### Finding

RLS policies in migrations check `current_role() = 'organizer'` or `'exhibitor'`. The app stores and expects `platform_admin`, `organizer_admin`, `exhibitor_admin`, `event_organizer`. Exhibitors with `exhibitor_admin` would fail RLS on leads and campaigns because `current_role()` returns the raw value from `users.role`.

### Verdict: **Confirmed**

### Evidence

**Role values used in app code (reads/compares):**

| File | Line(s) | Role Values |
|------|---------|-------------|
| `lib/auth/session.ts` | 9-10, 18-26, 29-33 | `platform_admin`, `organizer_admin`, `exhibitor_admin`, `viewer`; normalizes `event_organizer`, `organizer` → `organizer_admin` |
| `app/auth/server-callback/route.ts` | 22-34 | Same |
| `app/(public)/login/login-form.tsx` | 18-25 | Same |
| `app/auth/callback/page.tsx` | 9-16 | Same |
| `lib/supabase/middleware.ts` | 81-91 | Compares `role !== "platform_admin"`, `!== "organizer_admin"`, `!== "exhibitor_admin"` |
| `lib/data/exhibitor-context.ts` | 12-16 | `platform_admin`, `organizer_admin`, `event_organizer` |
| `lib/data/organizer-scope.ts` | 36-39 | `organizer_admin`, `event_organizer`, `organizer` |
| `app/admin/users/actions.ts` | 22, 155-158 | `platform_admin`, `organizer_admin`, `event_organizer`, `exhibitor_admin` |
| `components/admin/users-index-client.tsx` | 107-109, 274-277 | `organizer_admin`, `exhibitor_admin`, `viewer` |

**Role values assumed in RLS (DB policies):**

| File | Line(s) | Policy Condition |
|------|---------|------------------|
| `supabase/migrations/0001_phase1.sql` | 100, 109, 117, 121, 129, 140, 146, 163, 177, 184, 188, 197, 210, 219, 223, 236, 249, 262, 271, 280 | `current_role() = 'organizer'` or `'exhibitor'` |
| `supabase/migrations/0002_exhibitor_pages.sql` | 34, 63, 71, 79, 83, 91 | `current_role() in ('organizer','exhibitor')` or `= 'organizer'` |
| `supabase/migrations/0003_lead_enrichments.sql` | 38, 56 | `current_role() = 'exhibitor'` |
| `supabase/migrations/0008_signal_library.sql` | 53, 99, 101, 103, 106, 116, 130, 132, 136, 148 | `current_role() = 'organizer'` or `'exhibitor'` |
| `supabase/migrations/0009_admin_events.sql` | 32, 38, 44, 45, 51 | `current_role() = 'platform_admin'` |

**Exact mismatch:**

- `current_role()` is defined in `0001_phase1.sql` lines 73-80: `select role from public.users where id = auth.uid() limit 1`
- It returns the literal `users.role` value.
- App writes: `exhibitor_admin`, `event_organizer` (never `organizer` or `exhibitor`).
- Leads RLS (`0001_phase1.sql` 229-239): exhibitor branch requires `current_role() = 'exhibitor'`.
- If `users.role = 'exhibitor_admin'`, then `current_role() = 'exhibitor_admin'`, so `'exhibitor_admin' = 'exhibitor'` is FALSE.
- Result: Exhibitor cannot pass RLS on leads.

### Impact

Exhibitors using `createSupabaseServerClient()` (anon key, RLS applies) will get zero rows for leads, campaigns, lead_enrichments. Organizer leads use `createAdminClient()` and bypass RLS, so organizers are unaffected.

### Recommended Fix Direction

1. Add migration: `CREATE OR REPLACE FUNCTION public.current_role() RETURNS text ...` that maps `organizer_admin`, `event_organizer`, `organizer` → `'organizer'` and `exhibitor_admin` → `'exhibitor'` for RLS compatibility, OR
2. Add migration: Update all RLS policies to use `current_role() in ('organizer','organizer_admin','event_organizer')` and `current_role() in ('exhibitor','exhibitor_admin')`.

---

## 2. users.role CHECK Constraint Mismatch

### Finding

Migration `0001_phase1.sql` defines `users.role` with `check (role in ('organizer', 'exhibitor'))`. The app inserts `exhibitor_admin`, `event_organizer` via invite flows. Those inserts would violate the constraint.

### Verdict: **Confirmed** (migration in repo); **Needs Runtime Verification** (whether constraint exists in production)

### Evidence

**Migration source:**

```
File: supabase/migrations/0001_phase1.sql
Line: 15
Exact: role text not null check (role in ('organizer', 'exhibitor')),
```

**Allowed values (migration):** `organizer`, `exhibitor`

**Values app writes:**

| File | Line(s) | Value Written |
|------|---------|---------------|
| `app/api/organizer/invite/route.ts` | 172 | `role: "exhibitor_admin"` |
| `app/admin/users/actions.ts` | 264 | `role` (variable: `"event_organizer"` or `"exhibitor_admin"`) |
| `lib/data/users.ts` | 51, 67 | `role: "exhibitor_admin"` |

**No migration in repo alters or drops this constraint.** Grep for `alter table public.users` and `role` in migrations shows only column adds (email, license_id), not constraint changes.

### Impact

If the constraint is still present: `INSERT`/`UPSERT` into `users` with `role = 'exhibitor_admin'` or `'event_organizer'` will fail with a check constraint violation. Invite flows would fail at the users upsert step.

### Recommended Fix Direction

1. Add migration: `ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;` and optionally add new constraint allowing `platform_admin`, `organizer_admin`, `exhibitor_admin`, `event_organizer`, `organizer`, `exhibitor`.
2. Runtime: Run `\d public.users` in psql to confirm current constraint state.

---

## 3. Missing Migrations / Schema Drift

### Finding

Several tables and columns exist in `types/database.ts` (generated from live Supabase) but have no corresponding `CREATE TABLE` or `ALTER TABLE` in the migrations in the repo.

### Verdict: **Confirmed**

### Evidence

**Tables with CREATE in migrations:**

| Table | Migration |
|-------|-----------|
| companies | 0001_phase1.sql |
| users | 0001_phase1.sql |
| licenses | 0001_phase1.sql |
| leads | 0001_phase1.sql |
| campaigns | 0002_exhibitor_pages.sql, 0005_campaign_messaging.sql |
| campaign_recipients | 0005_campaign_messaging.sql |
| campaign_messages | 0005_campaign_messaging.sql |
| email_events | 0005_campaign_messaging.sql |
| lead_enrichments | 0003_lead_enrichments.sql |
| events | 0009_admin_events.sql |
| signals | 0008_signal_library.sql |

**Tables in types/database.ts with NO CREATE in migrations:**

| Table | types/database.ts | Migrations |
|-------|-------------------|------------|
| exhibitors | Yes (company_id, event_id, status, created_at, updated_at) | 0010 adds unique index only; no CREATE |
| event_users | Yes (event_id, user_id, exhibitor_company_id, status, permissions, created_at) | None |
| license_plans | Yes (id, code, name, default_term_months, created_at) | None |

**Columns in types but not in migrations:**

| Table | Column | types/database.ts | Migration |
|-------|--------|-------------------|-----------|
| events | company_id | Yes (required in Insert) | 0009 creates events without company_id; no ALTER adds it |
| events | is_active, location | Yes | 0009 has city, state, start_date, end_date only |
| licenses | event_id, exhibitor_company_id | Yes | 0001 has company_id only; later migrations add these (0011 enforces exhibitor_company_id NOT NULL) |

**Clean drift list:**

| Item | In types | In migrations | Drift |
|------|----------|---------------|------|
| exhibitors table | ✓ | 0010 index only | CREATE missing |
| event_users table | ✓ | — | CREATE missing |
| license_plans table | ✓ | — | CREATE missing |
| events.company_id | ✓ | — | Column missing in 0009 |
| events.is_active | ✓ | — | Column missing |
| events.location | ✓ | — | Column missing |
| licenses.event_id | ✓ | — | 0001 has company_id only; no ADD in repo |
| licenses.exhibitor_company_id | ✓ | 0011 sets NOT NULL | No ADD COLUMN in repo; 0011 backfills |

**Code that uses these:**

- `exhibitors`: `lib/data/organizer-scope.ts` (90), `app/api/organizer/invite/route.ts` (124), `app/admin/users/actions.ts` (211), `app/api/v1/exhibitors/route.ts` (225), `app/api/admin/licenses/route.ts` (100), `lib/data/admin-exhibitors.ts` (92), etc.
- `event_users`: `lib/data/organizer-scope.ts` (46), `app/api/organizer/invite/route.ts` (190), `app/admin/users/actions.ts` (280), `app/auth/server-callback/route.ts` (96), `app/api/auth/activate-memberships/route.ts` (19), etc.
- `events.company_id`: `lib/data/organizer-scope.ts` (68, 79, 99)
- `license_plans`: `lib/data/admin-licenses.ts` (54), `types/database.ts` licenses FK

### Impact

- Fresh `supabase db reset` from repo migrations would not create exhibitors, event_users, license_plans, or events.company_id. App would fail.
- Production schema was likely applied outside the repo or via manual migrations.

### Recommended Fix Direction

1. Add migrations for: `CREATE TABLE exhibitors`, `CREATE TABLE event_users`, `CREATE TABLE license_plans`.
2. Add migration: `ALTER TABLE events ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);`
3. Regenerate types from linked project and confirm alignment.

---

## 4. Invite / Membership Fragility

### Finding

Invite flows create users and event_users. `company_id` and `exhibitor_company_id` can be missed or inconsistent in specific code paths.

### Verdict: **Partially Confirmed**

### Evidence

**Organizer invite flow** (`app/api/organizer/invite/route.ts`):

| Step | Line(s) | company_id | exhibitor_company_id |
|------|---------|------------|----------------------|
| users.upsert | 169-179 | `company_id: exhibitorCompanyId` ✓ | N/A |
| event_users.insert | 190-198 | N/A | `exhibitor_company_id: exhibitorCompanyId` ✓ |

Both set. Cannot be missed in this flow.

**Admin invite flow** (`app/admin/users/actions.ts`):

| Step | Line(s) | company_id | exhibitor_company_id |
|------|---------|------------|----------------------|
| users.upsert | 261-271 | `company_id: companyId` | N/A |
| event_users.insert | 280-286 | N/A | `role === "exhibitor_admin" ? exhibitorCompanyId : null` |

- For `exhibitor_admin`: `companyId` must equal `exhibitorCompanyId` (validated line 172). Both set.
- For `event_organizer`: `company_id: companyId` (organizer company from form). `exhibitor_company_id: null`. Correct.

**Where company_id can be missed:**

1. **createExhibitorUser** (`lib/data/users.ts` 48-56): Inserts with `company_id: input.companyId`. Caller must pass it. Used by campaigns.ts `createCampaign` path – not invite. Invite flows do not use this.
2. **Legacy/manual users**: No backfill. If a user row exists without company_id (e.g. created outside invite), exhibitor pages show "Your account is not assigned to a company yet" (`app/(app)/exhibitor/leads/page.tsx` 139-142).

**Where exhibitor_company_id can be missed:**

- `event_users.exhibitor_company_id` is null for `event_organizer` (by design).
- For `exhibitor_admin` it is set in both invite flows.
- `getOrganizerScope` (organizer-scope.ts 103-106) includes `exhibitor_company_id` from event_users in companyIds. If null for an exhibitor membership, that company is omitted from scope. Exhibitor leads do not use event_users.exhibitor_company_id; they use users.company_id.

**Redeem flow** (`app/auth/server-callback/route.ts`, `app/api/auth/activate-memberships/route.ts`):

- Only updates `event_users.status` from `invited` to `active`. No user or event_users creation. No company_id/exhibitor_company_id writes.

### Impact

- Invite flows correctly set company_id and exhibitor_company_id.
- Risk: Manual DB edits, legacy data, or future code paths that create users without these fields.

### Recommended Fix Direction

1. Add application-level validation: exhibitor_admin must have company_id before accessing leads/campaigns (already present: UI shows message when null).
2. Consider DB constraint: `CHECK (role != 'exhibitor_admin' OR company_id IS NOT NULL)` – optional, may conflict with invite order.

---

## 5. Leads Visibility Requirements

### Finding

Exhibitor leads visibility depends on: (1) `requireRole("exhibitor_admin")`, (2) `users.company_id` from DB, (3) app filter `leads.company_id = companyId`, (4) RLS policy. Organizer leads depend on: (1) `requireRole("organizer_admin")`, (2) `getOrganizerScope()` → event_ids from event_users, (3) admin client query `leads.event_id = eventId`.

### Verdict: **Confirmed**

### Evidence

**Exhibitor path (exact code):**

1. `app/(app)/exhibitor/leads/page.tsx` line 61: `requireRole("exhibitor_admin")` → redirects if not exhibitor.
2. Lines 70-76: `supabase.from("users").select("company_id").eq("id", sessionUser.id).maybeSingle()` → `companyId = currentUser?.company_id ?? null`
3. Lines 139-142: If `!scopedCompanyId`, render "Your account is not assigned to a company yet" – no LeadsTable.
4. Lines 146-154: Pass `companyId` to LeadsTable.
5. `LeadsTable` (lines 168-222): `createSupabaseServerClient()` → `supabase.from("leads").select(...).eq("company_id", companyId)`.
6. RLS applies (anon client). Policy `leads_select_scope` (0001_phase1.sql 229-239): `current_role() = 'exhibitor' AND company_id = current_company_id()`.
7. If `users.role = 'exhibitor_admin'`, `current_role()` returns `'exhibitor_admin'`, so `'exhibitor_admin' = 'exhibitor'` is false → RLS denies all rows.

**Required fields for exhibitor:**

| Field | Source | Required |
|-------|--------|----------|
| users.role | DB | Must normalize to exhibitor_admin |
| users.company_id | DB | Must be non-null; else "not assigned" |
| leads.company_id | Data | Must match users.company_id for rows to appear |

**Exact failure scenarios (with evidence):**

| Scenario | Code Location | Result |
|----------|---------------|--------|
| users.company_id null | exhibitor/leads/page.tsx:76, 139 | `scopedCompanyId` null → "Your account is not assigned to a company yet" |
| RLS role mismatch | 0001:237 `current_role() = 'exhibitor'` | App has exhibitor_admin → RLS fails → zero rows |
| No leads for company | Data | Query succeeds, empty array → "No leads match the current filters" |
| eventId filter excludes all | LeadsTable:183-185 | If eventId set and no leads have that event_id, empty |

**Organizer path (exact code):**

1. `app/app/organizer/leads/page.tsx` line 24: `requireRole("organizer_admin")`
2. Line 30: `getOrganizerScope(sessionUser.id)` → uses `createAdminClient()`, reads event_users, events, exhibitors
3. Lines 34-41: If `!scope.events.length || !eventId`, render "No events are scoped to your organizer account yet"
4. Lines 44-49: `createAdminClient().from("leads").select(...).eq("event_id", eventId)` – RLS bypassed
5. Organizer scope requires: `event_users` rows with `user_id` = organizer, `status in ('active','invited')`, and events loaded for those event_ids

**Organizer failure scenarios:**

| Scenario | Code Location | Result |
|----------|---------------|--------|
| No event_users rows | organizer-scope.ts:45-64 | eventIds empty → scope.events empty → "No events are scoped..." |
| event_users.status not in (active, invited) | organizer-scope.ts:49 | Rows excluded → same |
| leads.event_id null for all | organizer/leads/page.tsx:47 | `.eq("event_id", eventId)` excludes null event_id leads |
| events.company_id missing | organizer-scope.ts:68 | Query may fail or return incomplete; 0009 does not add company_id |

### Impact

- Exhibitor: RLS mismatch is the primary risk for "valid user sees zero leads."
- Organizer: Admin client bypasses RLS; failures are from missing event_users or data (leads.event_id null).

### Recommended Fix Direction

1. Fix RLS role alignment (see Finding 1).
2. Ensure users.company_id is set for all exhibitor_admin (invite already does this).
3. Ensure event_users and events.company_id exist for organizers (migrations + data).
