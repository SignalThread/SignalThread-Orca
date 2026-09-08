-- Per–batch-row AI briefing review state for import wizard (draft batch).
-- Canonical for Step 3 queue/detail/approval; not company catalog leads.

create table if not exists public.import_batch_row_briefings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  batch_row_id uuid not null references public.import_batch_rows(id) on delete cascade,
  approval_status text not null default 'pending'
    constraint import_batch_row_briefings_status_chk check (
      approval_status in ('pending', 'approved', 'needs_review', 'failed')
    ),
  content jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batch_row_briefings_row_unique unique (batch_row_id)
);

create index if not exists idx_import_batch_row_briefings_batch_id
  on public.import_batch_row_briefings (batch_id);

comment on table public.import_batch_row_briefings is
  'Import wizard: review/approval per staged CSV row. batch_row_id is the stable key for queue and publish gating.';

create trigger import_batch_row_briefings_set_updated_at
before update on public.import_batch_row_briefings
for each row execute function public.set_updated_at();

alter table public.import_batch_row_briefings enable row level security;

drop policy if exists "import_batch_row_briefings_select_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_select_exhibitor"
on public.import_batch_row_briefings
for select
using (
  batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
  )
  or (
    public.current_role() = 'organizer'
    and batch_id in (
      select b.id from public.import_batches b
      where b.company_id in (select id from public.companies where organizer_id = auth.uid())
    )
  )
);

drop policy if exists "import_batch_row_briefings_insert_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_insert_exhibitor"
on public.import_batch_row_briefings
for insert
with check (
  public.current_role() = 'exhibitor'
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

drop policy if exists "import_batch_row_briefings_update_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_update_exhibitor"
on public.import_batch_row_briefings
for update
using (
  public.current_role() = 'exhibitor'
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

drop policy if exists "import_batch_row_briefings_delete_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_delete_exhibitor"
on public.import_batch_row_briefings
for delete
using (
  public.current_role() = 'exhibitor'
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

drop policy if exists "import_batch_row_briefings_delete_organizer" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_delete_organizer"
on public.import_batch_row_briefings
for delete
using (
  public.current_role() = 'organizer'
  and batch_id in (
    select b.id from public.import_batches b
    where b.company_id in (select id from public.companies where organizer_id = auth.uid())
  )
);
