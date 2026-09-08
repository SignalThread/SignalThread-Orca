-- Shared badge line-layout templates per company + event (Universal Capture scan_card).
begin;

create table if not exists public.badge_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  template_json jsonb not null,
  created_by uuid references public.users (id) on delete set null,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_templates_company_event_unique unique (company_id, event_id)
);

create index if not exists badge_templates_company_event_lookup_idx
  on public.badge_templates (company_id, event_id);

alter table public.badge_templates enable row level security;

-- App users: membership on the event + app permission flag + same company as row.
drop policy if exists badge_templates_event_app_members_all on public.badge_templates;

create policy badge_templates_event_app_members_all
on public.badge_templates
for all
to authenticated
using (
  exists (
    select 1
    from public.users u
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = public.badge_templates.event_id
    where u.id = auth.uid()
      and u.company_id = public.badge_templates.company_id
      and public.event_app_permission_enabled (eu.permissions)
  )
)
with check (
  exists (
    select 1
    from public.users u
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = public.badge_templates.event_id
    where u.id = auth.uid()
      and u.company_id = public.badge_templates.company_id
      and public.event_app_permission_enabled (eu.permissions)
  )
);

-- company_admin / exhibitor / exhibitor_admin: tenant-wide ops for their company rows.
drop policy if exists badge_templates_tenant_staff_all on public.badge_templates;

create policy badge_templates_tenant_staff_all
on public.badge_templates
for all
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and u.company_id = public.badge_templates.company_id
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and u.company_id = public.badge_templates.company_id
  )
);

-- Platform admin retains full visibility for support.
drop policy if exists badge_templates_platform_admin_all on public.badge_templates;

create policy badge_templates_platform_admin_all
on public.badge_templates
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

commit;
