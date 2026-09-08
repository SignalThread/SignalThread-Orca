-- First-class staged row storage: one row per CSV data line, keyed by batch.
-- Replaces import_batch_field_mapping_state.staged_rows jsonb blob.
--
-- Append semantics (field-mapping save):
-- Each successful field-mapping POST that includes full CSV data REPLACES all import_batch_rows
-- for that batch_id (delete existing + insert new). This keeps validation deterministic and matches
-- "user saved the full file again". Incremental append without re-upload is not implemented here.

create table if not exists public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_index int not null,
  cells jsonb not null,
  created_at timestamptz not null default now(),
  constraint import_batch_rows_batch_row_index unique (batch_id, row_index)
);

create index if not exists idx_import_batch_rows_batch_id
  on public.import_batch_rows (batch_id);

comment on table public.import_batch_rows is
  'Staged CSV rows for import wizard batches. cells is a JSON array of strings (column order matches csv_headers on import_batch_field_mapping_state).';

alter table public.import_batch_rows enable row level security;

drop policy if exists "import_batch_rows_select_exhibitor" on public.import_batch_rows;
create policy "import_batch_rows_select_exhibitor"
on public.import_batch_rows
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

drop policy if exists "import_batch_rows_insert_exhibitor" on public.import_batch_rows;
create policy "import_batch_rows_insert_exhibitor"
on public.import_batch_rows
for insert
with check (
  public.current_role() = 'exhibitor'
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

drop policy if exists "import_batch_rows_delete_exhibitor" on public.import_batch_rows;
create policy "import_batch_rows_delete_exhibitor"
on public.import_batch_rows
for delete
using (
  public.current_role() = 'exhibitor'
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

drop policy if exists "import_batch_rows_delete_organizer" on public.import_batch_rows;
create policy "import_batch_rows_delete_organizer"
on public.import_batch_rows
for delete
using (
  public.current_role() = 'organizer'
  and batch_id in (
    select b.id from public.import_batches b
    where b.company_id in (select id from public.companies where organizer_id = auth.uid())
  )
);

do $migrate_staged$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'import_batch_field_mapping_state'
      and column_name = 'staged_rows'
  ) then
    insert into public.import_batch_rows (batch_id, row_index, cells)
    select
      f.batch_id,
      (t.ord - 1)::int,
      t.elem
    from public.import_batch_field_mapping_state f
    cross join lateral jsonb_array_elements(f.staged_rows) with ordinality as t(elem, ord)
    where jsonb_typeof(f.staged_rows) = 'array'
      and jsonb_array_length(f.staged_rows) > 0
    on conflict (batch_id, row_index) do nothing;

    alter table public.import_batch_field_mapping_state
      drop column staged_rows;
  end if;
end
$migrate_staged$;
