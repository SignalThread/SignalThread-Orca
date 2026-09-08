-- 0065_exhibitor_viewer_mobile_bootstrap_rls.sql
--
-- Mobile (JWT) cannot use the service-role server client; it relies on RLS.
-- 0064 widened lead_briefings + events. Policies on companies, users, leads,
-- lead_enrichments, and licenses still matched only the legacy 'exhibitor' literal
-- (or excluded exhibitor_viewer), so exhibitor_viewer could not read tenant rows
-- needed to bootstrap the active event and leads list.
--
-- This migration:
--   * Replaces SELECT policies only (read-only for viewer).
--   * Does NOT add exhibitor_viewer to INSERT/UPDATE/DELETE.
--   * Enables RLS on public.event_users if the table exists, and adds a SELECT policy
--     so the user can read their own membership rows and company-scoped rows.
--
-- Idempotent: DROP IF EXISTS + CREATE. Transactional.

BEGIN;

-- ---------------------------------------------------------------------------
-- companies: tenant can read their exhibitor company row
-- (0001 only allowed current_role() = 'exhibitor')
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "companies_select_scope" ON public.companies;
CREATE POLICY "companies_select_scope"
ON public.companies
FOR SELECT
USING (
  organizer_id = auth.uid()
  OR (
    public.current_role() IN ('exhibitor', 'exhibitor_admin', 'exhibitor_viewer')
    AND id = public.current_company_id()
  )
);

-- ---------------------------------------------------------------------------
-- users: self + same-company listing (no license cohort — avoids RLS recursion on
-- public.users).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_visibility_v2" ON public.users;
CREATE POLICY "users_select_visibility_v2"
ON public.users
FOR SELECT
USING (
  id = auth.uid()
  OR (
    public.current_role() IN ('organizer', 'exhibitor', 'exhibitor_admin', 'exhibitor_viewer')
    AND company_id IS NOT NULL
    AND company_id = public.current_company_id()
  )
);

-- ---------------------------------------------------------------------------
-- leads: company-scoped tenant reads (0001 only 'exhibitor')
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "leads_select_scope" ON public.leads;
CREATE POLICY "leads_select_scope"
ON public.leads
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

-- ---------------------------------------------------------------------------
-- lead_enrichments: follow leads_select (0003 only 'exhibitor'); SELECT only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "lead_enrichments_select_scope" ON public.lead_enrichments;
CREATE POLICY "lead_enrichments_select_scope"
ON public.lead_enrichments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = lead_id
      AND (
        l.company_id IN (SELECT id FROM public.companies WHERE organizer_id = auth.uid())
        OR (
          public.current_role() IN ('exhibitor', 'exhibitor_admin', 'exhibitor_viewer')
          AND l.company_id = public.current_company_id()
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- licenses: exhibitor-scoped (0026) — add exhibitor_viewer for read-only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "licenses_select_scope" ON public.licenses;
CREATE POLICY "licenses_select_scope"
ON public.licenses
FOR SELECT
USING (
  company_id IN (
    SELECT id FROM public.companies WHERE organizer_id = auth.uid()
  )
  OR (
    public.current_role() IN ('exhibitor', 'exhibitor_admin', 'exhibitor_viewer')
    AND exhibitor_company_id = public.current_company_id()
  )
  OR public.current_role() = 'platform_admin'
);

-- ---------------------------------------------------------------------------
-- event_users: read own rows + same exhibitor company (SELECT only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_users_select_exhibitor_scope" ON public.event_users;
CREATE POLICY "event_users_select_exhibitor_scope"
ON public.event_users
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    public.current_role() IN ('exhibitor', 'exhibitor_admin', 'exhibitor_viewer')
    AND exhibitor_company_id IS NOT NULL
    AND exhibitor_company_id = public.current_company_id()
  )
);

COMMIT;
