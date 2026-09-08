-- Per-lead briefing review rows for import wizard / exhibitor workflow

create table if not exists public.lead_briefings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_briefings_lead_id_unique unique (lead_id)
);

create index if not exists idx_lead_briefings_company_updated
  on public.lead_briefings (company_id, updated_at desc);

create trigger lead_briefings_set_updated_at
before update on public.lead_briefings
for each row execute function public.set_updated_at();

alter table public.lead_briefings enable row level security;

drop policy if exists "lead_briefings_select_scope" on public.lead_briefings;
create policy "lead_briefings_select_scope"
on public.lead_briefings
for select
using (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

drop policy if exists "lead_briefings_insert_scope" on public.lead_briefings;
create policy "lead_briefings_insert_scope"
on public.lead_briefings
for insert
with check (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

drop policy if exists "lead_briefings_update_scope" on public.lead_briefings;
create policy "lead_briefings_update_scope"
on public.lead_briefings
for update
using (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
)
with check (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

drop policy if exists "lead_briefings_delete_organizer" on public.lead_briefings;
create policy "lead_briefings_delete_organizer"
on public.lead_briefings
for delete
using (
  public.current_role() = 'organizer'
  and company_id in (select id from public.companies where organizer_id = auth.uid())
);
