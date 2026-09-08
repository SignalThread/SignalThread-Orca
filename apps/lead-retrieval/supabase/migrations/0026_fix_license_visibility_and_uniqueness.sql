-- Migration 0026: Fix exhibitor license visibility, enforce one-license-per-exhibitor-per-event,
-- and reconcile seats_used from live event_users data.
--
-- Problems fixed:
--   1. licenses_select_scope RLS policy checks current_role() = 'exhibitor' but user role is
--      'exhibitor_admin'. Also compares licenses.company_id (organizer's company) instead of
--      exhibitor_company_id. Result: exhibitor admins see zero licenses through RLS.
--   2. Migration 0024 dropped the unique constraint on (event_id, exhibitor_company_id), allowing
--      duplicate license rows. Multiple code paths crash or misbehave with >1 row.
--   3. licenses.seats_used is stale because reconciliation crashes with multiple rows.

BEGIN;

------------------------------------------------------------------------
-- A. Fix the licenses_select_scope RLS policy
------------------------------------------------------------------------

DROP POLICY IF EXISTS "licenses_select_scope" ON public.licenses;

CREATE POLICY "licenses_select_scope"
ON public.licenses
FOR SELECT
USING (
  -- Organizer can see licenses for events they own
  company_id IN (
    SELECT id FROM public.companies WHERE organizer_id = auth.uid()
  )
  OR (
    -- Exhibitor can see licenses scoped to their exhibitor company
    public.current_role() IN ('exhibitor', 'exhibitor_admin')
    AND exhibitor_company_id = public.current_company_id()
  )
  OR (
    -- Platform admin can see all licenses
    public.current_role() = 'platform_admin'
  )
);

------------------------------------------------------------------------
-- B. Merge duplicate licenses per (event_id, exhibitor_company_id)
--    Keep the row with highest seats_total (tie-break: newest).
--    Sum seats_total from all duplicates into the survivor.
--    Reassign users.license_id references.
------------------------------------------------------------------------

DO $$
DECLARE
  _dup RECORD;
  _survivor_id uuid;
  _total_seats int;
BEGIN
  FOR _dup IN
    SELECT event_id, exhibitor_company_id, COUNT(*) AS cnt
    FROM public.licenses
    WHERE event_id IS NOT NULL
      AND exhibitor_company_id IS NOT NULL
    GROUP BY event_id, exhibitor_company_id
    HAVING COUNT(*) > 1
  LOOP
    -- Pick survivor: highest seats_total, newest created_at
    SELECT id INTO _survivor_id
    FROM public.licenses
    WHERE event_id = _dup.event_id
      AND exhibitor_company_id = _dup.exhibitor_company_id
    ORDER BY seats_total DESC, created_at DESC
    LIMIT 1;

    -- Sum all seats_total for this pair
    SELECT COALESCE(SUM(seats_total), 0) INTO _total_seats
    FROM public.licenses
    WHERE event_id = _dup.event_id
      AND exhibitor_company_id = _dup.exhibitor_company_id;

    -- Update survivor with combined seats
    UPDATE public.licenses
    SET seats_total = _total_seats
    WHERE id = _survivor_id;

    -- Reassign users.license_id from dead rows to survivor
    UPDATE public.users u
    SET license_id = _survivor_id
    FROM public.licenses l
    WHERE u.license_id = l.id
      AND l.event_id = _dup.event_id
      AND l.exhibitor_company_id = _dup.exhibitor_company_id
      AND l.id != _survivor_id;

    -- Delete the duplicate rows
    DELETE FROM public.licenses
    WHERE event_id = _dup.event_id
      AND exhibitor_company_id = _dup.exhibitor_company_id
      AND id != _survivor_id;

    RAISE NOTICE 'Merged % duplicates for event=% exhibitor=%, survivor=%',
      _dup.cnt, _dup.event_id, _dup.exhibitor_company_id, _survivor_id;
  END LOOP;
END $$;

------------------------------------------------------------------------
-- C. Re-add unique constraint on (event_id, exhibitor_company_id)
--    Partial index: only where both columns are NOT NULL.
------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS licenses_unique_event_exhibitor
  ON public.licenses (event_id, exhibitor_company_id)
  WHERE event_id IS NOT NULL AND exhibitor_company_id IS NOT NULL;

------------------------------------------------------------------------
-- D. Reconcile seats_used from live event_users data
------------------------------------------------------------------------

UPDATE public.licenses l
SET seats_used = COALESCE(sub.active_count, 0)
FROM (
  SELECT
    eu.event_id,
    eu.exhibitor_company_id,
    COUNT(*) AS active_count
  FROM public.event_users eu
  WHERE eu.status = 'active'
    AND (eu.permissions->>'app')::boolean = true
    AND eu.exhibitor_company_id IS NOT NULL
  GROUP BY eu.event_id, eu.exhibitor_company_id
) sub
WHERE l.event_id = sub.event_id
  AND l.exhibitor_company_id = sub.exhibitor_company_id;

-- Zero out licenses that have no active app users
UPDATE public.licenses l
SET seats_used = 0
WHERE l.seats_used != 0
  AND NOT EXISTS (
    SELECT 1 FROM public.event_users eu
    WHERE eu.event_id = l.event_id
      AND eu.exhibitor_company_id = l.exhibitor_company_id
      AND eu.status = 'active'
      AND (eu.permissions->>'app')::boolean = true
  );

COMMIT;
