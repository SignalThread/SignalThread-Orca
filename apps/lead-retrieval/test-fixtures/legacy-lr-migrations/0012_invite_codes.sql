create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  event_id uuid not null references public.events(id) on delete cascade,
  exhibitor_company_id uuid not null references public.companies(id) on delete cascade,

  email text not null,
  permissions jsonb not null default '{"admin": false, "app": false}'::jsonb,

  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  used_by_user_id uuid null references public.users(id) on delete set null
);

create index invite_codes_lookup_idx
  on public.invite_codes (event_id, exhibitor_company_id, email);

create index invite_codes_unused_idx
  on public.invite_codes (expires_at, used_at);

alter table public.invite_codes enable row level security;