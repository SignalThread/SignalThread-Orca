-- 0002_platform_admin_rls.sql
-- Adds explicit RLS role support for:
--   platform_admin | company_admin | exhibitor
-- Notes:
-- - Uses auth.uid() + lookups against public.users.
-- - Does NOT use current_company_id().

begin;

-- 1) Ensure users.role contains only supported values.
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

-- 2) Enable RLS on all tenant-sensitive tables.
alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.leads enable row level security;

-- 3) Drop existing policies so final behavior is explicit and deterministic.
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

-- 4) companies policies
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

create policy companies_company_admin_all
on public.companies
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'company_admin'
      and actor.company_id = public.companies.id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'company_admin'
      and actor.company_id = public.companies.id
  )
);

create policy companies_exhibitor_all
on public.companies
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'exhibitor'
      and actor.company_id = public.companies.id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'exhibitor'
      and actor.company_id = public.companies.id
  )
);

-- 5) users policies
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

create policy users_company_admin_all
on public.users
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'company_admin'
      and actor.company_id = public.users.company_id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'company_admin'
      and actor.company_id = public.users.company_id
  )
);

create policy users_exhibitor_all
on public.users
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'exhibitor'
      and actor.company_id = public.users.company_id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'exhibitor'
      and actor.company_id = public.users.company_id
  )
);

-- 6) leads policies
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

create policy leads_company_admin_all
on public.leads
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'company_admin'
      and actor.company_id = public.leads.company_id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'company_admin'
      and actor.company_id = public.leads.company_id
  )
);

create policy leads_exhibitor_all
on public.leads
for all
to authenticated
using (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'exhibitor'
      and actor.company_id = public.leads.company_id
  )
)
with check (
  exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and actor.role = 'exhibitor'
      and actor.company_id = public.leads.company_id
  )
);

commit;
