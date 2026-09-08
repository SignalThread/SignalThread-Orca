-- Tie enrichment run audit rows to the import batch (no account-wide ambiguity).

alter table public.import_wizard_enrichment_runs
  add column if not exists batch_id uuid references public.import_batches(id) on delete set null;

create index if not exists idx_import_wizard_enrichment_runs_batch_created
  on public.import_wizard_enrichment_runs (batch_id, created_at desc);

comment on column public.import_wizard_enrichment_runs.batch_id is
  'Import batch this run belongs to; null for legacy rows before batch scoping.';

-- Align with import_batches (0036): exhibitor_admin was blocked on insert/select.
drop policy if exists "import_wizard_enrichment_runs_select_exhibitor"
  on public.import_wizard_enrichment_runs;
create policy "import_wizard_enrichment_runs_select_exhibitor"
on public.import_wizard_enrichment_runs
for select
using (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and company_id = public.current_company_id()
);

drop policy if exists "import_wizard_enrichment_runs_insert_exhibitor"
  on public.import_wizard_enrichment_runs;
create policy "import_wizard_enrichment_runs_insert_exhibitor"
on public.import_wizard_enrichment_runs
for insert
with check (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and company_id = public.current_company_id()
  and created_by = auth.uid()
);
