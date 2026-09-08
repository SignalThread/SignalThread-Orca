-- Upgrade legacy zoominfo_company_connections (old 0054) to BYO OAuth shape.
-- Safe on databases that already have the final schema (idempotent).

alter table public.zoominfo_company_connections
  add column if not exists zoominfo_client_secret text;

alter table public.zoominfo_company_connections
  alter column access_token drop not null;

alter table public.zoominfo_company_connections
  drop constraint if exists zoominfo_company_connections_status_check;

alter table public.zoominfo_company_connections
  add constraint zoominfo_company_connections_status_check check (
    status in ('connected', 'expired', 'revoked', 'error', 'pending_oauth')
  );

alter table public.zoominfo_company_connections
  alter column status set default 'pending_oauth';
