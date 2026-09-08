alter table public.events
  add column if not exists registration_provider text,
  add column if not exists registration_base_url text,
  add column if not exists registration_api_token text,
  add column if not exists registration_event_id text;

alter table public.events
  drop constraint if exists events_registration_provider_check;

alter table public.events
  add constraint events_registration_provider_check
  check (
    registration_provider is null
    or registration_provider in ('streampoint')
  );
