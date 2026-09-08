-- 0064_users_role_exhibitor_viewer_and_read_rls.sql
--
-- PR 1 of the `exhibitor_viewer` introduction. Strictly DB + read-only RLS foundation.
--
-- Goal:
--   * Allow `exhibitor_viewer` as a real value of `public.users.role`.
--   * Add `exhibitor_viewer` to SELECT policies where `exhibitor_admin` already has
--     exhibitor-scoped read access AND the policy is needed for V1
--     dashboard/leads view (lead_briefings, events for own company).
--   * Do NOT touch INSERT/UPDATE/DELETE policies anywhere.
--   * Do NOT modify invite redeem/claim code (a separate PR).
--   * No backfill of existing rows.
--
-- Source of truth for the role allow-list is the deployed production
-- `users_role_check` (`platform_admin`, `event_organizer`, `exhibitor_admin`)
-- plus the new `exhibitor_viewer`. Repo-history values such as `'organizer'` and
-- `'exhibitor'` from `0001_phase1.sql` are intentionally NOT in this list.
--
-- Idempotent: drop-then-create for the constraint and each policy.
-- Transactional: a single BEGIN/COMMIT so a partial failure leaves nothing
-- half-applied.
--
-- Notes for future PRs (intentionally NOT done here):
--   * Widening read RLS for `companies`, `public.users`, `public.leads`,
--     `public.lead_enrichments` is deferred — those policies still reference
--     only the legacy `'exhibitor'` literal and even `exhibitor_admin` does
--     not satisfy them under `current_role()` normalization (0052). The
--     dashboard/leads code paths reach those tables via the service-role
--     admin client today, so this PR does not unblock or break them. A
--     follow-up alignment migration should widen them deliberately.
--   * Import wizard, signals, briefings-knowledge, email_templates, licenses
--     remain `exhibitor_admin`-only. `exhibitor_viewer` must NOT receive read RLS
--     there (V1 product model: view-only dashboard + leads only).

BEGIN;

-- 1. users_role_check: include `exhibitor_viewer` alongside the production-current values.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('platform_admin', 'event_organizer', 'exhibitor_admin', 'exhibitor_viewer'));

-- 2. lead_briefings: SELECT widening (last redefined in 0052).
--    INSERT/UPDATE policies are intentionally NOT redefined here; they remain
--    the 0052 versions which exclude `exhibitor_viewer`.
DROP POLICY IF EXISTS "lead_briefings_select_scope" ON public.lead_briefings;
CREATE POLICY "lead_briefings_select_scope"
ON public.lead_briefings
FOR SELECT
USING (
  company_id IN (
    SELECT id FROM public.companies WHERE organizer_id = auth.uid()
  )
  OR (
    public.current_role() IN ('exhibitor', 'exhibitor_admin', 'exhibitor_viewer')
    AND company_id = public.current_company_id()
  )
);

-- 3. events: company-scoped SELECT widening (defined in 0045).
--    The `events_update_exhibitor_company` UPDATE policy from 0045 is
--    intentionally NOT touched, so `exhibitor_viewer` cannot mutate event rows.
DROP POLICY IF EXISTS "events_select_exhibitor_company" ON public.events;
CREATE POLICY "events_select_exhibitor_company"
ON public.events
FOR SELECT
USING (
  public.current_role() IN ('exhibitor', 'exhibitor_admin', 'exhibitor_viewer')
  AND company_id IS NOT NULL
  AND company_id = public.current_company_id()
);

COMMIT;
