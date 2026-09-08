begin;

alter table public.lead_conversations
  add column if not exists transcript text,
  add column if not exists transcription_status text,
  add column if not exists transcription_error text,
  add column if not exists transcribed_at timestamptz,
  add column if not exists conversation_version int,
  add column if not exists summary text,
  add column if not exists sentiment text,
  add column if not exists objections text[],
  add column if not exists next_steps text[],
  add column if not exists synthesis_status text,
  add column if not exists synthesis_error text,
  add column if not exists synthesized_at timestamptz;

alter table public.lead_conversations
  add column if not exists problem_severity text,
  add column if not exists buying_intent text,
  add column if not exists competitors_mentioned text[],
  add column if not exists pain_points text[],
  add column if not exists feature_requests text[],
  add column if not exists buying_signals text[],
  add column if not exists operational_pains text[],
  add column if not exists workflow_constraints text[],
  add column if not exists technical_constraints text[],
  add column if not exists desired_outcomes text[],
  add column if not exists adoption_risks text[],
  add column if not exists management_visibility_needs text[],
  add column if not exists business_process_concerns text[],
  add column if not exists product_objections text[],
  add column if not exists rep_behavior_patterns text[],
  add column if not exists priority_themes text[];

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'lead_conversations_transcription_status_check'
  ) then
    alter table public.lead_conversations
      drop constraint lead_conversations_transcription_status_check;
  end if;
end $$;

alter table public.lead_conversations
  add constraint lead_conversations_transcription_status_check
  check (
    transcription_status is null
    or transcription_status in ('pending', 'processing', 'completed', 'failed')
  );

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'lead_conversations_synthesis_status_check'
  ) then
    alter table public.lead_conversations
      drop constraint lead_conversations_synthesis_status_check;
  end if;
end $$;

alter table public.lead_conversations
  add constraint lead_conversations_synthesis_status_check
  check (
    synthesis_status is null
    or synthesis_status in ('pending', 'processing', 'completed', 'failed')
  );

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

drop trigger if exists lead_conversation_readiness_set_updated_at
on public.lead_conversation_readiness;

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
  max(c.created_at) filter (where c.conversation_version = latest.latest_version),
  case
    when bool_or(coalesce(c.transcription_status, '') = 'failed')
      filter (where c.conversation_version = latest.latest_version) then 'failed'
    when bool_or(coalesce(c.transcription_status, '') = 'completed' and nullif(trim(coalesce(c.transcript, '')), '') is not null)
      filter (where c.conversation_version = latest.latest_version) then 'ready'
    when bool_or(coalesce(c.transcription_status, '') in ('pending', 'processing'))
      filter (where c.conversation_version = latest.latest_version) then 'processing'
    else 'pending'
  end,
  case
    when bool_or(coalesce(c.transcription_status, '') = 'completed' and nullif(trim(coalesce(c.transcript, '')), '') is not null)
      filter (where c.conversation_version = latest.latest_version) then latest.latest_version
    else null
  end,
  max(c.transcribed_at) filter (
    where c.conversation_version = latest.latest_version
      and coalesce(c.transcription_status, '') = 'completed'
      and nullif(trim(coalesce(c.transcript, '')), '') is not null
  ),
  case
    when bool_or(coalesce(c.synthesis_status, '') = 'failed')
      filter (where c.conversation_version = latest.latest_version) then 'failed'
    when bool_or(coalesce(c.synthesis_status, '') = 'completed' and nullif(trim(coalesce(c.summary, '')), '') is not null)
      filter (where c.conversation_version = latest.latest_version) then 'ready'
    when bool_or(coalesce(c.transcription_status, '') in ('pending', 'processing'))
      filter (where c.conversation_version = latest.latest_version) then 'pending'
    else 'processing'
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
on conflict (lead_id) do update
  set latest_conversation_version = excluded.latest_conversation_version,
      latest_audio_finalized_at = excluded.latest_audio_finalized_at,
      transcript_status = excluded.transcript_status,
      transcript_version = excluded.transcript_version,
      transcript_ready_at = excluded.transcript_ready_at,
      insights_status = excluded.insights_status,
      insights_version = excluded.insights_version,
      insights_ready_at = excluded.insights_ready_at,
      updated_at = now();

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

alter table public.workflow_step_runs
  add column if not exists waiting_reason text,
  add column if not exists required_conversation_version int,
  add column if not exists current_transcript_version int,
  add column if not exists current_insights_version int,
  add column if not exists wait_started_at timestamptz,
  add column if not exists wait_expires_at timestamptz;

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
