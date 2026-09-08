-- Add normalized company domain field for lead enrichment output

alter table public.leads
add column if not exists enriched_company_domain text;
