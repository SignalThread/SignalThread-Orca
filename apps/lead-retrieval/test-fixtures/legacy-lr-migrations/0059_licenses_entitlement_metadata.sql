-- Licenses: entitlement metadata (scope, billing, billing_source).
-- Idempotent and additive: does not modify or remove existing constraints.
-- Existing rows backfill via defaults: event / one_time / internal.

BEGIN;

----------------------------------------------------------------------
-- scope: 'event' | 'company'
----------------------------------------------------------------------
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'event';

UPDATE public.licenses
SET scope = 'event'
WHERE scope IS NULL;

ALTER TABLE public.licenses
  ALTER COLUMN scope SET DEFAULT 'event',
  ALTER COLUMN scope SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.licenses'::regclass
      AND c.conname = 'licenses_scope_check'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_scope_check
      CHECK (scope IN ('event', 'company'));
  END IF;
END $$;

----------------------------------------------------------------------
-- billing: 'one_time' | 'monthly'
----------------------------------------------------------------------
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS billing text DEFAULT 'one_time';

UPDATE public.licenses
SET billing = 'one_time'
WHERE billing IS NULL;

ALTER TABLE public.licenses
  ALTER COLUMN billing SET DEFAULT 'one_time',
  ALTER COLUMN billing SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.licenses'::regclass
      AND c.conname = 'licenses_billing_check'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_billing_check
      CHECK (billing IN ('one_time', 'monthly'));
  END IF;
END $$;

----------------------------------------------------------------------
-- billing_source: 'internal' | 'stripe' | 'app_store' | 'google_play'
----------------------------------------------------------------------
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS billing_source text DEFAULT 'internal';

UPDATE public.licenses
SET billing_source = 'internal'
WHERE billing_source IS NULL;

ALTER TABLE public.licenses
  ALTER COLUMN billing_source SET DEFAULT 'internal',
  ALTER COLUMN billing_source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.licenses'::regclass
      AND c.conname = 'licenses_billing_source_check'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_billing_source_check
      CHECK (billing_source IN ('internal', 'stripe', 'app_store', 'google_play'));
  END IF;
END $$;

----------------------------------------------------------------------
-- At most one company-scoped license row per exhibitor company.
-- (Multiple NULL exhibitor_company_id rows are allowed under this partial index.)
----------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS licenses_scope_company_exhibitor_company_id_uidx
  ON public.licenses (exhibitor_company_id)
  WHERE scope = 'company';

COMMIT;
