-- Full parsed CSV data rows for batch-scoped validation (aligned to csv_headers order).
alter table public.import_batch_field_mapping_state
  add column if not exists staged_rows jsonb not null default '[]'::jsonb;

comment on column public.import_batch_field_mapping_state.staged_rows is
  'All data rows from the uploaded CSV (excluding header), each row string[] aligned to csv_headers. Used for import validation.';
