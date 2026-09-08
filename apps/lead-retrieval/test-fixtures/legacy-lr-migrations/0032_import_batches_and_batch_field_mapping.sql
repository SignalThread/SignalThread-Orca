-- Canonical import batch for the wizard: one active draft per company (partial unique index).
-- Replaces company-scoped import_wizard_field_mapping_state with batch-scoped import_batch_field_mapping_state.

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null check (status in ('draft', 'published', 'discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  discarded_at timestamptz null,
  source_last_filename text null,
  data_revision int not null default 1
);

comment on table public.import_batches is
  'Import wizard batch job. At most one row with status=draft per company. Mapping, validation, briefing, and publish hang off batch id.';

create unique index if not exists import_batches_one_draft_per_company
  on public.import_batches (company_id)
  where status = 'draft';

create index if not exists import_batches_company_created
  on public.import_batches (company_id, created_at desc);

create trigger import_batches_set_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

alter table public.import_batches enable row level security;

drop policy if exists "import_batches_select_exhibitor" on public.import_batches;
create policy "import_batches_select_exhibitor"
on public.import_batches
for select
using (
  company_id in (select id from public.companies where organizer_id = auth.uid())
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

drop policy if exists "import_batches_insert_exhibitor" on public.import_batches;
create policy "import_batches_insert_exhibitor"
on public.import_batches
for insert
with check (
  public.current_role() = 'exhibitor'
  and company_id = public.current_company_id()
  and status = 'draft'
);

drop policy if exists "import_batches_update_exhibitor" on public.import_batches;
create policy "import_batches_update_exhibitor"
on public.import_batches
for update
using (
  public.current_role() = 'exhibitor'
  and company_id = public.current_company_id()
)
with check (
  public.current_role() = 'exhibitor'
  and company_id = public.current_company_id()
);

drop policy if exists "import_batches_delete_organizer" on public.import_batches;
create policy "import_batches_delete_organizer"
on public.import_batches
for delete
using (
  public.current_role() = 'organizer'
  and company_id in (select id from public.companies where organizer_id = auth.uid())
);

-- Field mapping + preview: one row per batch (draft workflow).
create table if not exists public.import_batch_field_mapping_state (
  batch_id uuid primary key references public.import_batches(id) on delete cascade,
  csv_headers text[] not null default '{}',
  preview_rows jsonb not null default '[]'::jsonb,
  selections jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.import_batch_field_mapping_state is
  'CSV headers, sample preview cells, and canonical field selections for one import batch.';

create trigger import_batch_field_mapping_state_set_updated_at
before update on public.import_batch_field_mapping_state
for each row execute function public.set_updated_at();

alter table public.import_batch_field_mapping_state enable row level security;

drop policy if exists "import_batch_field_mapping_state_select_exhibitor"
  on public.import_batch_field_mapping_state;
create policy "import_batch_field_mapping_state_select_exhibitor"
on public.import_batch_field_mapping_state
for select
using (
  batch_id in (
    select b.id from public.import_batches b
    where b.company_id in (select id from public.companies where organizer_id = auth.uid())
  )
  or (
    public.current_role() = 'exhibitor'
    and batch_id in (
      select id from public.import_batches where company_id = public.current_company_id()
    )
  )
);

drop policy if exists "import_batch_field_mapping_state_upsert_exhibitor"
  on public.import_batch_field_mapping_state;
create policy "import_batch_field_mapping_state_upsert_exhibitor"
on public.import_batch_field_mapping_state
for insert
with check (
  public.current_role() = 'exhibitor'
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

drop policy if exists "import_batch_field_mapping_state_update_exhibitor"
  on public.import_batch_field_mapping_state;
create policy "import_batch_field_mapping_state_update_exhibitor"
on public.import_batch_field_mapping_state
for update
using (
  public.current_role() = 'exhibitor'
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
)
with check (
  public.current_role() = 'exhibitor'
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

drop policy if exists "import_batch_field_mapping_state_delete_organizer"
  on public.import_batch_field_mapping_state;
create policy "import_batch_field_mapping_state_delete_organizer"
on public.import_batch_field_mapping_state
for delete
using (
  public.current_role() = 'organizer'
  and batch_id in (
    select b.id from public.import_batches b
    where b.company_id in (select id from public.companies where organizer_id = auth.uid())
  )
);

-- Migrate legacy company-scoped mapping into a new draft batch + batch-scoped row.
insert into public.import_batches (company_id, status)
select distinct m.company_id, 'draft'
from public.import_wizard_field_mapping_state m
where not exists (
  select 1 from public.import_batches b
  where b.company_id = m.company_id and b.status = 'draft'
);

insert into public.import_batch_field_mapping_state (batch_id, csv_headers, preview_rows, selections, updated_at)
select b.id, m.csv_headers, m.preview_rows, m.selections, m.updated_at
from public.import_wizard_field_mapping_state m
inner join public.import_batches b
  on b.company_id = m.company_id and b.status = 'draft'
where not exists (
  select 1 from public.import_batch_field_mapping_state f where f.batch_id = b.id
);

drop table if exists public.import_wizard_field_mapping_state;
