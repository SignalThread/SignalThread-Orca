-- ZoomInfo OAuth: bring-your-own developer app per company.
-- One row per company (provider = zoominfo). Client ID + secret stored on the row; tokens optional until OAuth completes.

create table if not exists public.zoominfo_company_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  provider text not null default 'zoominfo',
  zoominfo_client_id text,
  zoominfo_client_secret text,
  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  connected_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  status text not null default 'pending_oauth',
  metadata jsonb,
  constraint zoominfo_company_connections_company_provider_unique unique (company_id, provider),
  constraint zoominfo_company_connections_provider_zoominfo check (provider = 'zoominfo'),
  constraint zoominfo_company_connections_status_check check (
    status in ('connected', 'expired', 'revoked', 'error', 'pending_oauth')
  )
);

create index if not exists zoominfo_company_connections_company_id_idx
  on public.zoominfo_company_connections (company_id);

create trigger zoominfo_company_connections_set_updated_at
before update on public.zoominfo_company_connections
for each row execute function public.set_updated_at();

alter table public.zoominfo_company_connections enable row level security;
