-- Cumulative lead voice notes + synthesized lead-level insights (additive; capture recordings migrate later).
begin;

-- ---------------------------------------------------------------------------
-- Individual voice notes per lead (timeline; never overwritten in-app)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_voice_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  conversation_id uuid null,
  source text not null default 'context',
  sequence_index integer not null default 0,
  transcription_status text not null default 'pending',
  synthesis_status text not null default 'pending',
  transcript text null,
  summary text null,
  duration_ms integer null,
  audio_url text null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint lead_voice_notes_source_check
    check (source in ('capture_initial', 'context')),
  constraint lead_voice_notes_transcription_status_check
    check (transcription_status in ('pending', 'processing', 'completed', 'failed')),
  constraint lead_voice_notes_synthesis_status_check
    check (synthesis_status in ('pending', 'processing', 'completed', 'failed'))
);

create index if not exists lead_voice_notes_lead_timeline_idx
  on public.lead_voice_notes (lead_id, sequence_index asc, recorded_at asc)
  where deleted_at is null;

create index if not exists lead_voice_notes_lead_active_idx
  on public.lead_voice_notes (lead_id, created_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Cumulative synthesized insights at lead level (eventually consistent)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_cumulative_insights (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  status text not null default 'idle',
  insights_json jsonb null,
  source_note_count integer not null default 0,
  last_regenerated_at timestamptz null,
  requested_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_cumulative_insights_lead_unique unique (lead_id),
  constraint lead_cumulative_insights_status_check
    check (status in ('idle', 'pending', 'processing', 'completed', 'failed'))
);

create index if not exists lead_cumulative_insights_company_idx
  on public.lead_cumulative_insights (company_id);

-- ---------------------------------------------------------------------------
-- Soft-delete voice note → queue cumulative insight regeneration (server-side)
-- ---------------------------------------------------------------------------
create or replace function public.queue_lead_insight_regeneration_on_voice_note_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.lead_cumulative_insights (
      lead_id,
      company_id,
      status,
      requested_at,
      updated_at
    )
    values (
      new.lead_id,
      new.company_id,
      'pending',
      now(),
      now()
    )
    on conflict (lead_id) do update
      set status = 'pending',
          requested_at = now(),
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists lead_voice_notes_soft_delete_regen_insights on public.lead_voice_notes;

create trigger lead_voice_notes_soft_delete_regen_insights
after update of deleted_at on public.lead_voice_notes
for each row
execute function public.queue_lead_insight_regeneration_on_voice_note_delete();

-- ---------------------------------------------------------------------------
-- RLS: same event-scoped app access model as leads
-- ---------------------------------------------------------------------------
alter table public.lead_voice_notes enable row level security;
alter table public.lead_cumulative_insights enable row level security;

drop policy if exists lead_voice_notes_event_app_members_all on public.lead_voice_notes;

create policy lead_voice_notes_event_app_members_all
on public.lead_voice_notes
for all
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.users u
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = public.lead_voice_notes.event_id
    where u.id = auth.uid()
      and u.company_id = public.lead_voice_notes.company_id
      and public.event_app_permission_enabled (eu.permissions)
  )
)
with check (
  exists (
    select 1
    from public.users u
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = public.lead_voice_notes.event_id
    where u.id = auth.uid()
      and u.company_id = public.lead_voice_notes.company_id
      and public.event_app_permission_enabled (eu.permissions)
  )
);

drop policy if exists lead_voice_notes_tenant_staff_all on public.lead_voice_notes;

create policy lead_voice_notes_tenant_staff_all
on public.lead_voice_notes
for all
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and u.company_id = public.lead_voice_notes.company_id
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and u.company_id = public.lead_voice_notes.company_id
  )
);

drop policy if exists lead_cumulative_insights_event_app_members_select on public.lead_cumulative_insights;

create policy lead_cumulative_insights_event_app_members_select
on public.lead_cumulative_insights
for select
to authenticated
using (
  exists (
    select 1
    from public.leads l
    inner join public.users u on u.id = auth.uid() and u.company_id = l.company_id
    inner join public.event_users eu
      on eu.user_id = u.id
     and eu.event_id = l.event_id
    where l.id = public.lead_cumulative_insights.lead_id
      and public.event_app_permission_enabled (eu.permissions)
  )
);

drop policy if exists lead_cumulative_insights_tenant_staff_select on public.lead_cumulative_insights;

create policy lead_cumulative_insights_tenant_staff_select
on public.lead_cumulative_insights
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('company_admin', 'exhibitor', 'exhibitor_admin')
      and u.company_id = public.lead_cumulative_insights.company_id
  )
);

commit;
