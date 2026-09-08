-- Provider-neutral calendar claims plus Microsoft meeting activity metadata.
-- Tokens, raw Graph responses, event bodies, and availability results remain transient.

BEGIN;

CREATE TABLE public.calendar_meeting_provider_claims (
  idempotency_key uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  acting_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_meeting_provider_claim_provider_check CHECK (
    provider IN ('google_workspace', 'microsoft_365')
  )
);

-- Preserve provider pinning for meetings created through the existing Google
-- route before this migration. Rows without an acting user cannot be retried
-- through the authenticated canonical flow and are intentionally skipped.
INSERT INTO public.calendar_meeting_provider_claims (
  idempotency_key,
  company_id,
  lead_id,
  acting_user_id,
  provider
)
SELECT
  idempotency_key,
  company_id,
  lead_id,
  acting_user_id,
  'google_workspace'
FROM public.google_calendar_meeting_activities
WHERE acting_user_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE TABLE public.microsoft_calendar_meeting_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events (id) ON DELETE SET NULL,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.microsoft_365_connections (id) ON DELETE SET NULL,
  acting_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  attendee_email text NOT NULL,
  idempotency_key uuid NOT NULL,
  provider_event_id text,
  join_url text,
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
  CONSTRAINT microsoft_calendar_meeting_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT microsoft_calendar_meeting_provider_unique UNIQUE (connection_id, provider_event_id),
  CONSTRAINT microsoft_calendar_meeting_time_check CHECK (ends_at > starts_at),
  CONSTRAINT microsoft_calendar_meeting_attendee_nonempty CHECK (length(btrim(attendee_email)) > 0),
  CONSTRAINT microsoft_calendar_meeting_timezone_nonempty CHECK (length(btrim(timezone)) > 0),
  CONSTRAINT microsoft_calendar_meeting_status_check CHECK (
    status IN ('pending', 'scheduled', 'cancelled', 'unknown')
  ),
  CONSTRAINT microsoft_calendar_meeting_operation_check CHECK (
    last_operation IN ('create', 'update', 'cancel')
  ),
  CONSTRAINT microsoft_calendar_meeting_operation_status_check CHECK (
    last_operation_status IN ('pending', 'succeeded', 'failed', 'unknown')
  ),
  CONSTRAINT microsoft_calendar_meeting_error_category_check CHECK (
    safe_error_category IS NULL OR safe_error_category IN (
      'reconnect_required',
      'permission_required',
      'provider_throttled',
      'provider_rejected',
      'provider_unavailable',
      'persistence_failure',
      'unknown_outcome'
    )
  )
);

CREATE INDEX calendar_meeting_provider_claim_scope_idx
  ON public.calendar_meeting_provider_claims (company_id, lead_id, acting_user_id);
CREATE INDEX microsoft_calendar_meeting_lead_recent_idx
  ON public.microsoft_calendar_meeting_activities (company_id, lead_id, created_at DESC);
CREATE INDEX microsoft_calendar_meeting_connection_idx
  ON public.microsoft_calendar_meeting_activities (connection_id)
  WHERE connection_id IS NOT NULL;

CREATE TRIGGER microsoft_calendar_meeting_activities_set_updated_at
BEFORE UPDATE ON public.microsoft_calendar_meeting_activities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.calendar_meeting_provider_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microsoft_calendar_meeting_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.calendar_meeting_provider_claims FROM anon, authenticated;
REVOKE ALL ON TABLE public.microsoft_calendar_meeting_activities FROM anon, authenticated;

COMMENT ON TABLE public.calendar_meeting_provider_claims IS
  'Pins a canonical meeting idempotency key to one scoped provider before external side effects.';
COMMENT ON TABLE public.microsoft_calendar_meeting_activities IS
  'Safe Microsoft calendar meeting metadata. Tokens, event bodies, and raw Graph responses are never stored.';

COMMIT;
