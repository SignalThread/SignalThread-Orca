alter table public.integrations
  add column if not exists last_refresh_attempt_at timestamptz,
  add column if not exists last_sync_error text;
