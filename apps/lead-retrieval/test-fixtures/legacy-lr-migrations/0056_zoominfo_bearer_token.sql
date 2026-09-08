-- BYO ZoomInfo API bearer token (per company). OAuth client fields remain nullable for legacy rows.

alter table public.zoominfo_company_connections
  add column if not exists zoominfo_bearer_token text;

alter table public.zoominfo_company_connections
  add column if not exists zoominfo_connection_label text;
