-- Finite events vs Continuous Capture lead buckets share `events.id` (stable FK on leads.event_id).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS container_kind text NOT NULL DEFAULT 'event';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_container_kind_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_container_kind_check
  CHECK (container_kind IN ('event', 'continuous_capture'));

-- Align with exhibitor self-serve flows that omit dates for draft-like rows.
ALTER TABLE public.events ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE public.events ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_continuous_capture_dates_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_continuous_capture_dates_check
  CHECK (
    container_kind <> 'continuous_capture'
    OR (start_date IS NULL AND end_date IS NULL)
  );

COMMENT ON COLUMN public.events.container_kind IS
  'event = dated finite event; continuous_capture = persistent company lead bucket (always-on capture).';
