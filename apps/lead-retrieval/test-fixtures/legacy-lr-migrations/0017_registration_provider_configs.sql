create table if not exists public.registration_provider_configs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  base_url text,
  api_token text,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_provider_configs_account_provider_unique unique (account_id, provider),
  constraint registration_provider_configs_provider_check check (provider in ('streampoint'))
);

create index if not exists registration_provider_configs_account_id_idx
  on public.registration_provider_configs (account_id);

create trigger registration_provider_configs_set_updated_at
before update on public.registration_provider_configs
for each row execute function public.set_updated_at();

alter table public.registration_provider_configs enable row level security;
