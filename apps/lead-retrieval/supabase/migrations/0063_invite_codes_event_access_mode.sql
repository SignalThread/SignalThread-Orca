-- invite_codes: capture the admin's intended event-access scope at invite time.
--
-- Values:
--   'assigned_events_only' : the invite represents access to exactly its `event_id` (default).
--   'all_company_events'   : the invite represents access to every event where
--                            events.company_id = invite_codes.exhibitor_company_id.
--
-- The column is authoritative for mapping the admin-chosen scope back to
-- public.users.event_access_mode on redeem. It does NOT bypass seat enforcement
-- or the company-scoped license gate — see lib/server/event-user-access.ts
-- and lib/server/company-event-access.ts for runtime rules.
--
-- Default 'assigned_events_only' preserves the historical per-event meaning
-- for any existing un-redeemed invite rows.

BEGIN;

ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS event_access_mode text DEFAULT 'assigned_events_only';

UPDATE public.invite_codes
SET event_access_mode = 'assigned_events_only'
WHERE event_access_mode IS NULL;

ALTER TABLE public.invite_codes
  ALTER COLUMN event_access_mode SET DEFAULT 'assigned_events_only',
  ALTER COLUMN event_access_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.invite_codes'::regclass
      AND c.conname = 'invite_codes_event_access_mode_check'
  ) THEN
    ALTER TABLE public.invite_codes
      ADD CONSTRAINT invite_codes_event_access_mode_check
      CHECK (event_access_mode IN ('all_company_events', 'assigned_events_only'));
  END IF;
END $$;

COMMIT;
