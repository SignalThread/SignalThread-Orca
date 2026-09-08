-- Per-row normalized enrichment from import wizard runs, for publish handoff.
-- Written by runImportWizardBatchEnrichment (service role); read by materializeImportedLeadsFromBatch.

alter table public.import_batch_rows
  add column if not exists wizard_enrichment_normalized jsonb null;

comment on column public.import_batch_rows.wizard_enrichment_normalized is
  'Provider-normalized enrichment (enriched_* shape) from import wizard; merged onto public.leads at materializeImportedLeadsFromBatch. Cleared when row is replaced by a new field-mapping save.';
