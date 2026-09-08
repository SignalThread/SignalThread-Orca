alter table public.lead_conversations
  add column if not exists transcript text,
  add column if not exists transcription_status text,
  add column if not exists transcription_error text,
  add column if not exists transcribed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_conversations_transcription_status_check'
  ) then
    alter table public.lead_conversations
      add constraint lead_conversations_transcription_status_check
      check (
        transcription_status is null
        or transcription_status in ('pending', 'completed', 'failed')
      );
  end if;
end $$;
