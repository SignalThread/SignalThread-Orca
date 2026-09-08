-- Lead enrichment storage + normalized lead columns

create table if not exists public.lead_enrichments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  provider text not null,
  raw_response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_enrichments_lead_id on public.lead_enrichments(lead_id);
create index if not exists idx_lead_enrichments_created_at on public.lead_enrichments(created_at desc);

alter table public.leads
  add column if not exists enriched_job_title text,
  add column if not exists enriched_seniority text,
  add column if not exists enriched_company_size text,
  add column if not exists enriched_industry text,
  add column if not exists enriched_linkedin_url text,
  add column if not exists enriched_score int;

alter table public.lead_enrichments enable row level security;

drop policy if exists "lead_enrichments_select_scope" on public.lead_enrichments;
drop policy if exists "lead_enrichments_insert_scope" on public.lead_enrichments;

create policy "lead_enrichments_select_scope"
on public.lead_enrichments
for select
using (
  exists (
    select 1
    from public.leads l
    where l.id = lead_id
      and (
        l.company_id in (select id from public.companies where organizer_id = auth.uid())
        or (
          public.current_role() = 'exhibitor'
          and l.company_id = public.current_company_id()
        )
      )
  )
);

create policy "lead_enrichments_insert_scope"
on public.lead_enrichments
for insert
with check (
  exists (
    select 1
    from public.leads l
    where l.id = lead_id
      and (
        l.company_id in (select id from public.companies where organizer_id = auth.uid())
        or (
          public.current_role() = 'exhibitor'
          and l.company_id = public.current_company_id()
        )
      )
  )
);
