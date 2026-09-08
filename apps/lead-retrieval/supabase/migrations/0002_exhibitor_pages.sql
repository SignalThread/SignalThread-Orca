-- Phase 2: Exhibitor Admin pages support

-- Extend users for exhibitor visibility and table display
alter table public.users
  add column if not exists email text,
  add column if not exists license_id uuid references public.licenses(id) on delete set null;

create index if not exists idx_users_license_id on public.users(license_id);

create or replace function public.current_license_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select license_id from public.users where id = auth.uid() limit 1;
$$;

-- Replace users select policy with explicit visibility rules
DROP POLICY IF EXISTS "users_select_self_or_scope" ON public.users;
DROP POLICY IF EXISTS "users_select_visibility_v2" ON public.users;

create policy "users_select_visibility_v2"
on public.users
for select
using (
  id = auth.uid()
  or (
    license_id is not null
    and license_id = public.current_license_id()
  )
  or (
    public.current_role() in ('organizer', 'exhibitor')
    and company_id is not null
    and company_id = public.current_company_id()
  )
);

-- Campaigns table for exhibitor section
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_company_id on public.campaigns(company_id);
create index if not exists idx_campaigns_created_at on public.campaigns(created_at desc);

alter table public.campaigns enable row level security;

DROP POLICY IF EXISTS "campaigns_select_scope" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert_organizer" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update_organizer" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_delete_organizer" ON public.campaigns;

create policy "campaigns_select_scope"
on public.campaigns
for select
using (
  public.current_role() in ('organizer', 'exhibitor')
  and company_id = public.current_company_id()
);

create policy "campaigns_insert_organizer"
on public.campaigns
for insert
with check (
  public.current_role() = 'organizer'
  and company_id = public.current_company_id()
);

create policy "campaigns_update_organizer"
on public.campaigns
for update
using (
  public.current_role() = 'organizer'
  and company_id = public.current_company_id()
)
with check (
  public.current_role() = 'organizer'
  and company_id = public.current_company_id()
);

create policy "campaigns_delete_organizer"
on public.campaigns
for delete
using (
  public.current_role() = 'organizer'
  and company_id = public.current_company_id()
);
