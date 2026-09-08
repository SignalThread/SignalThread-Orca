-- Users: per-user event access mode for company-scoped direct-buyer behavior.
--
-- Values:
--   'all_company_events'   : user may access every event where events.company_id = users.company_id,
--                            but ONLY when the user's exhibitor company has an eligible
--                            company-scoped license. Without such a license, the resolver falls
--                            back to legacy event-scoped behavior (event_users membership).
--
--   'assigned_events_only' : user may access only events explicitly linked to them via
--                            event_users rows where exhibitor_company_id = users.company_id.
--
-- Boundaries (runtime rules live in lib/server/company-event-access.ts):
--   * event_access_mode does NOT control event creation (that is governed by license + creation
--     entitlement logic).
--   * event_access_mode does NOT replace `role`; role remains the capability class.
--   * event_access_mode does NOT grant access by itself — the company-scoped license is the
--     product gate. Without the license gate, the user falls back to legacy behavior.
--   * event_access_mode does NOT interact with seats.
--
-- Safe default: 'all_company_events' preserves current behavior for exhibitor admins whose company
-- already has an eligible company-scoped license (today they already see all company events). Users
-- whose company is not licensed continue to get legacy event-scoped behavior regardless of mode,
-- so the default does not silently widen anything.
--
-- Idempotent & additive. No RLS change.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS event_access_mode text DEFAULT 'all_company_events';

UPDATE public.users
SET event_access_mode = 'all_company_events'
WHERE event_access_mode IS NULL;

ALTER TABLE public.users
  ALTER COLUMN event_access_mode SET DEFAULT 'all_company_events',
  ALTER COLUMN event_access_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.users'::regclass
      AND c.conname = 'users_event_access_mode_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_event_access_mode_check
      CHECK (event_access_mode IN ('all_company_events', 'assigned_events_only'));
  END IF;
END $$;

COMMIT;
