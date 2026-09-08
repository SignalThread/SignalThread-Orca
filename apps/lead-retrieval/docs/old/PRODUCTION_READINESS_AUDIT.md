# Production Readiness Audit

> Analysis-only audit of the Lead Retrieval platform. No application code was modified.

---

## 1. Executive Summary

### Current Production Readiness Level

**Not production-ready** without addressing critical schema, RLS, and invite-flow issues.

### Top Risks

1. **RLS / role mismatch**: Policies expect `organizer`/`exhibitor`; app uses `organizer_admin`/`exhibitor_admin`/`platform_admin` – exhibitor access may be fully blocked.
2. **users.role CHECK constraint**: Migration allows only `organizer`/`exhibitor`; app inserts `platform_admin`, `organizer_admin`, `exhibitor_admin` – inserts may fail.
3. **Incomplete invite rollback**: Organizer invite rollback does not decrement seat. No current code path triggers rollback after seat increment, but rollback logic is incomplete if future steps are added.
4. **Missing migrations**: `exhibitors`, `event_users` creation not in repo; schema may be out of sync.
5. **Hardcoded redirect URL**: `https://lr.signalthread.ai/auth/callback` – breaks in other environments.

### Overall Assessment

The application has solid auth flows, role-based routing, and invite/membership logic. Critical gaps are in schema/RLS alignment, constraint vs. app behavior, and rollback consistency. Verification of the live database state (constraints, RLS policies, role values) is required before launch.

---

## 2. Critical Issues

### Auth Bugs

| Issue | Location | Impact |
|-------|----------|--------|
| **RLS role mismatch** | `supabase/migrations/0001_phase1.sql`, `0002_exhibitor_pages.sql` | Policies check `current_role() = 'organizer'` or `'exhibitor'`. App stores `organizer_admin`, `exhibitor_admin`. Exhibitors may be unable to read leads, campaigns via RLS. |
| **users.role CHECK** | `0001_phase1.sql` line 15 | `check (role in ('organizer', 'exhibitor'))`. App inserts `platform_admin`, `organizer_admin`, `exhibitor_admin`. Inserts would fail unless constraint was dropped. **Needs verification**. |

### Access Bugs

| Issue | Location | Impact |
|-------|----------|--------|
| **GET /api/campaigns no auth** | `app/api/campaigns/route.ts` | GET handler has no `getCurrentSessionUser()`. Relies on RLS. Unauthenticated call returns empty; authenticated exhibitor with role mismatch may get empty. |
| **Platform admin RLS** | events, etc. | Events policies use `current_role() = 'platform_admin'`. If `platform_admin` is not in policies, platform admin would need admin client. Admin routes use admin client – OK. |

### Schema / Data Integrity Risks

| Issue | Location | Impact |
|-------|----------|--------|
| **exhibitors / event_users** | Migrations | No `CREATE TABLE` for `exhibitors` or `event_users` in repo. `0010` adds index on exhibitors. Tables exist in types. Schema may have been applied outside repo. |
| **events.company_id** | `0009_admin_events.sql` | Migration does not add `company_id`; `types/database.ts` shows it. **Needs verification**. |
| **license_plans** | Migrations | In types; no migration found. **Needs verification**. |

### Migration Risks

| Issue | Impact |
|-------|--------|
| **Role constraint** | If still present, all invite/user creation with new roles fails. |
| **Migration order** | `0002_users_email_license.sql` and `0002_exhibitor_pages.sql` both alter users; order may matter. |

### Unsafe Assumptions

1. **RLS policies updated**: Assumption that production has policies for `organizer_admin`/`exhibitor_admin`/`platform_admin` – not in repo.
2. **Constraint dropped**: Assumption that `users.role` CHECK was altered to allow new roles.
3. **Redirect URL**: Assumption that deployment URL matches `https://lr.signalthread.ai`.

---

## 3. High-Risk Areas

### Code Paths Likely to Fail with Real Customers

| Path | Risk |
|------|------|
| **Exhibitor invite** | If CHECK blocks `exhibitor_admin`, insert fails. |
| **Exhibitor leads** | If RLS expects `exhibitor` and DB has `exhibitor_admin`, no rows returned. |
| **Organizer invite** | Same CHECK risk; plus rollback does not decrement seat. |
| **Campaigns for exhibitor** | RLS uses `organizer`/`exhibitor`; mismatch blocks access. |

### Invite / Redeem Edge Cases

| Case | Behavior |
|------|-----------|
| **Reinvite same email** | `inviteUserByEmail` may return existing user; `event_users` insert may fail on duplicate. No handling. |
| **Seat race** | Optimistic lock with 3 retries; concurrent invites can still oversell. |
| **Rollback after seat increment** | Organizer invite rollback does not decrement seat. |
| **Activate-memberships failure** | Logged but non-fatal; user can still use app. `event_users` stays `invited`; organizer scope includes it. |

### Membership Drift

- No reconciliation between `licenses.seats_used` and actual user count.
- `syncLicenseSeatUsage` in `lib/data/license-management.ts` exists but is used for a different flow (ensureCompanyLicense).
- Deleting a user decrements seat in admin actions; organizer delete path differs.

### Visibility Drift

- Scope recomputed per request; no caching. Drift is minimal.
- Stale `users.company_id` would require manual DB update or re-invite.

### Session Refresh Issues

- Supabase SSR handles refresh. No custom logic.
- Middleware runs on most routes; session refreshed on navigation.

### Race Conditions

| Scenario | Mitigation |
|----------|------------|
| **Seat increment** | Optimistic lock, 3 retries. Possible oversell under high concurrency. |
| **Duplicate event_users** | No unique constraint in migrations. **Needs verification**. |

### Partial Writes / Inconsistent State

| Scenario | Risk |
|----------|------|
| **User created, event_users insert fails** | Rollback deletes user and auth user. OK. |
| **event_users created, seat increment fails** | Rollback deletes event_users and user. Seat was not incremented, so no decrement needed. OK. |
| **Auth user created, users upsert fails** | Rollback deletes auth user. OK. |

---

## 4. Auth / RBAC Risks

### Privilege Escalation Possibilities

| Vector | Assessment |
|--------|------------|
| **activate-memberships** | Any authenticated user can POST. Only activates own `event_users`. Low risk. |
| **Campaign company_id** | Scoped by `sessionUser.company_id`. If client could override, risk – but company_id comes from DB, not client. |
| **Organizer scope** | Derived from `event_users` by user_id. No client-supplied scope. |
| **Admin client usage** | Only server-side; requires platform_admin or organizer_admin. |

### Incorrect Access Denial

| Scenario | Cause |
|----------|-------|
| **Exhibitor sees no leads** | RLS mismatch (`exhibitor_admin` vs `exhibitor`), or `users.company_id` null. |
| **Organizer sees no events** | No `event_users` rows, or status not in (`active`,`invited`). |
| **Valid user redirected to /login?error=role** | `users.role` not in normalized set, or `users` row missing. |

### Stale Role/Scope State

- Role and scope read per request. No server-side caching.
- Client-side: Next.js may cache; `router.refresh()` used after login.

### Weak Route Guards

| Route | Guard |
|-------|-------|
| **GET /api/campaigns** | No explicit auth; RLS only. |
| **API routes** | Middleware allows unauthenticated through; each route must check. Most do. |

### Weak Service Guards

- `getOrganizerScope` uses admin client; no RLS. Scope derived from DB.
- Campaign/recipient handlers validate `company_id` match before mutations.

---

## 5. Data Integrity Risks

### Nullable-but-Operationally-Required Fields

| Field | Required For | Risk |
|-------|--------------|------|
| **users.company_id** | Exhibitor leads, campaigns, dashboard | Null → "not assigned to a company" |
| **event_users.exhibitor_company_id** | Exhibitor semantics | Organizer scope uses it for companyIds; exhibitor leads use users.company_id |
| **leads.event_id** | Organizer event filter | Null leads excluded from organizer event view |

### Missing Constraints

| Constraint | Risk |
|------------|------|
| **event_users (event_id, user_id) unique** | Duplicate memberships. Not in migrations. **Needs verification**. |
| **users.role** | CHECK may be too restrictive. |

### Missing Backfills

- No backfill for `users` from `auth.users`.
- No backfill for `event_users` for existing users.

### Duplicate Membership Risks

- Invite inserts `event_users`; no upsert. Re-invite may fail or create duplicate if no unique constraint.

### Invite/User Mismatch Risks

- Invite creates auth user first; if app fails before users upsert, auth user exists without `public.users`. User cannot use app (role null → redirect to login?error=role).

### Inconsistent Company/Event Scope Risks

- `exhibitors` links event to company. `licenses` has `event_id`, `exhibitor_company_id`. If exhibitor removed from event but licenses remain, invite may still find license. Logic validates exhibitor in event before invite.

---

## 6. Leads Visibility Failure Scenarios

### User Incorrectly Sees Zero Leads

| Role | Root Cause | Location |
|------|------------|----------|
| **Exhibitor** | `users.company_id` null | `app/(app)/exhibitor/leads/page.tsx` |
| **Exhibitor** | RLS blocks (role `exhibitor_admin` vs policy `exhibitor`) | `0001_phase1.sql` leads_select_scope |
| **Exhibitor** | No leads with `company_id = users.company_id` | Data |
| **Exhibitor** | `eventId` filter excludes all (if used) | LeadsTable |
| **Organizer** | No `event_users` rows | `lib/data/organizer-scope.ts` |
| **Organizer** | `event_users.status` not in (`active`,`invited`) | Same |
| **Organizer** | No leads with `event_id` in scope | `app/app/organizer/leads/page.tsx` |
| **Organizer** | `leads.event_id` null for all leads in event | Data |

### User Could See Leads They Should Not See

| Scenario | Root Cause | Mitigation |
|----------|------------|------------|
| **Exhibitor sees other company's leads** | RLS bypass or bug | RLS + app filter by company_id. Admin client not used for exhibitor leads. |
| **Organizer sees leads outside scope** | Bug in getOrganizerScope or event filter | Scope from event_users; filter by event_id. Uses admin client – no RLS. App logic must be correct. |
| **Platform admin** | Full access by design | Intended. |

### Required Fixes

1. Align RLS policies with actual role values (`organizer_admin`, `exhibitor_admin`, `platform_admin`) or align app with policies (`organizer`, `exhibitor`).
2. Ensure `users.company_id` is set for all exhibitor_admin.
3. Ensure `event_users` exists for organizers with correct `event_id`.
4. Verify `users.role` CHECK allows inserted values.

---

## 7. Schema / Migration Concerns

### Mismatches Between Code Assumptions and Migrations

| Assumption | Migration Reality |
|------------|-------------------|
| **users.role** = platform_admin, organizer_admin, exhibitor_admin | CHECK allows only organizer, exhibitor |
| **events.company_id** | 0009 does not add it |
| **exhibitors, event_users** | No CREATE in repo |
| **RLS current_role()** | Returns value from users.role; policies expect organizer/exhibitor |

### Missing Tables/Columns in Migrations

- **exhibitors**: Referenced in 0010 (index); no create.
- **event_users**: Used in code; no create.
- **license_plans**: In types; no create.
- **events.company_id**: In types; not in 0009.

### Dangerous Nullability

- **users.company_id**: Nullable; required for exhibitor.
- **event_users.exhibitor_company_id**: Nullable; required for exhibitor semantics in scope.
- **leads.event_id**: Nullable; organizer filters by it.

### Risky or Missing Indexes

- `exhibitors (event_id, company_id)` unique in 0010.
- `event_users` – no indexes in migrations. **Needs verification**.

### Migration Ordering / Compatibility

- `0002_users_email_license.sql` and `0002_exhibitor_pages.sql` both alter users. Order may affect outcome.
- `0005_campaign_messaging.sql` creates campaigns with different columns than 0002; uses `create table if not exists` and `alter table add column if not exists`.

---

## 8. Security / Enforcement Risks

### Endpoints Missing Auth Checks

| Endpoint | Method | Auth |
|----------|--------|------|
| **/api/campaigns** | GET | None; RLS only |
| **/api/auth/server-callback** | GET | None (callback) |
| **/api/auth/activate-memberships** | POST | getUser only; acts on self |

### Role Bypass Opportunities

- Middleware redirects by path; API routes enforce role. No direct bypass found.
- Admin client used only server-side with role checks.

### Trust of Client-Supplied IDs

| ID | Validation |
|----|------------|
| **eventId** (invite) | In getOrganizerScope events |
| **exhibitorCompanyId** (invite) | In exhibitors for event |
| **campaignId** | Scoped by company_id |
| **leadId** | Scoped by company_id for campaign recipients |

### DB Enforcement vs App Logic

| Area | DB | App |
|------|-----|-----|
| **Leads (exhibitor)** | RLS | company_id filter |
| **Leads (organizer)** | Bypassed (admin client) | event_id from scope |
| **Campaigns** | RLS | company_id match |
| **Invite** | None | Full validation |

---

## 9. Production Hardening Recommendations

### Must Fix Before Production

1. **RLS / role alignment**: Update RLS policies to use `organizer_admin`, `exhibitor_admin`, `platform_admin` (or normalize in `current_role()`), OR change app to use `organizer`/`exhibitor` and add `platform_admin` handling.
2. **users.role CHECK**: Alter constraint to allow `platform_admin`, `organizer_admin`, `exhibitor_admin`, `event_organizer`, `organizer`, `exhibitor` (or drop if flexible).
3. **Invite rollback completeness**: In `app/api/organizer/invite/route.ts`, add seat decrement to rollback for consistency with admin actions. Currently no path triggers rollback after seat increment.
4. **Redirect URL**: Move `INVITE_REDIRECT_TO` to env (e.g. `NEXT_PUBLIC_AUTH_CALLBACK_URL`) and use in invite flows.
5. **Schema verification**: Run migrations against fresh DB; confirm exhibitors, event_users, events.company_id, license_plans exist and match types.

### Should Fix Soon After Launch

1. **GET /api/campaigns**: Add `getCurrentSessionUser()` and return 401 if unauthenticated.
2. **Seat reconciliation**: Add job or admin tool to reconcile `licenses.seats_used` with actual user count.
3. **event_users unique constraint**: Add `UNIQUE (event_id, user_id)` if not present.
4. **Reinvite handling**: Handle existing user + existing event_users (e.g. upsert or clear error message).

### Nice to Have

1. **permissions enforcement**: Use `event_users.permissions` for fine-grained access.
2. **Audit logging**: Log invite, activate, delete actions.
3. **Rate limiting**: On invite, activate-memberships, auth endpoints.

---

## 10. Human Verification Required

The following cannot be confirmed from code alone:

1. **Live DB constraints**: Run `\d public.users` (or equivalent) to confirm `users.role` CHECK. Run `\d public.event_users`, `\d public.exhibitors` to see actual schema.
2. **RLS policies**: List policies on `leads`, `campaigns`, `users`, `event_users`, `exhibitors` and confirm conditions match role values in use.
3. **current_role() behavior**: Log or query `SELECT public.current_role()` as different users to confirm return values.
4. **Supabase Auth config**: Confirm redirect URL in Supabase dashboard matches deployment.
5. **Migration history**: Confirm which migrations have been applied and in what order.
6. **Existing data**: Check for users with `role` not in (`organizer`,`exhibitor`) – indicates constraint was altered.

---

## Appendix: File Reference

| Area | Files |
|------|-------|
| Auth | `lib/supabase/server.ts`, `client.ts`, `middleware.ts`, `admin.ts`, `lib/auth/session.ts` |
| Callback | `app/auth/callback/page.tsx`, `app/auth/server-callback/route.ts` |
| Invite | `app/api/organizer/invite/route.ts`, `app/admin/users/actions.ts` |
| Scope | `lib/data/organizer-scope.ts`, `lib/data/exhibitor-context.ts` |
| Leads | `app/(app)/exhibitor/leads/page.tsx`, `app/app/organizer/leads/page.tsx` |
| Migrations | `supabase/migrations/*.sql` |
| Types | `types/database.ts`, `types/app.ts` |
