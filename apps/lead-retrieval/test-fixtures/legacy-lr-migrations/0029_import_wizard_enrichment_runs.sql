-- Persist import wizard batch enrichment summaries (exhibitor batch override; not workspace default)

create table if not exists public.import_wizard_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete set null,
  provider text not null,
  lead_count int not null default 0,
  summary jsonb not null default '{}'::jsonb,
  sample_rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_wizard_enrichment_runs_company_created
  on public.import_wizard_enrichment_runs (company_id, created_at desc);

alter table public.import_wizard_enrichment_runs enable row level security;

drop policy if exists "import_wizard_enrichment_runs_select_exhibitor" on public.import_wizard_enrichment_runs;
create policy "import_wizard_enrichment_runs_select_exhibitor"
on public.import_wizard_enrichment_runs
for select
using (
  public.current_role() = 'exhibitor'
  and company_id = public.current_company_id()
);

drop policy if exists "import_wizard_enrichment_runs_insert_exhibitor" on public.import_wizard_enrichment_runs;
create policy "import_wizard_enrichment_runs_insert_exhibitor"
on public.import_wizard_enrichment_runs
for insert
with check (
  public.current_role() = 'exhibitor'
  and company_id = public.current_company_id()
  and created_by = auth.uid()
);
