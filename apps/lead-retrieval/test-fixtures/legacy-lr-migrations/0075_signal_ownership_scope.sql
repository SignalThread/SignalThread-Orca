-- Finalized signal ownership model.
-- `visibility` remains as a legacy compatibility field; `signal_scope` is the
-- canonical ownership/scope boundary used by app code.

alter table public.signals
  add column if not exists company_id uuid null references public.companies(id) on delete cascade,
  add column if not exists owner_user_id uuid null references public.users(id) on delete cascade,
  add column if not exists signal_scope text null;

update public.signals s
set
  signal_scope = 'event',
  company_id = e.company_id,
  owner_user_id = null
from public.events e
where s.event_id = e.id
  and s.signal_scope is null;

update public.signals
set
  signal_scope = 'default',
  company_id = null,
  owner_user_id = null
where signal_scope is null
  and event_id is null
  and name in (
    'AI Summary',
    'Company Context',
    'Suggested Next Step',
    'Strategic Angle',
    'Conversation Brief Agent',
    'Company Intel Agent',
    'Follow-Up Agent',
    'Positioning Agent'
  );

update public.signals s
set
  signal_scope = 'company',
  company_id = u.company_id,
  owner_user_id = null
from public.users u
where s.signal_scope is null
  and s.created_by = u.id
  and u.company_id is not null;

-- Legacy orphan/global rows without a company owner are kept readable only as
-- legacy/default-like records so this migration is non-destructive. New app
-- writes are required to provide a company/event/private scope.
update public.signals
set
  signal_scope = 'default',
  company_id = null,
  owner_user_id = null
where signal_scope is null;

alter table public.signals
  alter column signal_scope set default 'company',
  alter column signal_scope set not null;

alter table public.signals
  drop constraint if exists signals_signal_scope_check;

alter table public.signals
  add constraint signals_signal_scope_check
  check (signal_scope in ('default', 'company', 'event', 'private'));

create index if not exists idx_signals_signal_scope on public.signals(signal_scope);
create index if not exists idx_signals_company_id on public.signals(company_id);
create index if not exists idx_signals_owner_user_id on public.signals(owner_user_id);
create index if not exists idx_signals_scope_company_updated
  on public.signals(signal_scope, company_id, updated_at desc);
create index if not exists idx_signals_scope_event_updated
  on public.signals(signal_scope, event_id, updated_at desc);

create index if not exists idx_signals_default_name
  on public.signals(lower(name))
  where signal_scope = 'default';

create index if not exists idx_signals_company_name
  on public.signals(company_id, lower(name))
  where signal_scope = 'company' and company_id is not null;

create index if not exists idx_signals_private_name
  on public.signals(company_id, event_id, owner_user_id, lower(name))
  where signal_scope = 'private'
    and company_id is not null
    and event_id is not null
    and owner_user_id is not null;

drop policy if exists "signals_select_scope" on public.signals;
create policy "signals_select_scope"
on public.signals
for select
using (
  public.current_role() = 'platform_admin'
  or (
    signal_scope = 'company'
    and company_id = public.current_company_id()
  )
  or (
    signal_scope = 'event'
    and exists (
      select 1
      from public.events e
      where e.id = public.signals.event_id
        and e.company_id = public.current_company_id()
    )
  )
  or (
    signal_scope = 'private'
    and owner_user_id = auth.uid()
    and exists (
      select 1
      from public.events e
      where e.id = public.signals.event_id
        and e.company_id = public.current_company_id()
    )
  )
  or (
    public.current_role() in ('organizer', 'organizer_admin')
    and company_id in (
      select c.id from public.companies c where c.organizer_id = auth.uid()
    )
  )
);

drop policy if exists "signals_insert_guard" on public.signals;
create policy "signals_insert_guard"
on public.signals
for insert
with check (
  created_by = auth.uid()
  and signal_scope <> 'default'
  and (
    public.current_role() = 'platform_admin'
    or (
      signal_scope = 'company'
      and company_id = public.current_company_id()
      and event_id is null
      and owner_user_id is null
    )
    or (
      signal_scope = 'event'
      and owner_user_id is null
      and exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and e.company_id = public.current_company_id()
      )
    )
    or (
      signal_scope = 'private'
      and owner_user_id = auth.uid()
      and exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and e.company_id = public.current_company_id()
      )
    )
  )
);

drop policy if exists "signals_update_guard" on public.signals;
create policy "signals_update_guard"
on public.signals
for update
using (
  public.current_role() = 'platform_admin'
  or (
    signal_scope = 'company'
    and company_id = public.current_company_id()
  )
  or (
    signal_scope = 'event'
    and exists (
      select 1
      from public.events e
      where e.id = public.signals.event_id
        and e.company_id = public.current_company_id()
        and coalesce(e.status, '') <> 'COMPLETED'
        and (e.end_date is null or e.end_date >= current_date)
    )
  )
  or (
    signal_scope = 'private'
    and owner_user_id = auth.uid()
    and exists (
      select 1
      from public.events e
      where e.id = public.signals.event_id
        and e.company_id = public.current_company_id()
        and coalesce(e.status, '') <> 'COMPLETED'
        and (e.end_date is null or e.end_date >= current_date)
    )
  )
)
with check (
  signal_scope <> 'default'
  and (
    public.current_role() = 'platform_admin'
    or (
      signal_scope = 'company'
      and company_id = public.current_company_id()
      and event_id is null
      and owner_user_id is null
    )
    or (
      signal_scope = 'event'
      and owner_user_id is null
      and exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and e.company_id = public.current_company_id()
          and coalesce(e.status, '') <> 'COMPLETED'
          and (e.end_date is null or e.end_date >= current_date)
      )
    )
    or (
      signal_scope = 'private'
      and owner_user_id = auth.uid()
      and exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and e.company_id = public.current_company_id()
          and coalesce(e.status, '') <> 'COMPLETED'
          and (e.end_date is null or e.end_date >= current_date)
      )
    )
  )
);

drop policy if exists "signals_delete_guard" on public.signals;
create policy "signals_delete_guard"
on public.signals
for delete
using (
  signal_scope <> 'default'
  and (
    public.current_role() = 'platform_admin'
    or (
      signal_scope = 'company'
      and company_id = public.current_company_id()
    )
    or (
      signal_scope = 'event'
      and exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and e.company_id = public.current_company_id()
          and coalesce(e.status, '') <> 'COMPLETED'
          and (e.end_date is null or e.end_date >= current_date)
      )
    )
    or (
      signal_scope = 'private'
      and owner_user_id = auth.uid()
      and exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and e.company_id = public.current_company_id()
          and coalesce(e.status, '') <> 'COMPLETED'
          and (e.end_date is null or e.end_date >= current_date)
      )
    )
  )
);
