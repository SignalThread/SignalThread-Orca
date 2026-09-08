-- Durable linkage between staged briefing rows and published leads.
-- This allows post-publish briefing sync to avoid fragile email re-matching.

alter table public.import_batch_row_briefings
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

create index if not exists idx_import_batch_row_briefings_lead_id
  on public.import_batch_row_briefings (lead_id);

comment on column public.import_batch_row_briefings.lead_id is
  'Durable published lead linkage for this batch row (set during publish/materialization or deterministic sync).';
