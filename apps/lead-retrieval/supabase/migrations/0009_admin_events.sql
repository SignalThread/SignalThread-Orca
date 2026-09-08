-- Platform Admin events catalog

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text null,
  state text null,
  start_date date not null,
  end_date date not null,
  status text not null default 'UPCOMING' check (status in ('ACTIVE', 'UPCOMING', 'COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_start_date on public.events(start_date desc);
create index if not exists idx_events_status on public.events(status);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

alter table public.events enable row level security;

drop policy if exists "events_select_platform_admin" on public.events;
create policy "events_select_platform_admin"
on public.events
for select
using (public.current_role() = 'platform_admin');

drop policy if exists "events_insert_platform_admin" on public.events;
create policy "events_insert_platform_admin"
on public.events
for insert
with check (public.current_role() = 'platform_admin');

drop policy if exists "events_update_platform_admin" on public.events;
create policy "events_update_platform_admin"
on public.events
for update
using (public.current_role() = 'platform_admin')
with check (public.current_role() = 'platform_admin');

drop policy if exists "events_delete_platform_admin" on public.events;
create policy "events_delete_platform_admin"
on public.events
for delete
using (public.current_role() = 'platform_admin');
