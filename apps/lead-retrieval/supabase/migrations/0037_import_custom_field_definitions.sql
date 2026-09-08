-- Batch-scoped labels for dynamic custom column mappings (selections value `custom:<key>`).
-- No fixed column count; keys are data-driven per upload.

alter table public.import_batch_field_mapping_state
  add column if not exists custom_field_definitions jsonb not null default '{}'::jsonb;

comment on column public.import_batch_field_mapping_state.custom_field_definitions is
  'Map custom storage key -> { "label": string }. Paired with selections values like custom:cf_abc123.';
