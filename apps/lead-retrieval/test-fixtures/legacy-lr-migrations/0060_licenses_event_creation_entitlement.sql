-- Company-scoped license: optional entitlement to create events (organizer company / events.company_id).
-- Idempotent, additive. Existing rows: can_create_events = false; max_events NULL = unlimited when granted.

BEGIN;

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS can_create_events boolean DEFAULT false;

UPDATE public.licenses
SET can_create_events = false
WHERE can_create_events IS NULL;

ALTER TABLE public.licenses
  ALTER COLUMN can_create_events SET DEFAULT false,
  ALTER COLUMN can_create_events SET NOT NULL;

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS max_events integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.licenses'::regclass
      AND c.conname = 'licenses_max_events_non_negative'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_max_events_non_negative
      CHECK (max_events IS NULL OR max_events >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS licenses_company_event_creation_lookup_idx
  ON public.licenses (company_id)
  WHERE scope = 'company' AND can_create_events = true;

COMMIT;
