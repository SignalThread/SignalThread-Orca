-- Mobile: exhibitor_viewer can read/write leads for events where event_users.permissions grants app access.
-- Admin/web: DELETE and delete_lead RPC remain blocked for exhibitor_viewer (no DELETE policy here).
-- company_admin / exhibitor / exhibitor_admin keep existing tenant-wide leads policies.

begin;

-- ---------------------------------------------------------------------------
-- users.role: allow exhibitor_viewer (was missing from earlier check constraints)
-- ---------------------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (
    role in (
      'platform_admin',
      'company_admin',
      'exhibitor',
      'exhibitor_admin',
      'exhibitor_viewer'
    )
  )
  not valid;

alter table public.users validate constraint users_role_check;

-- ---------------------------------------------------------------------------
-- Permission helper: aligned with mobile `isAppPermissionEnabled` (activeEventSelection.ts)
-- ---------------------------------------------------------------------------
create or replace function public.event_app_permission_enabled(p jsonb)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select p is not null
    and (
      (p->>'app') in ('true', 't', '1', 'yes')
      or (p->'app') = 'true'::jsonb
      or (p->>'all_events') in ('true', 't', '1', 'yes')
      or (p->'all_events') = 'true'::jsonb
      or (p->>'app_access') in ('true', 't', '1', 'yes')
      or (p->>'can_use_app') in ('true', 't', '1', 'yes')
      or (p->>'scope') = 'all'
      or (p->>'event_scope') = 'all'
    );
$$;

grant execute on function public.event_app_permission_enabled(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- leads: exhibitor_viewer scoped by company + event_users.event_id + app flag
-- ---------------------------------------------------------------------------
drop policy if exists leads_exhibitor_viewer_app_select on public.leads;
drop policy if exists leads_exhibitor_viewer_app_insert on public.leads;
drop policy if exists leads_exhibitor_viewer_app_update on public.leads;

create policy leads_exhibitor_viewer_app_select
on public.leads
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = public.leads.event_id
    where u.id = auth.uid()
      and u.role = 'exhibitor_viewer'
      and u.company_id is not null
      and u.company_id = public.leads.company_id
      and public.event_app_permission_enabled(eu.permissions)
  )
);

create policy leads_exhibitor_viewer_app_insert
on public.leads
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = public.leads.event_id
    where u.id = auth.uid()
      and u.role = 'exhibitor_viewer'
      and u.company_id is not null
      and u.company_id = public.leads.company_id
      and public.event_app_permission_enabled(eu.permissions)
  )
);

create policy leads_exhibitor_viewer_app_update
on public.leads
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = public.leads.event_id
    where u.id = auth.uid()
      and u.role = 'exhibitor_viewer'
      and u.company_id is not null
      and u.company_id = public.leads.company_id
      and public.event_app_permission_enabled(eu.permissions)
  )
)
with check (
  exists (
    select 1
    from public.users u
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = public.leads.event_id
    where u.id = auth.uid()
      and u.role = 'exhibitor_viewer'
      and u.company_id is not null
      and u.company_id = public.leads.company_id
      and public.event_app_permission_enabled(eu.permissions)
  )
);

-- ---------------------------------------------------------------------------
-- lead_briefings: so viewers with app access can read briefings for scoped leads
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.lead_briefings') is not null then
    drop policy if exists lead_briefings_exhibitor_viewer_app_select on public.lead_briefings;

    execute $pol$
      create policy lead_briefings_exhibitor_viewer_app_select
      on public.lead_briefings
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.users u
          inner join public.leads l
            on l.id = public.lead_briefings.lead_id
           and l.company_id = public.lead_briefings.company_id
          inner join public.event_users eu
            on eu.user_id = u.id
           and eu.event_id = l.event_id
          where u.id = auth.uid()
            and u.role = 'exhibitor_viewer'
            and u.company_id = public.lead_briefings.company_id
            and u.company_id = l.company_id
            and public.event_app_permission_enabled(eu.permissions)
        )
      );
    $pol$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.companies') is not null then
    drop policy if exists companies_exhibitor_viewer_select on public.companies;

    create policy companies_exhibitor_viewer_select
    on public.companies
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role = 'exhibitor_viewer'
          and u.company_id = public.companies.id
      )
    );
  end if;
end $$;

do $$
begin
  if to_regclass('public.users') is not null then
    drop policy if exists users_exhibitor_viewer_select_self on public.users;

    create policy users_exhibitor_viewer_select_self
    on public.users
    for select
    to authenticated
    using (
      id = auth.uid()
      and role = 'exhibitor_viewer'
    );
  end if;
end $$;

commit;
