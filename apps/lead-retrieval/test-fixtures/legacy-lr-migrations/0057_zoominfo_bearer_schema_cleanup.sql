-- ZoomInfo integration: final bearer-token schema (drop OAuth-era columns).
-- Preserves all rows; maps legacy status values to supported app values before tightening CHECK.

-- If OAuth left a usable access token but zoominfo_bearer_token was never set, carry it forward as Bearer.
update public.zoominfo_company_connections
set zoominfo_bearer_token = btrim(access_token)
where access_token is not null
  and btrim(access_token) <> ''
  and (zoominfo_bearer_token is null or btrim(zoominfo_bearer_token) = '');

-- Legacy OAuth / unused lifecycle values → treat as error (exhibitor can re-validate or replace token).
update public.zoominfo_company_connections
set status = 'error'
where lower(trim(status)) not in ('connected', 'error');

alter table public.zoominfo_company_connections
  drop constraint if exists zoominfo_company_connections_status_check;

alter table public.zoominfo_company_connections
  add constraint zoominfo_company_connections_status_check check (
    status in ('connected', 'error')
  );

alter table public.zoominfo_company_connections
  alter column status set default 'error';

alter table public.zoominfo_company_connections
  drop column if exists zoominfo_client_id;

alter table public.zoominfo_company_connections
  drop column if exists zoominfo_client_secret;

alter table public.zoominfo_company_connections
  drop column if exists access_token;

alter table public.zoominfo_company_connections
  drop column if exists refresh_token;

alter table public.zoominfo_company_connections
  drop column if exists token_type;

alter table public.zoominfo_company_connections
  drop column if exists scope;

alter table public.zoominfo_company_connections
  drop column if exists expires_at;

alter table public.zoominfo_company_connections
  drop column if exists last_sync_at;
