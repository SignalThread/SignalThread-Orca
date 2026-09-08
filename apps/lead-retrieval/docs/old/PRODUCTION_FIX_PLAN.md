# Production Fix Plan

> Implementation plan derived from verified audit findings. No application code modified in this document.

**Source docs**: [`System_Architecture_Map.md`](./System_Architecture_Map.md), [`Auth_Visibility_and_Access_Model.md`](./Auth_Visibility_and_Access_Model.md), [`PRODUCTION_READINESS_AUDIT.md`](./PRODUCTION_READINESS_AUDIT.md), [`PRODUCTION_VERIFICATION_APPENDIX.md`](./PRODUCTION_VERIFICATION_APPENDIX.md)

---

## 1. Executive Fix Order

| Order | Batch | Objective | Blocker? |
|-------|-------|-----------|----------|
| 1 | Manual DB Verification | Confirm production schema state before applying migrations | Yes – informs whether Batches 2–3 are needed |
| 2 | Role/RLS alignment | Fix `current_role()` so RLS policies match app role values | Yes |
| 3 | users.role constraint | Allow app role values in DB constraint | Yes |
| 4 | Schema drift | Add missing tables/columns to migrations | Yes (for fresh deploys) |
| 5 | Invite/membership hardening | Rollback completeness, reinvite handling | No |
| 6 | Leads visibility | GET /api/campaigns auth, validation | No |
| 7 | Redirect/env | Move invite redirect to env | No |

**Critical path**: Batches 2 and 3 must complete before invite flows work. Batch 4 is required for `supabase db reset` to succeed. Batches 5–7 can follow.

---

## 2. Must Fix Before Production

1. **RLS / role alignment** – Exhibitors cannot see leads/campaigns until `current_role()` or policies align with `exhibitor_admin`, `organizer_admin`, `platform_admin`.
2. **users.role CHECK** – Invite flows fail at users upsert if constraint still restricts to `organizer`/`exhibitor`.
3. **Schema drift** – Fresh DB from repo migrations lacks exhibitors, event_users, license_plans, events.company_id; app fails.
4. **Redirect URL** – Hardcoded `https://lr.signalthread.ai/auth/callback` breaks in staging/other envs.

---

## 3. Batch 1: Role/RLS Alignment

### Objective

Make RLS policies grant access when `users.role` is `organizer_admin`, `event_organizer`, `exhibitor_admin`, or `platform_admin`, without changing app code.

### Exact Risk Addressed

- `current_role()` returns raw `users.role` (e.g. `exhibitor_admin`).
- Policies check `current_role() = 'exhibitor'` or `= 'organizer'`.
- Result: Exhibitors get zero rows for leads, campaigns, lead_enrichments.

### Files Likely Impacted

- **New migration only** – no app code changes.
- Migration file: `supabase/migrations/0012_current_role_rls_compat.sql` (or next available number).

### Schema/Migration Impact

**Option A (recommended)**: Replace `current_role()` to return RLS-compatible values:

```sql
-- 0012_current_role_rls_compat.sql
create or replace function public.current_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text;
begin
  select role from public.users where id = auth.uid() limit 1 into r;
  r := coalesce(trim(lower(r)), '');
  if r in ('organizer_admin', 'event_organizer', 'organizer') then
    return 'organizer';
  end if;
  if r in ('exhibitor_admin', 'exhibitor') then
    return 'exhibitor';
  end if;
  if r = 'platform_admin' then
    return 'platform_admin';
  end if;
  return r;
end;
$$;
```

**Option B**: Update all RLS policies to use `current_role() in ('organizer','organizer_admin','event_organizer')` and `current_role() in ('exhibitor','exhibitor_admin')`. Higher touch; requires policy-by-policy changes in 0001, 0002, 0003, 0008.

### Runtime Risk

- Low if Option A: Function replacement is backward-compatible; existing policies continue to work.
- Test: Log in as exhibitor_admin, verify leads and campaigns load.

### Acceptance Criteria

- [ ] Migration applies without error.
- [ ] Exhibitor with `users.role = 'exhibitor_admin'` can select leads where `leads.company_id = users.company_id`.
- [ ] Exhibitor can select campaigns for their company.
- [ ] Organizer with `users.role = 'organizer_admin'` or `event_organizer` passes organizer policies (if any use current_role).
- [ ] Platform admin with `users.role = 'platform_admin'` passes events policies (0009 already checks `platform_admin`).

---

## 4. Batch 2: users.role Constraint Alignment

### Objective

Allow app role values (`platform_admin`, `organizer_admin`, `exhibitor_admin`, `event_organizer`) in `users.role` so invite flows succeed.

### Exact Risk Addressed

- `0001_phase1.sql` line 15: `check (role in ('organizer', 'exhibitor'))`.
- App writes `exhibitor_admin`, `event_organizer` → constraint violation on upsert.

### Files Likely Impacted

- **New migration only**.
- Migration file: `supabase/migrations/0013_users_role_constraint.sql`.

### Schema/Migration Impact

```sql
-- 0013_users_role_constraint.sql
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (
  role in (
    'platform_admin',
    'organizer_admin',
    'exhibitor_admin',
    'event_organizer',
    'organizer',
    'exhibitor',
    'viewer'
  )
);
```

If production already has different constraint or no constraint, use `DROP CONSTRAINT IF EXISTS users_role_check` first; the exact constraint name may vary (check `\d public.users`).

### Runtime Risk

- **Pre-requisite**: Run Manual DB Verification to confirm constraint name and existence.
- If constraint was already dropped in production, migration is idempotent (drop does nothing, add may fail if conflicting constraint exists – use `IF NOT EXISTS` pattern or conditional logic).

### Acceptance Criteria

- [ ] Migration applies without error.
- [ ] Organizer invite (`POST /api/organizer/invite`) succeeds; users row has `role = 'exhibitor_admin'`.
- [ ] Admin invite (`addUserInviteAction`) succeeds for both `event_organizer` and `exhibitor_admin`.

---

## 5. Batch 3: Schema Drift Reconciliation

### Objective

Add migrations so `supabase db reset` produces a schema that matches `types/database.ts` and supports the app.

### Exact Risk Addressed

- exhibitors, event_users, license_plans: no CREATE in repo.
- events.company_id, events.is_active, events.location: not in 0009.
- licenses.event_id, licenses.exhibitor_company_id: 0011 assumes exhibitor_company_id exists; no ADD in repo.

### Files Likely Impacted

- **New migrations** – multiple files.
- Order: Must run before 0010 (exhibitors index) and 0011 (licenses exhibitor_company_id NOT NULL).

**Migration ordering note**: 0010 creates unique index on exhibitors; 0011 alters licenses.exhibitor_company_id. For fresh `db reset`, exhibitors must exist before 0010. Create `0009a_exhibitors_event_users_license_plans.sql` (runs after 0009, before 0010) for exhibitors, event_users, license_plans, and events/licenses columns. Batches 1–2 migrations (0012, 0013) run after 0011.

### Schema/Migration Impact

**0009a_exhibitors_event_users_license_plans.sql** (must run after 0009_admin_events, before 0010):

```sql
-- Exhibitors (must exist before 0010 index)
create table if not exists public.exhibitors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_exhibitors_event_id on public.exhibitors(event_id);
create index if not exists idx_exhibitors_company_id on public.exhibitors(company_id);

-- event_users
create table if not exists public.event_users (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  exhibitor_company_id uuid references public.companies(id) on delete set null,
  status text not null default 'invited',
  permissions jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_users_user_id on public.event_users(user_id);
create index if not exists idx_event_users_event_id on public.event_users(event_id);
create unique index if not exists event_users_event_user_unique on public.event_users(event_id, user_id);

-- license_plans
create table if not exists public.license_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  default_term_months int not null default 12,
  created_at timestamptz not null default now()
);

-- events columns
alter table public.events add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.events add column if not exists is_active boolean default true;
alter table public.events add column if not exists location text;

-- licenses columns (if not present; 0011 assumes exhibitor_company_id exists)
alter table public.licenses add column if not exists event_id uuid references public.events(id) on delete set null;
alter table public.licenses add column if not exists exhibitor_company_id uuid references public.companies(id) on delete set null;
alter table public.licenses add column if not exists license_plan_id uuid references public.license_plans(id) on delete set null;
-- ... (other license columns from types as needed)
```

**Conflict handling**: If production already has these tables/columns, use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. For production that already has schema from manual migrations, these may be no-ops. For fresh DB, they are required.

### Runtime Risk

- **Existing production**: Run Manual DB Verification first. If exhibitors, event_users, license_plans, events.company_id already exist, 0009a uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` and should be no-ops. If production was built from manual migrations and never ran 0009a, adding it may create duplicate objects – verify schema first.
- **Fresh DB**: `supabase db reset` must succeed; 0009a creates tables before 0010/0011 depend on them.

### Acceptance Criteria

- [ ] `supabase db reset` completes without error.
- [ ] `npx supabase gen types typescript --linked` produces types consistent with app usage.
- [ ] Organizer scope loads (event_users, events, exhibitors).
- [ ] Invite flow creates event_users row successfully.

---

## 6. Batch 4: Invite/Redeem and Membership Hardening

### Objective

Improve rollback consistency and reinvite handling.

### Exact Risk Addressed

- Organizer invite rollback does not decrement seat (no current path triggers it; defensive fix).
- Reinvite same email: event_users insert may fail on duplicate; no handling.

### Files Likely Impacted

- `app/api/organizer/invite/route.ts` – rollback logic, reinvite handling
- `app/admin/users/actions.ts` – reinvite handling (already has decrement in rollback)

### Schema/Migration Impact

- None for rollback.
- Batch 3 adds `event_users (event_id, user_id) unique` – enables upsert/conflict handling for reinvite.

### Code Changes (when implemented)

1. **Rollback seat decrement** (`app/api/organizer/invite/route.ts`):
   - Add `incrementSeatWithOptimisticLock` inverse (decrement) or call a shared `decrementLicenseSeat`.
   - In rollback, if seat was incremented before a later failure, decrement. Requires tracking whether seat increment succeeded (currently no such path; add for completeness).

2. **Reinvite handling**:
   - For organizer invite: if `event_users` insert fails with unique violation, treat as success (user already has membership) or return clear error.
   - For admin invite: same.

### Runtime Risk

- Low. Rollback change is defensive; reinvite handling avoids confusing errors.

### Acceptance Criteria

- [ ] Organizer invite rollback includes seat decrement when seat was consumed (if such path is ever added).
- [ ] Reinvite same email returns clear response (success or explicit "already invited" message).

---

## 7. Batch 5: Leads Visibility Hardening

### Objective

Add explicit auth to GET /api/campaigns and ensure no regression in leads visibility.

### Exact Risk Addressed

- GET /api/campaigns has no `getCurrentSessionUser()`; relies on RLS. Add explicit 401 for unauthenticated.
- Document validation that exhibitor_admin has company_id before leads access (already in UI).

### Files Likely Impacted

- `app/api/campaigns/route.ts` – GET handler

### Schema/Migration Impact

None.

### Code Changes (when implemented)

- In `app/api/campaigns/route.ts` GET: add `const sessionUser = await getCurrentSessionUser(); if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });` before the campaigns query.

### Runtime Risk

- Low. Aligns with other API routes.

### Acceptance Criteria

- [ ] Unauthenticated GET /api/campaigns returns 401.
- [ ] Authenticated exhibitor with company_id receives campaigns (after Batch 1 RLS fix).

---

## 8. Batch 6: Redirect/Env Cleanup

### Objective

Move invite redirect URL to environment variable so staging/other envs work.

### Exact Risk Addressed

- Hardcoded `https://lr.signalthread.ai/auth/callback` in `app/api/organizer/invite/route.ts` and `app/admin/users/actions.ts`.

### Files Likely Impacted

- `app/api/organizer/invite/route.ts` – line 7
- `app/admin/users/actions.ts` – line 15
- `.env.example` – add `NEXT_PUBLIC_AUTH_CALLBACK_URL`
- Supabase Auth config – must match (manual)

### Schema/Migration Impact

None.

### Code Changes (when implemented)

1. Add to `.env.example`: `NEXT_PUBLIC_AUTH_CALLBACK_URL=https://lr.signalthread.ai/auth/callback`
2. Replace `const INVITE_REDIRECT_TO = "https://lr.signalthread.ai/auth/callback"` with `const INVITE_REDIRECT_TO = process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? "https://lr.signalthread.ai/auth/callback"` in both files.
3. Document: Supabase Auth → URL Configuration → Redirect URLs must include this value.

### Runtime Risk

- Low. Fallback preserves current behavior if env not set.

### Acceptance Criteria

- [ ] Staging with `NEXT_PUBLIC_AUTH_CALLBACK_URL=https://staging.example.com/auth/callback` uses staging URL for invites.
- [ ] Production without env uses fallback.

---

## 9. Manual DB Verification / Production Checks

**Run before applying migrations.** Results inform which batches are required.

| Check | Command / Action | Purpose |
|-------|------------------|---------|
| users.role constraint | `\d public.users` in psql | Confirm CHECK name and allowed values |
| exhibitors table | `\dt public.exhibitors` | Exists? |
| event_users table | `\dt public.event_users` | Exists? |
| license_plans table | `\dt public.license_plans` | Exists? |
| events columns | `\d public.events` | company_id, is_active, location? |
| licenses columns | `\d public.licenses` | event_id, exhibitor_company_id? |
| RLS policies | `SELECT * FROM pg_policies WHERE tablename IN ('leads','campaigns','users');` | Current policy conditions |
| current_role() | `SELECT public.current_role();` as different users | Return values |
| Migration history | `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;` | Applied migrations |
| Users with new roles | `SELECT role, count(*) FROM public.users GROUP BY role;` | Any platform_admin, organizer_admin, exhibitor_admin? |
| Supabase Auth | Dashboard → Authentication → URL Configuration | Redirect URLs |

**Document results** before proceeding. If production already has schema from manual migrations, Batch 3 migrations should use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` to be idempotent.

---

## 10. Suggested SQL Backfills

**Run only if Manual DB Verification shows missing or inconsistent data.** Do not run blindly.

### Backfill users.company_id for exhibitor_admin with null

```sql
-- Identify first; do not run without verification
-- SELECT id, role, company_id FROM public.users WHERE role = 'exhibitor_admin' AND company_id IS NULL;

-- If event_users has exhibitor_company_id, use it:
-- UPDATE public.users u
-- SET company_id = eu.exhibitor_company_id
-- FROM public.event_users eu
-- WHERE u.id = eu.user_id
--   AND u.role = 'exhibitor_admin'
--   AND u.company_id IS NULL
--   AND eu.exhibitor_company_id IS NOT NULL;
```

### Reconcile licenses.seats_used (optional, post-launch)

```sql
-- Count users per license and compare to seats_used
-- SELECT l.id, l.seats_used,
--        (SELECT count(*) FROM public.users u WHERE u.license_id = l.id) as actual
-- FROM public.licenses l
-- WHERE l.seats_used != (SELECT count(*) FROM public.users u WHERE u.license_id = l.id);
```

---

## 11. Test Plan

| Batch | Test | Steps |
|-------|------|-------|
| 1 | Exhibitor leads | Log in as exhibitor_admin, open /exhibitor/leads, confirm rows load |
| 1 | Exhibitor campaigns | Open campaigns page, confirm list loads |
| 1 | Organizer leads | Log in as organizer_admin, open /app/organizer/leads, confirm rows load |
| 2 | Organizer invite | POST /api/organizer/invite with valid payload, confirm 201 and users row |
| 2 | Admin invite | Add user (exhibitor_admin, event_organizer) via admin UI, confirm success |
| 3 | Fresh DB | `supabase db reset`, start app, smoke test |
| 4 | Rollback | (If path exists) Simulate failure after seat increment, confirm rollback decrements |
| 5 | GET campaigns auth | curl GET /api/campaigns without cookie → 401 |
| 6 | Redirect | Set NEXT_PUBLIC_AUTH_CALLBACK_URL, send invite, confirm email link uses env URL |

---

## 12. Rollout Order

1. **Manual DB Verification** – Complete and document.
2. **Batch 1 (Role/RLS)** – Deploy migration. Verify exhibitor leads/campaigns.
3. **Batch 2 (Constraint)** – Deploy migration. Verify invite flows.
4. **Batch 3 (Schema)** – Deploy migrations. Verify fresh `db reset` and production idempotence.
5. **Batch 6 (Redirect)** – Deploy code + env. Update Supabase Auth redirect URLs.
6. **Batch 5 (Campaigns auth)** – Deploy code.
7. **Batch 4 (Invite hardening)** – Deploy code when implementing.

**Rollback**: Migrations 0012, 0013 can be reverted by deploying inverse migrations (restore old `current_role()`, restore old constraint). Batch 3 migrations use `IF NOT EXISTS`; dropping new tables/columns requires explicit migrations.
