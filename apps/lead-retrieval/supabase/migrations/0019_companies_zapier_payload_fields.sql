alter table public.companies
  add column if not exists zapier_trigger_events text[],
  add column if not exists zapier_payload_fields text[];
