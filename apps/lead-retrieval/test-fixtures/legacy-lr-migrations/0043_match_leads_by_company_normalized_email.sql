-- Safe lookup for draft batch Review Brief: match exhibitor leads by company + normalized email.
-- Used instead of ILIKE on email (underscore in LIKE patterns would be unsafe).

create or replace function public.match_leads_by_company_normalized_email(
  p_company_id uuid,
  p_email text
)
returns table (
  id uuid,
  email text,
  enriched_job_title text,
  enriched_company_size text,
  enriched_industry text,
  enriched_linkedin_url text,
  enriched_company_domain text,
  enriched_seniority text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.id,
    l.email,
    l.enriched_job_title,
    l.enriched_company_size,
    l.enriched_industry,
    l.enriched_linkedin_url,
    l.enriched_company_domain,
    l.enriched_seniority
  from public.leads l
  where l.company_id = p_company_id
    and l.email is not null
    and trim(l.email) <> ''
    and p_email is not null
    and trim(p_email) <> ''
    and lower(trim(l.email)) = lower(trim(p_email));
$$;

comment on function public.match_leads_by_company_normalized_email(uuid, text) is
  'Returns leads for one company whose email equals the argument after trim+lower. Review Brief uses this only when exactly one row matches.';

revoke all on function public.match_leads_by_company_normalized_email(uuid, text) from public;
grant execute on function public.match_leads_by_company_normalized_email(uuid, text) to authenticated;
