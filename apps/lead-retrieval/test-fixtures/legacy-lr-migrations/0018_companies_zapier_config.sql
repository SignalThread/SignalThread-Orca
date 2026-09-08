alter table public.companies
  add column if not exists zapier_webhook_url text,
  add column if not exists zapier_payload_type text;

alter table public.companies
  drop constraint if exists companies_zapier_payload_type_check;

alter table public.companies
  add constraint companies_zapier_payload_type_check check (
    zapier_payload_type is null
    or zapier_payload_type in (
      'lead_created',
      'lead_updated',
      'lead_scored',
      'conversation_completed'
    )
  );
