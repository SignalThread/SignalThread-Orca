-- Dedupe rows that break PostgREST .single() / .maybeSingle() when more than one row matches,
-- then enforce uniqueness on natural keys.
--
-- Inspect before apply:
--   select user_id, event_id, count(*) from public.event_users group by 1,2 having count(*) > 1;
--   select lead_id, company_id, count(*) from public.lead_briefings group by 1,2 having count(*) > 1;
--   select id, count(*) from public.leads group by 1 having count(*) > 1;

begin;

-- event_users: retain one row per (user_id, event_id) — largest ctid kept
do $$
begin
  if to_regclass('public.event_users') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'event_users' and column_name = 'user_id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'event_users' and column_name = 'event_id'
    )
  then
    delete from public.event_users eu
    where eu.ctid in (
      select ctid from (
        select
          ctid,
          row_number() over (
            partition by user_id, event_id
            order by ctid desc
          ) as rn
        from public.event_users
      ) d
      where d.rn > 1
    );

    create unique index if not exists event_users_user_id_event_id_uk
      on public.event_users (user_id, event_id);
  else
    raise notice '0008: public.event_users missing or lacks user_id/event_id — skipped';
  end if;
end $$;

-- lead_briefings: one row per (lead_id, company_id)
do $$
begin
  if to_regclass('public.lead_briefings') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'lead_briefings' and column_name = 'lead_id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'lead_briefings' and column_name = 'company_id'
    )
  then
    delete from public.lead_briefings lb
    where lb.ctid in (
      select ctid from (
        select
          ctid,
          row_number() over (
            partition by lead_id, company_id
            order by ctid desc
          ) as rn
        from public.lead_briefings
      ) d
      where d.rn > 1
    );

    create unique index if not exists lead_briefings_lead_id_company_id_uk
      on public.lead_briefings (lead_id, company_id);
  else
    raise notice '0008: public.lead_briefings missing or lacks lead_id/company_id — skipped';
  end if;
end $$;

-- leads: remove duplicate ids if present (normally prevented by primary key)
do $$
begin
  if to_regclass('public.leads') is not null then
    delete from public.leads l
    where l.ctid in (
      select ctid from (
        select
          ctid,
          row_number() over (
            partition by id
            order by ctid desc
          ) as rn
        from public.leads
      ) d
      where d.rn > 1
    );
  else
    raise notice '0008: public.leads not present — skipped';
  end if;
end $$;

commit;
