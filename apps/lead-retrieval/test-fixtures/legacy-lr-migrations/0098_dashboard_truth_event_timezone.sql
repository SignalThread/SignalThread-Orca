-- Canonical event-local calendar truth for dashboard lifecycle and metrics.
-- Historical rows remain NULL unless their timezone is explicitly known; we
-- deliberately do not infer a business timezone from free-form location text.

alter table public.events
  add column if not exists timezone text null;

create or replace function public.is_valid_iana_timezone(value text)
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select value is not null
    and (value = 'UTC' or value like '%/%')
    and exists (
      select 1
      from pg_catalog.pg_timezone_names()
      where name = value
    );
$$;

create or replace function public.validate_event_timezone()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.timezone is not null and not public.is_valid_iana_timezone(new.timezone) then
    raise exception 'events.timezone must be a valid IANA timezone';
  end if;
  return new;
end;
$$;

drop trigger if exists events_validate_timezone on public.events;
create trigger events_validate_timezone
before insert or update of timezone on public.events
for each row execute function public.validate_event_timezone();

comment on column public.events.timezone is
  'Canonical IANA timezone for event lifecycle, dashboard calendar metrics, and event-local timestamps. NULL means not yet explicitly configured.';

-- Explicitly-known production test events. Toronto observes America/Toronto;
-- no other historical row is guessed from its name or location.
update public.events
set timezone = 'America/Toronto'
where id in (
  'b15f8966-8a1d-474b-b28e-c54f15a3a3a3'::uuid, -- Clun Ichi event
  '45baf4cd-bc48-4595-b3e7-2dac6d0ec7fe'::uuid  -- CMEE
)
and timezone is distinct from 'America/Toronto';

-- One scoped aggregate replaces account-card in-memory counting. The service
-- role calls this after resolving accessible event IDs. Calendar metrics stay
-- NULL for unconfigured events instead of silently falling back to UTC.
create or replace function public.dashboard_event_lead_metrics(
  p_company_id uuid,
  p_event_ids uuid[],
  p_now timestamptz default now()
)
returns table (
  event_id uuid,
  total_leads bigint,
  leads_today bigint,
  hot_leads bigint,
  warm_leads bigint,
  cold_leads bigint,
  hot_awaiting_follow_up bigint,
  hot_no_follow_up bigint,
  open_follow_ups bigint,
  due_today bigint,
  overdue bigint,
  scheduled_future bigint,
  still_new bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    e.id as event_id,
    count(l.id) as total_leads,
    case when e.timezone is null then null else count(l.id) filter (
      where l.created_at >= (((p_now at time zone e.timezone)::date)::timestamp at time zone e.timezone)
        and l.created_at < (((((p_now at time zone e.timezone)::date) + 1)::timestamp) at time zone e.timezone)
    ) end as leads_today,
    count(l.id) filter (where lower(coalesce(l.temperature, '')) = 'hot') as hot_leads,
    count(l.id) filter (where lower(coalesce(l.temperature, '')) = 'warm') as warm_leads,
    count(l.id) filter (where lower(coalesce(l.temperature, '')) = 'cold') as cold_leads,
    case when e.timezone is null then null else count(l.id) filter (
      where lower(coalesce(l.temperature, '')) = 'hot'
        and lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and (
          (l.follow_up_date is null and l.follow_up_at is null)
          or l.follow_up_date <= (p_now at time zone e.timezone)::date
        )
    ) end as hot_awaiting_follow_up,
    count(l.id) filter (
      where lower(coalesce(l.temperature, '')) = 'hot'
        and lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and l.follow_up_date is null
        and l.follow_up_at is null
    ) as hot_no_follow_up,
    count(l.id) filter (
      where lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and (l.follow_up_date is not null or l.follow_up_at is not null)
    ) as open_follow_ups,
    case when e.timezone is null then null else count(l.id) filter (
      where lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and l.follow_up_date = (p_now at time zone e.timezone)::date
    ) end as due_today,
    case when e.timezone is null then null else count(l.id) filter (
      where lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and l.follow_up_date < (p_now at time zone e.timezone)::date
    ) end as overdue,
    case when e.timezone is null then null else count(l.id) filter (
      where lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and l.follow_up_date > (p_now at time zone e.timezone)::date
    ) end as scheduled_future,
    count(l.id) filter (where lower(coalesce(l.status, '')) = 'new') as still_new
  from public.events e
  left join public.leads l
    on l.event_id = e.id
   and l.company_id = p_company_id
  where e.company_id = p_company_id
    and e.id = any(p_event_ids)
  group by e.id, e.timezone;
$$;

revoke all on function public.dashboard_event_lead_metrics(uuid, uuid[], timestamptz) from public;
grant execute on function public.dashboard_event_lead_metrics(uuid, uuid[], timestamptz) to service_role;
