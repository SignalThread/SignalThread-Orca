-- Align import_batch_field_mapping_state + import_batch_rows with import_batches (0036):
-- exhibitor_admin was blocked by RLS while the API allows exhibitor_admin → POST /field-mapping 500.

-- import_batch_field_mapping_state
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
    public.current_role() in ('exhibitor', 'exhibitor_admin')
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
  public.current_role() in ('exhibitor', 'exhibitor_admin')
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
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
)
with check (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

-- import_batch_rows
drop policy if exists "import_batch_rows_select_exhibitor"
  on public.import_batch_rows;
create policy "import_batch_rows_select_exhibitor"
on public.import_batch_rows
for select
using (
  batch_id in (
    select b.id from public.import_batches b
    where b.company_id in (select id from public.companies where organizer_id = auth.uid())
  )
  or (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and batch_id in (
      select id from public.import_batches where company_id = public.current_company_id()
    )
  )
);

drop policy if exists "import_batch_rows_insert_exhibitor"
  on public.import_batch_rows;
create policy "import_batch_rows_insert_exhibitor"
on public.import_batch_rows
for insert
with check (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

drop policy if exists "import_batch_rows_delete_exhibitor"
  on public.import_batch_rows;
create policy "import_batch_rows_delete_exhibitor"
on public.import_batch_rows
for delete
using (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);
