BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS follow_up_note text NULL,
  ADD COLUMN IF NOT EXISTS follow_up_completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS follow_up_calendar_event_id text NULL;

CREATE INDEX IF NOT EXISTS leads_follow_up_at_idx
  ON public.leads (company_id, follow_up_at)
  WHERE follow_up_at IS NOT NULL AND follow_up_completed_at IS NULL;

COMMIT;
