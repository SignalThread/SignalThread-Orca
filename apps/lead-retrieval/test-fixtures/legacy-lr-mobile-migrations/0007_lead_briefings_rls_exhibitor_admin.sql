-- Align mobile `exhibitor_admin` with RLS, add lead_briefings read policies, extend delete_lead authz.
-- Historical migrations used `exhibitor` only; the Expo app uses `exhibitor_admin` in public.users.role.

begin;

-- ---------------------------------------------------------------------------
-- users.role: allow exhibitor_admin (mobile) alongside legacy exhibitor
-- ---------------------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('platform_admin', 'company_admin', 'exhibitor', 'exhibitor_admin')) not valid;

alter table public.users validate constraint users_role_check;

-- ---------------------------------------------------------------------------
-- Refresh tenant policies (companies, users, leads) to include exhibitor_admin
-- ---------------------------------------------------------------------------
drop policy if exists companies_tenant_admin_exhibitor_all on public.companies;

create policy companies_tenant_admin_exhibitor_all
on public.companies
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and actor.company_id = public.companies.id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and actor.company_id = public.companies.id
  )
);

drop policy if exists users_tenant_admin_exhibitor_all on public.users;

create policy users_tenant_admin_exhibitor_all
on public.users
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and actor.company_id = public.users.company_id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and actor.company_id = public.users.company_id
  )
);

drop policy if exists leads_tenant_admin_exhibitor_all on public.leads;

create policy leads_tenant_admin_exhibitor_all
on public.leads
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and actor.company_id = public.leads.company_id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and actor.company_id = public.leads.company_id
  )
);

-- ---------------------------------------------------------------------------
-- lead_briefings: mobile reads by company scope (table may exist only in some envs)
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  if to_regclass('public.lead_briefings') is null then
    raise notice '0007: public.lead_briefings missing — skip RLS policies (create table first in this env).';
  else
    execute 'alter table public.lead_briefings enable row level security';

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'lead_briefings'
    loop
      execute format('drop policy if exists %I on public.lead_briefings', p.policyname);
    end loop;

    execute $pol$
      create policy lead_briefings_platform_admin_select
      on public.lead_briefings
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.users actor
          where actor.id = auth.uid()
            and actor.role = 'platform_admin'
        )
      );
    $pol$;

    execute $pol$
      create policy lead_briefings_tenant_select
      on public.lead_briefings
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.users actor
          where actor.id = auth.uid()
            and actor.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
            and actor.company_id = public.lead_briefings.company_id
        )
      );
    $pol$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- delete_lead RPC: allow exhibitor_admin
-- ---------------------------------------------------------------------------
create or replace function public.delete_lead(lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_user_company uuid;
  v_lead_company uuid;
  v_deleted uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select u.role::text, u.company_id
  into v_role, v_user_company
  from public.users u
  where u.id = v_uid;

  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_registered');
  end if;

  select l.company_id
  into v_lead_company
  from public.leads l
  where l.id = lead_id;

  if not found then
    return jsonb_build_object('ok', true, 'missing', true);
  end if;

  if v_lead_company is null then
    return jsonb_build_object('ok', false, 'error', 'lead_missing_company');
  end if;

  if v_role = 'platform_admin' then
    delete from public.leads where id = lead_id returning id into v_deleted;
    return jsonb_build_object('ok', true, 'id', v_deleted);
  end if;

  if v_role in ('company_admin', 'exhibitor', 'exhibitor_admin')
     and v_user_company is not null
     and v_user_company = v_lead_company then
    delete from public.leads where id = lead_id returning id into v_deleted;
    return jsonb_build_object('ok', true, 'id', v_deleted);
  end if;

  return jsonb_build_object('ok', false, 'error', 'forbidden');
end;
$$;

commit;
