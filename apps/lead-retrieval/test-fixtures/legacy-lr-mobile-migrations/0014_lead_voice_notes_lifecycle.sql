-- Voice note lifecycle: team attribution, idempotent client adoption, transcription completion, insight regen queue.
begin;

-- ---------------------------------------------------------------------------
-- Team attribution + client idempotency + processing timestamps
-- ---------------------------------------------------------------------------
alter table public.lead_voice_notes
  add column if not exists created_by_user_id uuid null references public.users (id) on delete set null;

alter table public.lead_voice_notes
  add column if not exists client_local_note_id text null;

alter table public.lead_voice_notes
  add column if not exists transcription_completed_at timestamptz null;

alter table public.lead_voice_notes
  add column if not exists summary_generated_at timestamptz null;

create unique index if not exists lead_voice_notes_lead_client_local_unique
  on public.lead_voice_notes (lead_id, client_local_note_id)
  where client_local_note_id is not null and deleted_at is null;

create index if not exists lead_voice_notes_created_by_idx
  on public.lead_voice_notes (created_by_user_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Shared helper: queue cumulative insight regeneration (async / eventually consistent)
-- ---------------------------------------------------------------------------
create or replace function public.queue_lead_cumulative_insight_regeneration(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select l.company_id into v_company_id
  from public.leads l
  where l.id = p_lead_id;

  if v_company_id is null then
    return;
  end if;

  insert into public.lead_cumulative_insights (
    lead_id,
    company_id,
    status,
    requested_at,
    updated_at
  )
  values (
    p_lead_id,
    v_company_id,
    'pending',
    now(),
    now()
  )
  on conflict (lead_id) do update
    set status = 'pending',
        requested_at = now(),
        updated_at = now();
end;
$$;

grant execute on function public.queue_lead_cumulative_insight_regeneration(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Upload complete → durable lead_voice_notes (V2 context notes only)
-- Idempotent on (lead_id, client_local_note_id).
-- ---------------------------------------------------------------------------
create or replace function public.adopt_voice_note_from_upload(
  p_lead_id uuid,
  p_created_by_user_id uuid,
  p_conversation_id uuid,
  p_audio_url text,
  p_source text default 'context',
  p_client_local_note_id text default null,
  p_duration_ms integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_event_id uuid;
  v_note_id uuid;
  v_seq integer;
begin
  if p_source is distinct from 'context' and p_source is distinct from 'capture_initial' then
    raise exception 'invalid_source';
  end if;

  select l.company_id, l.event_id
  into v_company_id, v_event_id
  from public.leads l
  where l.id = p_lead_id;

  if v_company_id is null or v_event_id is null then
    raise exception 'lead_not_found';
  end if;

  if p_client_local_note_id is not null and length(trim(p_client_local_note_id)) > 0 then
    select n.id
    into v_note_id
    from public.lead_voice_notes n
    where n.lead_id = p_lead_id
      and n.client_local_note_id = trim(p_client_local_note_id)
      and n.deleted_at is null
    limit 1;

    if v_note_id is not null then
      update public.lead_voice_notes
      set conversation_id = coalesce(p_conversation_id, conversation_id),
          audio_url = coalesce(nullif(trim(p_audio_url), ''), audio_url),
          duration_ms = coalesce(p_duration_ms, duration_ms),
          created_by_user_id = coalesce(p_created_by_user_id, created_by_user_id),
          updated_at = now()
      where id = v_note_id;
      return v_note_id;
    end if;
  end if;

  select coalesce(max(n.sequence_index), -1) + 1
  into v_seq
  from public.lead_voice_notes n
  where n.lead_id = p_lead_id
    and n.deleted_at is null;

  insert into public.lead_voice_notes (
    lead_id,
    company_id,
    event_id,
    conversation_id,
    source,
    sequence_index,
    created_by_user_id,
    client_local_note_id,
    audio_url,
    duration_ms,
    transcription_status,
    synthesis_status,
    recorded_at,
    created_at,
    updated_at
  )
  values (
    p_lead_id,
    v_company_id,
    v_event_id,
    p_conversation_id,
    p_source,
    v_seq,
    p_created_by_user_id,
    nullif(trim(p_client_local_note_id), ''),
    nullif(trim(p_audio_url), ''),
    p_duration_ms,
    'pending',
    'pending',
    now(),
    now(),
    now()
  )
  returning id into v_note_id;

  perform public.queue_lead_cumulative_insight_regeneration(p_lead_id);

  return v_note_id;
end;
$$;

grant execute on function public.adopt_voice_note_from_upload(uuid, uuid, uuid, text, text, text, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transcription worker / conversation sync → voice note row
-- Does NOT load all notes; updates one row by id or conversation link.
-- ---------------------------------------------------------------------------
create or replace function public.complete_voice_note_transcription(
  p_voice_note_id uuid,
  p_transcript text,
  p_summary text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_summary text;
begin
  v_summary := nullif(trim(coalesce(p_summary, '')), '');

  update public.lead_voice_notes n
  set transcript = nullif(trim(coalesce(p_transcript, '')), ''),
      summary = coalesce(v_summary, summary),
      transcription_status = 'completed',
      synthesis_status = case when v_summary is not null then 'completed' else synthesis_status end,
      transcription_completed_at = now(),
      summary_generated_at = case when v_summary is not null then now() else summary_generated_at end,
      updated_at = now()
  where n.id = p_voice_note_id
    and n.deleted_at is null
  returning n.lead_id into v_lead_id;

  if v_lead_id is not null then
    perform public.queue_lead_cumulative_insight_regeneration(v_lead_id);
  end if;
end;
$$;

grant execute on function public.complete_voice_note_transcription(uuid, text, text)
  to authenticated, service_role;

-- Link conversation transcript → voice note(s) by conversation_id (Admin pipeline hook).
create or replace function public.sync_voice_notes_from_conversation(
  p_conversation_id uuid,
  p_transcript text,
  p_transcription_status text default 'completed',
  p_note_summary text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_lead_id uuid;
begin
  update public.lead_voice_notes n
  set transcript = nullif(trim(coalesce(p_transcript, '')), ''),
      transcription_status = coalesce(nullif(trim(p_transcription_status), ''), 'completed'),
      summary = coalesce(nullif(trim(coalesce(p_note_summary, '')), ''), n.summary),
      synthesis_status = case
        when nullif(trim(coalesce(p_note_summary, '')), '') is not null then 'completed'
        else n.synthesis_status
      end,
      transcription_completed_at = case
        when coalesce(nullif(trim(p_transcription_status), ''), 'completed') = 'completed' then now()
        else n.transcription_completed_at
      end,
      summary_generated_at = case
        when nullif(trim(coalesce(p_note_summary, '')), '') is not null then now()
        else n.summary_generated_at
      end,
      updated_at = now()
  where n.conversation_id = p_conversation_id
    and n.deleted_at is null;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    select n.lead_id into v_lead_id
    from public.lead_voice_notes n
    where n.conversation_id = p_conversation_id
      and n.deleted_at is null
    limit 1;

    if v_lead_id is not null then
      perform public.queue_lead_cumulative_insight_regeneration(v_lead_id);
    end if;
  end if;

  return v_count;
end;
$$;

grant execute on function public.sync_voice_notes_from_conversation(uuid, text, text, text)
  to authenticated, service_role;

-- Replace delete trigger to use shared queue helper
create or replace function public.queue_lead_insight_regeneration_on_voice_note_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.queue_lead_cumulative_insight_regeneration(new.lead_id);
  end if;
  return new;
end;
$$;

commit;
