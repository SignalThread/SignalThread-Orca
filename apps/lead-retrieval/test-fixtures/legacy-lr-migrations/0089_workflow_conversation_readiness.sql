begin;

alter table public.lead_conversations
  add column if not exists conversation_version int;

create table if not exists public.lead_conversation_readiness (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  latest_conversation_version int not null default 0 check (latest_conversation_version >= 0),
  latest_audio_finalized_at timestamptz,
  transcript_status text not null default 'pending'
    check (transcript_status in ('pending', 'processing', 'ready', 'failed')),
  transcript_version int,
  transcript_ready_at timestamptz,
  insights_status text not null default 'pending'
    check (insights_status in ('pending', 'processing', 'ready', 'failed')),
  insights_version int,
  insights_ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lead_conversation_readiness_set_updated_at
before update on public.lead_conversation_readiness
for each row execute function public.set_updated_at();

with numbered as (
  select
    id,
    lead_id,
    row_number() over (partition by lead_id order by created_at asc, id asc)::int as version
  from public.lead_conversations
)
update public.lead_conversations c
set conversation_version = numbered.version
from numbered
where c.id = numbered.id
  and c.conversation_version is null;

insert into public.lead_conversation_readiness (
  lead_id,
  latest_conversation_version,
  latest_audio_finalized_at,
  transcript_status,
  transcript_version,
  transcript_ready_at,
  insights_status,
  insights_version,
  insights_ready_at
)
select
  c.lead_id,
  max(c.conversation_version),
  max(c.created_at),
  case
    when bool_or(c.transcription_status = 'failed') filter (where c.conversation_version = latest.latest_version) then 'failed'
    when bool_or(c.transcription_status = 'completed' and nullif(trim(coalesce(c.transcript, '')), '') is not null)
      filter (where c.conversation_version = latest.latest_version) then 'ready'
    else 'pending'
  end,
  case
    when bool_or(c.transcription_status = 'completed' and nullif(trim(coalesce(c.transcript, '')), '') is not null)
      filter (where c.conversation_version = latest.latest_version) then latest.latest_version
    else null
  end,
  max(c.transcribed_at) filter (
    where c.conversation_version = latest.latest_version
      and c.transcription_status = 'completed'
      and nullif(trim(coalesce(c.transcript, '')), '') is not null
  ),
  case
    when bool_or(coalesce(c.synthesis_status, '') = 'failed') filter (where c.conversation_version = latest.latest_version) then 'failed'
    when bool_or(coalesce(c.synthesis_status, '') = 'completed' and nullif(trim(coalesce(c.summary, '')), '') is not null)
      filter (where c.conversation_version = latest.latest_version) then 'ready'
    else 'pending'
  end,
  case
    when bool_or(coalesce(c.synthesis_status, '') = 'completed' and nullif(trim(coalesce(c.summary, '')), '') is not null)
      filter (where c.conversation_version = latest.latest_version) then latest.latest_version
    else null
  end,
  max(c.synthesized_at) filter (
    where c.conversation_version = latest.latest_version
      and coalesce(c.synthesis_status, '') = 'completed'
      and nullif(trim(coalesce(c.summary, '')), '') is not null
  )
from public.lead_conversations c
join (
  select lead_id, max(conversation_version) as latest_version
  from public.lead_conversations
  where conversation_version is not null
  group by lead_id
) latest on latest.lead_id = c.lead_id
where c.conversation_version is not null
group by c.lead_id, latest.latest_version
on conflict (lead_id) do nothing;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'workflow_runs_status_check'
  ) then
    alter table public.workflow_runs drop constraint workflow_runs_status_check;
  end if;
end $$;

alter table public.workflow_runs
  add constraint workflow_runs_status_check
  check (status in (
    'queued',
    'running',
    'waiting_for_audio_transcript',
    'waiting_for_conversation_insights',
    'awaiting_approval',
    'completed',
    'failed',
    'cancelled'
  ));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'workflow_step_runs_status_check'
  ) then
    alter table public.workflow_step_runs drop constraint workflow_step_runs_status_check;
  end if;
end $$;

alter table public.workflow_step_runs
  add column if not exists waiting_reason text,
  add column if not exists required_conversation_version int,
  add column if not exists current_transcript_version int,
  add column if not exists current_insights_version int,
  add column if not exists wait_started_at timestamptz,
  add column if not exists wait_expires_at timestamptz,
  add constraint workflow_step_runs_status_check
  check (status in (
    'queued',
    'running',
    'waiting_for_audio_transcript',
    'waiting_for_conversation_insights',
    'completed',
    'failed',
    'skipped',
    'awaiting_approval'
  ));

create index if not exists idx_workflow_step_runs_waiting
  on public.workflow_step_runs (wait_expires_at)
  where status in ('waiting_for_audio_transcript', 'waiting_for_conversation_insights');

alter table public.lead_conversation_readiness enable row level security;

drop policy if exists lead_conversation_readiness_select_scope on public.lead_conversation_readiness;
create policy lead_conversation_readiness_select_scope
on public.lead_conversation_readiness
for select
to authenticated
using (
  exists (
    select 1
    from public.leads l
    where l.id = public.lead_conversation_readiness.lead_id
      and public.current_role() in ('exhibitor', 'exhibitor_admin')
      and l.company_id = public.current_company_id()
  )
);

commit;
