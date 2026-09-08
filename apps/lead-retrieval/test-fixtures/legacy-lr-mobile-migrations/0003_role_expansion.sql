-- 0003_role_expansion.sql
-- Final role expansion RLS foundation:
--   platform_admin | company_admin | exhibitor
-- Uses auth.uid() + joins to public.users.
-- Does not use current_company_id().

begin;

-- Ensure users.role has the three expected values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('platform_admin', 'company_admin', 'exhibitor')) not valid;
  end if;
end $$;

alter table public.users validate constraint users_role_check;

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.leads enable row level security;

-- Reset policies on target tables (explicit final state).
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
  loop
    execute format('drop policy if exists %I on public.companies', p.policyname);
  end loop;

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
  loop
    execute format('drop policy if exists %I on public.users', p.policyname);
  end loop;

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leads'
  loop
    execute format('drop policy if exists %I on public.leads', p.policyname);
  end loop;
end $$;

-- ---------------------------------
-- companies
-- ---------------------------------
-- platform_admin: read/write all companies
create policy companies_platform_admin_all
on public.companies
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'platform_admin'
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'platform_admin'
  )
);

-- company_admin + exhibitor: restricted to their company row
create policy companies_tenant_admin_exhibitor_all
on public.companies
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor')
      and actor.company_id = public.companies.id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor')
      and actor.company_id = public.companies.id
  )
);

-- ---------------------------------
-- users
-- ---------------------------------
-- platform_admin: read/write all users
create policy users_platform_admin_all
on public.users
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'platform_admin'
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'platform_admin'
  )
);

-- company_admin + exhibitor: read/write users only in their company
create policy users_tenant_admin_exhibitor_all
on public.users
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor')
      and actor.company_id = public.users.company_id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor')
      and actor.company_id = public.users.company_id
  )
);

-- ---------------------------------
-- leads
-- ---------------------------------
-- platform_admin: read/write all leads
create policy leads_platform_admin_all
on public.leads
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'platform_admin'
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'platform_admin'
  )
);

-- company_admin + exhibitor: read/write only leads in their company
create policy leads_tenant_admin_exhibitor_all
on public.leads
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor')
      and actor.company_id = public.leads.company_id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role in ('company_admin', 'exhibitor')
      and actor.company_id = public.leads.company_id
  )
);

commit;
