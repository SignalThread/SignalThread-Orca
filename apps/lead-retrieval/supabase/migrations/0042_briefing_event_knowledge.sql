-- Event-scoped briefing source material (URLs, uploaded files, notes) for exhibitor briefing workflows.
-- Scoped by company_id + event_id (exhibitor’s event from `exhibitors`).

create table if not exists public.briefing_event_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  content_group text not null check (content_group in ('website_sources', 'documents', 'briefing_notes')),
  kind text not null check (kind in ('url', 'file', 'notes')),
  url text,
  storage_path text,
  file_name text,
  mime_type text,
  byte_size bigint,
  notes_title text,
  notes_body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  constraint briefing_event_knowledge_url_chk check (
    kind <> 'url' or (url is not null and length(trim(url)) > 0)
  ),
  constraint briefing_event_knowledge_file_chk check (
    kind <> 'file' or (storage_path is not null and file_name is not null)
  ),
  constraint briefing_event_knowledge_notes_chk check (
    kind <> 'notes' or (notes_body is not null and length(trim(notes_body)) > 0)
  )
);

create index if not exists briefing_event_knowledge_company_event_idx
  on public.briefing_event_knowledge_items (company_id, event_id);

create index if not exists briefing_event_knowledge_event_idx
  on public.briefing_event_knowledge_items (event_id);

drop trigger if exists briefing_event_knowledge_set_updated_at on public.briefing_event_knowledge_items;
create trigger briefing_event_knowledge_set_updated_at
  before update on public.briefing_event_knowledge_items
  for each row execute function public.set_updated_at();

alter table public.briefing_event_knowledge_items enable row level security;

drop policy if exists "briefing_event_knowledge_select_exhibitor" on public.briefing_event_knowledge_items;
create policy "briefing_event_knowledge_select_exhibitor"
  on public.briefing_event_knowledge_items
  for select
  using (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  );

drop policy if exists "briefing_event_knowledge_insert_exhibitor" on public.briefing_event_knowledge_items;
create policy "briefing_event_knowledge_insert_exhibitor"
  on public.briefing_event_knowledge_items
  for insert
  with check (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  );

drop policy if exists "briefing_event_knowledge_update_exhibitor" on public.briefing_event_knowledge_items;
create policy "briefing_event_knowledge_update_exhibitor"
  on public.briefing_event_knowledge_items
  for update
  using (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  );

drop policy if exists "briefing_event_knowledge_delete_exhibitor" on public.briefing_event_knowledge_items;
create policy "briefing_event_knowledge_delete_exhibitor"
  on public.briefing_event_knowledge_items
  for delete
  using (
    public.current_role() in ('exhibitor', 'exhibitor_admin')
    and company_id = public.current_company_id()
  );
