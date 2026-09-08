-- Normalize current_role() so RLS policies match real users.role values (casing, whitespace).
-- Policies compare to lowercase literals like 'exhibitor_admin'; raw DB values often differ.
-- Re-apply lead_briefings policies so deployed DBs pick up exhibitor_admin scope even if 0048 was missed.

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(both from coalesce(role, '')))
  from public.users
  where id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_role() to authenticated;
grant execute on function public.current_company_id() to authenticated;

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
