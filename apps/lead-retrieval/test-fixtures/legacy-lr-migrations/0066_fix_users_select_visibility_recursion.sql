-- 0066_fix_users_select_visibility_recursion.sql
--
-- Remote: 0065 was marked applied but may still have left public.users
-- `users_select_visibility_v2` with a self-referential subquery, causing
-- infinite recursion. Replaces the policy with the non-recursive two-branch
-- form (self + same company). SELECT only, idempotent.

BEGIN;

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

COMMIT;
