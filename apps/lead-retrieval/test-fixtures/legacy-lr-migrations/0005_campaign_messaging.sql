-- Campaign messaging primitives
-- Backward-safe: extends existing campaigns table if it already exists.

create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  mode text not null default 'single',
  status text not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  scheduled_at timestamptz null
);

alter table public.campaigns
  add column if not exists mode text not null default 'single',
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists scheduled_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_mode_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_mode_check check (mode in ('single', 'group'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_status_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_status_check check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed'));
  end if;
end
$$;

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.campaign_recipients(id) on delete cascade,
  subject text,
  body_html text,
  body_text text,
  status text not null default 'draft',
  provider text,
  provider_message_id text,
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaign_messages_status_check'
      and conrelid = 'public.campaign_messages'::regclass
  ) then
    alter table public.campaign_messages
      add constraint campaign_messages_status_check check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed'));
  end if;
end
$$;

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_message_id uuid not null references public.campaign_messages(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_events_event_type_check'
      and conrelid = 'public.email_events'::regclass
  ) then
    alter table public.email_events
      add constraint email_events_event_type_check check (event_type in ('open', 'click', 'reply'));
  end if;
end
$$;

create index if not exists idx_campaign_recipients_campaign_id on public.campaign_recipients(campaign_id);
create index if not exists idx_campaign_messages_recipient_id on public.campaign_messages(recipient_id);
create index if not exists idx_email_events_campaign_message_id on public.email_events(campaign_message_id);
