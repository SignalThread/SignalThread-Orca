alter table public.registration_provider_configs
  add column if not exists api_base_url text,
  add column if not exists environment text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registration_provider_configs'
      and column_name = 'base_url'
  ) then
    execute 'update public.registration_provider_configs set api_base_url = coalesce(api_base_url, base_url) where api_base_url is null';
  end if;
end
$$;

update public.registration_provider_configs
set environment = case
  when coalesce(api_base_url, '') ilike '%apirest.streampoint.com%' then 'production'
  else 'staging'
end
where environment is null;

alter table public.registration_provider_configs
  alter column environment set default 'staging';

alter table public.registration_provider_configs
  alter column environment set not null;

alter table public.registration_provider_configs
  drop constraint if exists registration_provider_configs_environment_check;

alter table public.registration_provider_configs
  add constraint registration_provider_configs_environment_check check (
    environment in ('staging', 'production')
  );
