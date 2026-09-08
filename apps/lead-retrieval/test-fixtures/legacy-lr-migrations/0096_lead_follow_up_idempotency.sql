BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_calendar_provider text NULL,
  ADD COLUMN IF NOT EXISTS follow_up_calendar_owner_user_id uuid NULL REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_last_operation_key uuid NULL,
  ADD COLUMN IF NOT EXISTS follow_up_last_operation_fingerprint text NULL,
  ADD COLUMN IF NOT EXISTS follow_up_last_operation_result jsonb NULL;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_follow_up_calendar_provider_check
  CHECK (follow_up_calendar_provider IS NULL OR follow_up_calendar_provider IN ('google_workspace'));

CREATE INDEX IF NOT EXISTS leads_follow_up_calendar_owner_idx
  ON public.leads (follow_up_calendar_owner_user_id)
  WHERE follow_up_calendar_event_id IS NOT NULL;

COMMENT ON COLUMN public.leads.follow_up_last_operation_key IS
  'Most recent canonical follow-up command key used for mobile retry protection.';
COMMENT ON COLUMN public.leads.follow_up_last_operation_result IS
  'Safe provider-neutral result for replaying the most recent completed follow-up command.';

COMMIT;
