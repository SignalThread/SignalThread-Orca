-- Per-company default for lead profile enrichment (integrations UI + enrichLead).
alter table public.companies
  add column if not exists default_enrichment_provider text;

comment on column public.companies.default_enrichment_provider is
  'Canonical enrichment provider id (e.g. people_data_labs). Nullable when unset.';
