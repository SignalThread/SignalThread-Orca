-- Repair schema drift where migration 0086 is recorded as applied but the
-- physical audit column is absent. This remains idempotent for environments
-- where 0086 was applied correctly and safely backfills any existing rows.

alter table public.emergency_login_code_audit_events
  add column if not exists method text;

update public.emergency_login_code_audit_events
set method = 'emergency_login_code'
where method is null or btrim(method) = '';

alter table public.emergency_login_code_audit_events
  alter column method set default 'emergency_login_code',
  alter column method set not null;

comment on column public.emergency_login_code_audit_events.method is
  'Server entry point that generated emergency login access; contains no generated credential material.';

notify pgrst, 'reload schema';
