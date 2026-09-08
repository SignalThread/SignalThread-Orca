-- Review Briefs / briefing-queue loads published import batches too. ensureBriefingRowsForBatch
-- INSERTs missing import_batch_row_briefings rows; approve flows UPDATE them. Policies from 0040
-- only allowed draft, so published batches hit RLS and the API returned 403 (permission_denied).

drop policy if exists "import_batch_row_briefings_insert_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_insert_exhibitor"
on public.import_batch_row_briefings
for insert
with check (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status in ('draft', 'published')
  )
);

drop policy if exists "import_batch_row_briefings_update_exhibitor" on public.import_batch_row_briefings;
create policy "import_batch_row_briefings_update_exhibitor"
on public.import_batch_row_briefings
for update
using (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status in ('draft', 'published')
  )
)
with check (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and batch_id in (
    select id from public.import_batches
    where company_id = public.current_company_id()
      and status in ('draft', 'published')
  )
);

-- DELETE stays draft-only: avoid destructive changes on published/import-complete batches.
