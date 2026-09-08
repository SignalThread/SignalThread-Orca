-- One-to-one Gmail follow-up activity. Message content remains transient and is
-- never stored; only provider-safe delivery metadata is retained.

BEGIN;

CREATE TABLE public.google_email_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events (id) ON DELETE SET NULL,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.google_workspace_connections (id) ON DELETE SET NULL,
  acting_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  idempotency_key uuid NOT NULL,
  gmail_message_id text,
  gmail_thread_id text,
  status text NOT NULL DEFAULT 'pending',
  safe_error_category text,
  attempt_started_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_email_activities_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT google_email_activities_status_check CHECK (
    status IN ('pending', 'sent', 'failed', 'unknown')
  ),
  CONSTRAINT google_email_activities_error_category_check CHECK (
    safe_error_category IS NULL OR safe_error_category IN (
      'reconnect_required',
      'provider_rejected',
      'provider_unavailable',
      'persistence_failure',
      'unknown_outcome'
    )
  ),
  CONSTRAINT google_email_activities_recipient_nonempty CHECK (length(btrim(recipient_email)) > 0)
);

CREATE INDEX google_email_activities_lead_recent_idx
  ON public.google_email_activities (company_id, lead_id, created_at DESC);
CREATE INDEX google_email_activities_connection_idx
  ON public.google_email_activities (connection_id)
  WHERE connection_id IS NOT NULL;

CREATE TRIGGER google_email_activities_set_updated_at
BEFORE UPDATE ON public.google_email_activities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.google_email_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.google_email_activities FROM anon, authenticated;

COMMENT ON TABLE public.google_email_activities IS
  'Safe Gmail send metadata for one LR lead; subject, body, MIME, tokens, and provider responses are never stored.';

COMMIT;
