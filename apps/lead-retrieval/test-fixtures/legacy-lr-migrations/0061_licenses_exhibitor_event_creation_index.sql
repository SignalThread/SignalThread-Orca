-- Direct-buyer event creation: support fast lookup of company-scoped license by exhibitor company.
-- Columns can_create_events / max_events are defined in 0060; this migration is additive only.

BEGIN;

CREATE INDEX IF NOT EXISTS licenses_exhibitor_company_event_creation_lookup_idx
  ON public.licenses (exhibitor_company_id)
  WHERE scope = 'company';

COMMIT;
