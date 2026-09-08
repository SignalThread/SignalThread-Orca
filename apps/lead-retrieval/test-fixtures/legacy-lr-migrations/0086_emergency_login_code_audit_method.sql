alter table public.emergency_login_code_audit_events
  add column if not exists method text not null default 'emergency_login_code';
