-- Align lead_briefings RLS with exhibitor_admin role support used throughout import wizard APIs.
-- Without this, approval sync upserts from exhibitor_admin sessions fail with RLS 403.

drop policy if exists "lead_briefings_select_scope" on public.lead_briefings;
create policy "lead_briefings_select_scope"
on public.lead_briefings
for select
using (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  )
);

drop policy if exists "lead_briefings_insert_scope" on public.lead_briefings;
create policy "lead_briefings_insert_scope"
on public.lead_briefings
for insert
with check (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  )
);

drop policy if exists "lead_briefings_update_scope" on public.lead_briefings;
create policy "lead_briefings_update_scope"
on public.lead_briefings
for update
using (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  )
)
with check (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  )
);
