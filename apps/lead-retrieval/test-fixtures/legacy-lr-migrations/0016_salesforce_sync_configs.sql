create table if not exists public.integration_sync_configs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  sync_target_object text,
  sync_behavior text,
  campaign_name text,
  is_configured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_sync_configs_account_provider_unique unique (account_id, provider),
  constraint integration_sync_configs_provider_check check (provider in ('salesforce')),
  constraint integration_sync_configs_target_check check (
    sync_target_object is null
    or sync_target_object in ('lead', 'contact', 'campaign_member')
  ),
  constraint integration_sync_configs_behavior_check check (
    sync_behavior is null
    or sync_behavior in ('create_only', 'update_existing', 'upsert_by_email')
  )
);

create index if not exists integration_sync_configs_account_id_idx
  on public.integration_sync_configs (account_id);

create trigger integration_sync_configs_set_updated_at
before update on public.integration_sync_configs
for each row execute function public.set_updated_at();

alter table public.integration_sync_configs enable row level security;
