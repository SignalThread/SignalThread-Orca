create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text[] not null default '{}'::text[],
  provider_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_account_provider_unique unique (account_id, provider)
);

create index if not exists integrations_account_id_idx
  on public.integrations (account_id);

create trigger integrations_set_updated_at
before update on public.integrations
for each row execute function public.set_updated_at();

alter table public.integrations enable row level security;
