create table if not exists public.emergency_login_code_audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  action_type text not null
    check (action_type = 'emergency_login_code_generated'),

  acting_admin_user_id uuid not null,
  target_user_id uuid not null,
  target_email text not null,
  company_id uuid not null,
  event_ids uuid[] not null default '{}',
  reason text not null,
  app_code_count integer not null default 0 check (app_code_count >= 0)
);

create index if not exists emergency_login_code_audit_events_company_created_idx
  on public.emergency_login_code_audit_events (company_id, created_at desc);

create index if not exists emergency_login_code_audit_events_target_created_idx
  on public.emergency_login_code_audit_events (target_user_id, created_at desc);

alter table public.emergency_login_code_audit_events enable row level security;
