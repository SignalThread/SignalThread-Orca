-- Phase 1 schema: explicit multi-tenant core
create extension if not exists pgcrypto;

-- companies
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- app users profile + role (separate from auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('organizer', 'exhibitor')),
  company_id uuid null references public.companies(id) on delete set null,
  full_name text,
  created_at timestamptz not null default now()
);

-- licenses
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  seats_total int not null check (seats_total >= 1),
  seats_used int not null default 0 check (seats_used >= 0),
  status text not null default 'active' check (status in ('active', 'expired')),
  expires_at date not null,
  created_at timestamptz not null default now()
);

-- leads
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_user_id uuid null references public.users(id) on delete set null,
  full_name text not null,
  job_title text,
  priority_score int not null default 0 check (priority_score between 0 and 100),
  status text not null default 'new' check (status in ('new', 'follow_up', 'closed')),
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

create index if not exists idx_users_company_id on public.users(company_id);
create index if not exists idx_companies_organizer_id on public.companies(organizer_id);
create index if not exists idx_licenses_company_id on public.licenses(company_id);
create index if not exists idx_leads_company_id on public.leads(company_id);
create index if not exists idx_leads_priority on public.leads(priority_score desc);

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.licenses enable row level security;
alter table public.leads enable row level security;

-- helper functions for policy readability
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.users where id = auth.uid() limit 1;
$$;

-- companies policies
create policy "companies_select_scope"
on public.companies
for select
using (
  organizer_id = auth.uid()
  or (
    public.current_role() = 'exhibitor'
    and id = public.current_company_id()
  )
);

create policy "companies_insert_organizer"
on public.companies
for insert
with check (
  public.current_role() = 'organizer'
  and organizer_id = auth.uid()
);

create policy "companies_update_organizer"
on public.companies
for update
using (
  public.current_role() = 'organizer'
  and organizer_id = auth.uid()
)
with check (
  public.current_role() = 'organizer'
  and organizer_id = auth.uid()
);

create policy "companies_delete_organizer"
on public.companies
for delete
using (
  public.current_role() = 'organizer'
  and organizer_id = auth.uid()
);

-- users policies
create policy "users_select_self_or_scope"
on public.users
for select
using (
  id = auth.uid()
  or (
    public.current_role() = 'organizer'
    and company_id in (
      select id from public.companies where organizer_id = auth.uid()
    )
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

create policy "users_insert_self_or_organizer"
on public.users
for insert
with check (
  (
    id = auth.uid()
    and (
      (role = 'organizer' and company_id is null)
      or (role = 'exhibitor' and company_id is not null)
    )
  )
  or (
    public.current_role() = 'organizer'
    and (
      company_id is null
      or company_id in (select id from public.companies where organizer_id = auth.uid())
    )
  )
);

create policy "users_update_self_or_organizer"
on public.users
for update
using (
  id = auth.uid()
  or (
    public.current_role() = 'organizer'
    and company_id in (select id from public.companies where organizer_id = auth.uid())
  )
)
with check (
  (
    id = auth.uid()
    and role = public.current_role()
    and company_id is not distinct from public.current_company_id()
  )
  or (
    public.current_role() = 'organizer'
    and company_id in (select id from public.companies where organizer_id = auth.uid())
  )
);

create policy "users_delete_organizer"
on public.users
for delete
using (
  public.current_role() = 'organizer'
  and company_id in (select id from public.companies where organizer_id = auth.uid())
);

-- licenses policies
create policy "licenses_select_scope"
on public.licenses
for select
using (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

create policy "licenses_mutate_organizer"
on public.licenses
for all
using (
  public.current_role() = 'organizer'
  and company_id in (select id from public.companies where organizer_id = auth.uid())
)
with check (
  public.current_role() = 'organizer'
  and company_id in (select id from public.companies where organizer_id = auth.uid())
);

-- leads policies
create policy "leads_select_scope"
on public.leads
for select
using (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

create policy "leads_insert_scope"
on public.leads
for insert
with check (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

create policy "leads_update_scope"
on public.leads
for update
using (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
)
with check (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

create policy "leads_delete_organizer"
on public.leads
for delete
using (
  public.current_role() = 'organizer'
  and company_id in (select id from public.companies where organizer_id = auth.uid())
);
