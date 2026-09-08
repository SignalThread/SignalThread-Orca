-- Exhibitor admins have users.role = 'exhibitor_admin'; current_role() returns that value.
-- Policies that only checked = 'exhibitor' blocked SELECT/INSERT on import_batches (500 on active-draft).

drop policy if exists "import_batches_select_exhibitor" on public.import_batches;
create policy "import_batches_select_exhibitor"
on public.import_batches
for select
using (
  company_id in (select id from public.companies where organizer_id = auth.uid())
  or (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  )
);

drop policy if exists "import_batches_insert_exhibitor" on public.import_batches;
create policy "import_batches_insert_exhibitor"
on public.import_batches
for insert
with check (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and company_id = public.current_company_id()
  and status = 'draft'
);

drop policy if exists "import_batches_update_exhibitor" on public.import_batches;
create policy "import_batches_update_exhibitor"
on public.import_batches
for update
using (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and company_id = public.current_company_id()
)
with check (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and company_id = public.current_company_id()
);
