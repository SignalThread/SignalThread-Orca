-- Canonical lead classification for exhibitor lead workflows.
-- temperature is the single editable source of truth: hot | warm | cold.

alter table if exists public.leads
  add column if not exists temperature text;

update public.leads
set temperature = case
  when lower(coalesce(temperature, '')) in ('hot', 'warm', 'cold')
    then lower(temperature)
  when lower(coalesce(temperature, '')) in ('high')
    then 'hot'
  when lower(coalesce(temperature, '')) in ('medium', 'normal', 'unscored')
    then 'warm'
  when lower(coalesce(temperature, '')) in ('low')
    then 'cold'
  when priority_score >= 67
    then 'hot'
  when priority_score >= 34
    then 'warm'
  else 'cold'
end;

alter table public.leads
  alter column temperature set default 'warm';

update public.leads
set temperature = 'warm'
where temperature is null;

alter table public.leads
  alter column temperature set not null;

alter table public.leads
  drop constraint if exists leads_temperature_allowed_check;

alter table public.leads
  add constraint leads_temperature_allowed_check
  check (temperature in ('hot', 'warm', 'cold'));
