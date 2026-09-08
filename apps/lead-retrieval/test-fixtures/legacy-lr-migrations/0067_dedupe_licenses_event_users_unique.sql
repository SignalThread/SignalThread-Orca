-- Deduplicate company-scoped license rows and event_users, then enforce uniqueness.
-- Fixes PostgREST PGRST116 ("Cannot coerce the result to a single JSON object") when
-- `.maybeSingle()` matched multiple rows.

BEGIN;

----------------------------------------------------------------------
-- A) Merge duplicate company-scoped licenses per exhibitor_company_id
--    (same pattern as migration 0026 for event-scoped duplicates).
----------------------------------------------------------------------
DO $$
DECLARE
  _dup RECORD;
  _survivor_id uuid;
  _sum_seats int;
BEGIN
  FOR _dup IN
    SELECT exhibitor_company_id, COUNT(*) AS cnt
    FROM public.licenses
    WHERE scope = 'company'
      AND exhibitor_company_id IS NOT NULL
    GROUP BY exhibitor_company_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO _survivor_id
    FROM public.licenses
    WHERE scope = 'company'
      AND exhibitor_company_id = _dup.exhibitor_company_id
    ORDER BY created_at DESC NULLS LAST, seats_total DESC NULLS LAST
    LIMIT 1;

    SELECT COALESCE(SUM(seats_total), 0)::int INTO _sum_seats
    FROM public.licenses
    WHERE scope = 'company'
      AND exhibitor_company_id = _dup.exhibitor_company_id;

    UPDATE public.licenses
    SET seats_total = _sum_seats
    WHERE id = _survivor_id;

    UPDATE public.users u
    SET license_id = _survivor_id
    FROM public.licenses l
    WHERE u.license_id = l.id
      AND l.scope = 'company'
      AND l.exhibitor_company_id = _dup.exhibitor_company_id
      AND l.id != _survivor_id;

    DELETE FROM public.licenses
    WHERE scope = 'company'
      AND exhibitor_company_id = _dup.exhibitor_company_id
      AND id != _survivor_id;

    RAISE NOTICE 'Merged % company-scoped license duplicates for exhibitor_company_id=%, survivor=%',
      _dup.cnt, _dup.exhibitor_company_id, _survivor_id;
  END LOOP;
END $$;

----------------------------------------------------------------------
-- B) At most one company-scoped license per exhibitor company (idempotent)
----------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS licenses_scope_company_exhibitor_company_id_uidx
  ON public.licenses (exhibitor_company_id)
  WHERE scope = 'company';

----------------------------------------------------------------------
-- C) Remove duplicate event_users (same user + event): keep best row
----------------------------------------------------------------------
DELETE FROM public.event_users eu
USING (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, event_id
        ORDER BY
          CASE status
            WHEN 'active' THEN 0
            WHEN 'invited' THEN 1
            ELSE 2
          END,
          (exhibitor_company_id IS NOT NULL) DESC,
          created_at DESC NULLS LAST
      ) AS rn
    FROM public.event_users
  ) ranked
  WHERE ranked.rn > 1
) doomed
WHERE eu.id = doomed.id;

CREATE UNIQUE INDEX IF NOT EXISTS event_users_user_id_event_id_uidx
  ON public.event_users (user_id, event_id);

COMMIT;
