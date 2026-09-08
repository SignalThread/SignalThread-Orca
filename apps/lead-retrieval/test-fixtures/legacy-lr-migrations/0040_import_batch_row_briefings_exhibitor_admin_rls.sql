-- Align import_batch_row_briefings RLS with 0036/0038: exhibitor_admin was
-- blocked by INSERT/UPDATE/DELETE policies that only matched 'exhibitor'.

-- SELECT: already works (first branch uses current_company_id() without role check),
-- but add explicit exhibitor_admin for clarity / defence against future changes.
drop policy if exists "import_batch_row_briefings_select_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_select_exhibitor"
on public.import_batch_row_briefings
for select
using (
  (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and batch_id in (
      select id from public.import_batches
      where company_id = public.current_company_id()
    )
  )
  or (
    public.current_role() = 'organizer'
    and batch_id in (
      select b.id from public.import_batches b
      where b.company_id in (select id from public.companies where organizer_id = auth.uid())
    )
  )
);

-- INSERT
drop policy if exists "import_batch_row_briefings_insert_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_insert_exhibitor"
on public.import_batch_row_briefings
for insert
with check (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

-- UPDATE
drop policy if exists "import_batch_row_briefings_update_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_update_exhibitor"
on public.import_batch_row_briefings
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

-- DELETE
drop policy if exists "import_batch_row_briefings_delete_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_delete_exhibitor"
on public.import_batch_row_briefings
for delete
using (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status = 'draft'
  )
);

-- organizer delete unchanged (already correct)
