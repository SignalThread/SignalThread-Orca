-- Signal Library schema + RLS

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'signal_visibility'
  ) then
    create type public.signal_visibility as enum ('global', 'role', 'template');
  end if;
end
$$;

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('AI-Powered', 'Contextual', 'Custom', 'Call-to-Action')),
  default_prompt text not null,
  admin_override_prompt text null,
  visibility public.signal_visibility not null default 'global',
  role_scope text null,
  template_scope text null,
  is_active boolean not null default true,
  available_in_pattern_mode boolean not null default true,
  created_by uuid not null references public.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_signals_visibility on public.signals(visibility);
create index if not exists idx_signals_category on public.signals(category);
create index if not exists idx_signals_is_active on public.signals(is_active);
create index if not exists idx_signals_created_by on public.signals(created_by);
create index if not exists idx_signals_updated_at on public.signals(updated_at desc);

drop trigger if exists signals_set_updated_at on public.signals;
create trigger signals_set_updated_at
before update on public.signals
for each row
execute function public.set_updated_at();

alter table public.signals enable row level security;

drop policy if exists "signals_select_scope" on public.signals;
create policy "signals_select_scope"
on public.signals
for select
using (
  visibility = 'global'
  or (
    visibility = 'role'
    and (role_scope is null or role_scope = public.current_role())
    and (
      created_by = auth.uid()
      or exists (
        select 1
        from public.users creator
        where creator.id = public.signals.created_by
          and creator.company_id is not distinct from public.current_company_id()
      )
      or exists (
        select 1
        from public.users creator
        join public.companies c on c.id = creator.company_id
        where creator.id = public.signals.created_by
          and c.organizer_id = auth.uid()
      )
    )
  )
  or (
    visibility = 'template'
    and (
      created_by = auth.uid()
      or exists (
        select 1
        from public.users creator
        where creator.id = public.signals.created_by
          and creator.company_id is not distinct from public.current_company_id()
      )
      or exists (
        select 1
        from public.users creator
        join public.companies c on c.id = creator.company_id
        where creator.id = public.signals.created_by
          and c.organizer_id = auth.uid()
      )
    )
  )
);

drop policy if exists "signals_insert_guard" on public.signals;
create policy "signals_insert_guard"
on public.signals
for insert
with check (
  created_by = auth.uid()
  and (
    public.current_role() = 'organizer'
    or (
      public.current_role() = 'exhibitor'
      and visibility = 'role'
      and coalesce(role_scope, '') = 'exhibitor'
    )
  )
  and (visibility <> 'global' or public.current_role() = 'organizer')
);

drop policy if exists "signals_update_guard" on public.signals;
create policy "signals_update_guard"
on public.signals
for update
using (
  created_by = auth.uid()
  or (
    public.current_role() = 'organizer'
    and (
      visibility = 'global'
      or exists (
        select 1
        from public.users creator
        join public.companies c on c.id = creator.company_id
        where creator.id = public.signals.created_by
          and c.organizer_id = auth.uid()
      )
    )
  )
)
with check (
  (visibility <> 'global' or public.current_role() = 'organizer')
  and (
    public.current_role() = 'organizer'
    or (
      created_by = auth.uid()
      and visibility = 'role'
      and coalesce(role_scope, '') = 'exhibitor'
    )
  )
);

drop policy if exists "signals_delete_guard" on public.signals;
create policy "signals_delete_guard"
on public.signals
for delete
using (
  created_by = auth.uid()
  or (
    public.current_role() = 'organizer'
    and (
      visibility = 'global'
      or exists (
        select 1
        from public.users creator
        join public.companies c on c.id = creator.company_id
        where creator.id = public.signals.created_by
          and c.organizer_id = auth.uid()
      )
    )
  )
);
