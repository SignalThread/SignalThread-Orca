create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  type text not null,
  event_id uuid null references public.events(id) on delete set null,
  tags text[] not null default '{}'::text[],
  storage_path text,
  file_url text,
  mime_type text,
  uploaded_by uuid null references public.users(id) on delete set null,
  rep_sendable boolean not null default true,
  sent_count integer not null default 0 check (sent_count >= 0),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_account_id_idx
  on public.documents (account_id);

create index if not exists documents_event_id_idx
  on public.documents (event_id);

create index if not exists documents_rep_sendable_idx
  on public.documents (rep_sendable);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create table if not exists public.document_sends (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  lead_id uuid null references public.leads(id) on delete set null,
  recipient_email text not null,
  sent_by uuid null references public.users(id) on delete set null,
  provider_message_id text,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists document_sends_document_id_idx
  on public.document_sends (document_id);

create index if not exists document_sends_lead_id_idx
  on public.document_sends (lead_id);

create index if not exists document_sends_recipient_email_idx
  on public.document_sends (recipient_email);

alter table public.documents enable row level security;
alter table public.document_sends enable row level security;
