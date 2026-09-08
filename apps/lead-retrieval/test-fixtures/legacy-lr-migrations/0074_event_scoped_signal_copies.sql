-- Event-scoped editable signal copies.
-- Approved global starter signals remain as templates; events receive their own rows.

alter table public.signals
  add column if not exists event_id uuid null references public.events(id) on delete cascade,
  add column if not exists source_signal_id uuid null references public.signals(id) on delete set null;

create index if not exists idx_signals_event_id on public.signals(event_id);
create index if not exists idx_signals_source_signal_id on public.signals(source_signal_id);

create unique index if not exists uniq_signals_event_source_signal
  on public.signals(event_id, source_signal_id)
  where event_id is not null and source_signal_id is not null;

create unique index if not exists uniq_signals_event_name
  on public.signals(event_id, lower(name))
  where event_id is not null;

drop policy if exists "signals_select_scope" on public.signals;
create policy "signals_select_scope"
on public.signals
for select
using (
  (
    event_id is null
    and (
      visibility = 'global'
      or (
        visibility = 'role'
        and (role_scope is null or role_scope = public.current_role())
        and (
          created_by = auth.uid()
          or exists (
            select 1
            from public.users creator
            where creator.id = public.signals.created_by
              and creator.company_id is not distinct from public.current_company_id()
          )
          or exists (
            select 1
            from public.users creator
            join public.companies c on c.id = creator.company_id
            where creator.id = public.signals.created_by
              and c.organizer_id = auth.uid()
          )
        )
      )
      or (
        visibility = 'template'
        and (
          created_by = auth.uid()
          or exists (
            select 1
            from public.users creator
            where creator.id = public.signals.created_by
              and creator.company_id is not distinct from public.current_company_id()
          )
          or exists (
            select 1
            from public.users creator
            join public.companies c on c.id = creator.company_id
            where creator.id = public.signals.created_by
              and c.organizer_id = auth.uid()
          )
        )
      )
    )
  )
  or (
    event_id is not null
    and (
      public.current_role() = 'platform_admin'
      or exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and (
            (
              public.current_role() in ('exhibitor', 'exhibitor_admin', 'exhibitor_viewer')
              and e.company_id = public.current_company_id()
            )
            or (
              public.current_role() in ('organizer', 'organizer_admin')
              and exists (
                select 1
                from public.companies c
                where c.id = e.company_id
                  and c.organizer_id = auth.uid()
              )
            )
          )
      )
    )
  )
);

drop policy if exists "signals_update_guard" on public.signals;
create policy "signals_update_guard"
on public.signals
for update
using (
  (
    event_id is null
    and (
      created_by = auth.uid()
      or (
        public.current_role() in ('organizer', 'organizer_admin')
        and (
          visibility = 'global'
          or exists (
            select 1
            from public.users creator
            join public.companies c on c.id = creator.company_id
            where creator.id = public.signals.created_by
              and c.organizer_id = auth.uid()
          )
        )
      )
    )
  )
  or (
    event_id is not null
    and (
      public.current_role() = 'platform_admin'
      or exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and (
            (
              public.current_role() = 'exhibitor_admin'
              and e.company_id = public.current_company_id()
            )
            or (
              public.current_role() in ('organizer', 'organizer_admin')
              and exists (
                select 1
                from public.companies c
                where c.id = e.company_id
                  and c.organizer_id = auth.uid()
              )
            )
          )
      )
    )
  )
)
with check (
  (
    event_id is null
    and (visibility <> 'global' or public.current_role() in ('organizer', 'organizer_admin'))
    and (
      public.current_role() in ('organizer', 'organizer_admin')
      or (
        created_by = auth.uid()
        and visibility = 'role'
        and coalesce(role_scope, '') in ('exhibitor', 'exhibitor_admin')
      )
    )
  )
  or (
    event_id is not null
    and (
      public.current_role() = 'platform_admin'
      or exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and (
            (
              public.current_role() = 'exhibitor_admin'
              and e.company_id = public.current_company_id()
            )
            or (
              public.current_role() in ('organizer', 'organizer_admin')
              and exists (
                select 1
                from public.companies c
                where c.id = e.company_id
                  and c.organizer_id = auth.uid()
              )
            )
          )
      )
    )
  )
);

drop policy if exists "signals_delete_guard" on public.signals;
create policy "signals_delete_guard"
on public.signals
for delete
using (
  (
    event_id is null
    and (
      created_by = auth.uid()
      or (
        public.current_role() in ('organizer', 'organizer_admin')
        and (
          visibility = 'global'
          or exists (
            select 1
            from public.users creator
            join public.companies c on c.id = creator.company_id
            where creator.id = public.signals.created_by
              and c.organizer_id = auth.uid()
          )
        )
      )
    )
  )
  or (
    event_id is not null
    and (
      public.current_role() = 'platform_admin'
      or exists (
        select 1
        from public.events e
        where e.id = public.signals.event_id
          and (
            (
              public.current_role() = 'exhibitor_admin'
              and e.company_id = public.current_company_id()
            )
            or (
              public.current_role() in ('organizer', 'organizer_admin')
              and exists (
                select 1
                from public.companies c
                where c.id = e.company_id
                  and c.organizer_id = auth.uid()
              )
            )
          )
      )
    )
  )
);
