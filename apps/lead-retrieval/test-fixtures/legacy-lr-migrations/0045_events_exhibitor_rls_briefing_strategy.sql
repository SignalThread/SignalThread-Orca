-- Allow exhibitor admins to read/update their company’s event row (needed for events.briefing_strategy in Briefing Setup).
-- Platform admin policies remain; these add company-scoped access when company_id matches.

drop policy if exists "events_select_exhibitor_company" on public.events;
create policy "events_select_exhibitor_company"
  on public.events
  for select
  using (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id is not null
    and company_id = public.current_company_id()
  );

drop policy if exists "events_update_exhibitor_company" on public.events;
create policy "events_update_exhibitor_company"
  on public.events
  for update
  using (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id is not null
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id is not null
    and company_id = public.current_company_id()
  );
