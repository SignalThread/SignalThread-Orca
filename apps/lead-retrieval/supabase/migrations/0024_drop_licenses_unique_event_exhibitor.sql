-- Allow multiple licenses per event + exhibitor (e.g. different terms, seat blocks, plan tiers).
-- The previous unique constraint was too restrictive for the intended product model.
-- Instead, each license row is individually unique by its own license_key.

-- 1. Drop the old per-event-exhibitor uniqueness rule
DROP INDEX IF EXISTS licenses_unique_event_exhibitor;

-- 2. Add a human-readable license key column
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS license_key text;

-- 3. Backfill existing rows with generated keys (LIC-<first 8 chars of uuid>)
UPDATE public.licenses
  SET license_key = 'LIC-' || upper(left(id::text, 8))
  WHERE license_key IS NULL;

-- 4. Enforce NOT NULL and uniqueness on license_key
ALTER TABLE public.licenses
  ALTER COLUMN license_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS licenses_unique_key
  ON public.licenses (license_key);
