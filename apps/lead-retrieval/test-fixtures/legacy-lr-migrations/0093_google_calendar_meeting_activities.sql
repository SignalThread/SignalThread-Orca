-- Google one-to-one document context and Calendar meeting activity metadata.
-- Message bodies, MIME, tokens, raw provider responses, and free/busy results
-- remain transient and are never persisted.

BEGIN;

ALTER TABLE public.google_email_activities
  ADD COLUMN document_id uuid REFERENCES public.documents (id) ON DELETE SET NULL;

ALTER TABLE public.document_sends
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');

CREATE INDEX google_email_activities_document_idx
  ON public.google_email_activities (document_id)
  WHERE document_id IS NOT NULL;

CREATE TABLE public.google_calendar_meeting_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events (id) ON DELETE SET NULL,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.google_workspace_connections (id) ON DELETE SET NULL,
  acting_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  attendee_email text NOT NULL,
  idempotency_key uuid NOT NULL,
  provider_calendar_id text NOT NULL DEFAULT 'primary',
  google_event_id text NOT NULL,
  conference_request_id text,
  google_meet_uri text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_operation text NOT NULL DEFAULT 'create',
  last_operation_status text NOT NULL DEFAULT 'pending',
  last_operation_key uuid NOT NULL,
  safe_error_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT google_calendar_meeting_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT google_calendar_meeting_provider_unique UNIQUE (connection_id, google_event_id),
  CONSTRAINT google_calendar_meeting_time_check CHECK (ends_at > starts_at),
  CONSTRAINT google_calendar_meeting_attendee_nonempty CHECK (length(btrim(attendee_email)) > 0),
  CONSTRAINT google_calendar_meeting_timezone_nonempty CHECK (length(btrim(timezone)) > 0),
  CONSTRAINT google_calendar_meeting_status_check CHECK (
    status IN ('pending', 'scheduled', 'cancelled', 'unknown')
  ),
  CONSTRAINT google_calendar_meeting_operation_check CHECK (
    last_operation IN ('create', 'update', 'cancel')
  ),
  CONSTRAINT google_calendar_meeting_operation_status_check CHECK (
    last_operation_status IN ('pending', 'succeeded', 'failed', 'unknown')
  ),
  CONSTRAINT google_calendar_meeting_error_category_check CHECK (
    safe_error_category IS NULL OR safe_error_category IN (
      'reconnect_required',
      'provider_rejected',
      'provider_unavailable',
      'persistence_failure',
      'unknown_outcome'
    )
  )
);

CREATE INDEX google_calendar_meeting_lead_recent_idx
  ON public.google_calendar_meeting_activities (company_id, lead_id, created_at DESC);
CREATE INDEX google_calendar_meeting_connection_idx
  ON public.google_calendar_meeting_activities (connection_id)
  WHERE connection_id IS NOT NULL;

CREATE TRIGGER google_calendar_meeting_activities_set_updated_at
BEFORE UPDATE ON public.google_calendar_meeting_activities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.google_calendar_meeting_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.google_calendar_meeting_activities FROM anon, authenticated;

COMMENT ON TABLE public.google_calendar_meeting_activities IS
  'Safe one-to-one Google Calendar activity metadata. Free/busy results and event descriptions are never stored.';

COMMIT;
