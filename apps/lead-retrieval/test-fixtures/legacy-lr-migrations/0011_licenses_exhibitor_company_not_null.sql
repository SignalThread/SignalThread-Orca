-- Backfill legacy orphan licenses before enforcing NOT NULL.
update public.licenses
set exhibitor_company_id = company_id
where exhibitor_company_id is null;

alter table public.licenses
alter column exhibitor_company_id set not null;
