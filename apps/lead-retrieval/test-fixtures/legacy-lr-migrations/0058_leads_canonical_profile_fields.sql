-- Canonical lead profile fields (single source of truth for upload, enrichment, manual edits).
-- Legacy enriched_* columns remain for backward compatibility but are no longer populated by new writes.

alter table public.leads
  add column if not exists linkedin_url text;

alter table public.leads
  add column if not exists company_domain text;

alter table public.leads
  add column if not exists industry text;

alter table public.leads
  add column if not exists company_size text;

alter table public.leads
  add column if not exists seniority text;

alter table public.leads
  add column if not exists intent_signals jsonb not null default '[]'::jsonb;

alter table public.leads
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Backfill from legacy enrichment columns where canonical is empty.
update public.leads
set
  linkedin_url = coalesce(nullif(btrim(coalesce(linkedin_url, '')), ''), enriched_linkedin_url),
  company_domain = coalesce(nullif(btrim(coalesce(company_domain, '')), ''), enriched_company_domain),
  industry = coalesce(nullif(btrim(coalesce(industry, '')), ''), enriched_industry),
  company_size = coalesce(nullif(btrim(coalesce(company_size, '')), ''), enriched_company_size),
  seniority = coalesce(nullif(btrim(coalesce(seniority, '')), ''), enriched_seniority),
  job_title = case
    when job_title is null or btrim(job_title) = '' then enriched_job_title
    else job_title
  end
where true;
