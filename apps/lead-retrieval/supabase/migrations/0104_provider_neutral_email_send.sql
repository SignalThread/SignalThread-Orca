-- Canonical user/company-scoped email provider preference and provider-neutral
-- one-to-one email activity ledger. Existing Google history is preserved in
-- place while the table and columns become safe for Microsoft Graph sends.

BEGIN;

CREATE TABLE public.integration_provider_preferences (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  capability text NOT NULL,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_provider_preferences_pkey
    PRIMARY KEY (user_id, company_id, capability),
  CONSTRAINT integration_provider_preferences_capability_check
    CHECK (capability IN ('email_send')),
  CONSTRAINT integration_provider_preferences_provider_check
    CHECK (provider IN ('google_workspace', 'microsoft_365'))
);

CREATE INDEX integration_provider_preferences_company_idx
  ON public.integration_provider_preferences (company_id, capability);

CREATE TRIGGER integration_provider_preferences_set_updated_at
BEFORE UPDATE ON public.integration_provider_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.integration_provider_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integration_provider_preferences FROM anon, authenticated;

COMMENT ON TABLE public.integration_provider_preferences IS
  'Server-managed user/company capability preferences; never a browser authority for tenant scope.';

ALTER TABLE public.google_email_activities RENAME TO email_activities;
ALTER TABLE public.email_activities RENAME COLUMN connection_id TO google_connection_id;
ALTER TABLE public.email_activities RENAME COLUMN gmail_message_id TO provider_message_id;
ALTER TABLE public.email_activities RENAME COLUMN gmail_thread_id TO provider_thread_id;

ALTER TABLE public.email_activities
  ADD COLUMN provider text NOT NULL DEFAULT 'google_workspace',
  ADD COLUMN microsoft_connection_id uuid
    REFERENCES public.microsoft_365_connections (id) ON DELETE SET NULL,
  ADD COLUMN provider_http_status integer,
  ADD COLUMN retry_after_seconds integer,
  ADD CONSTRAINT email_activities_provider_check
    CHECK (provider IN ('google_workspace', 'microsoft_365')),
  ADD CONSTRAINT email_activities_provider_connection_check
    CHECK (
      (provider = 'google_workspace' AND microsoft_connection_id IS NULL)
      OR
      (provider = 'microsoft_365' AND google_connection_id IS NULL)
    ),
  ADD CONSTRAINT email_activities_provider_http_status_check
    CHECK (provider_http_status IS NULL OR provider_http_status BETWEEN 100 AND 599),
  ADD CONSTRAINT email_activities_retry_after_check
    CHECK (retry_after_seconds IS NULL OR retry_after_seconds BETWEEN 0 AND 86400);

ALTER TABLE public.email_activities
  DROP CONSTRAINT google_email_activities_error_category_check;
ALTER TABLE public.email_activities
  ADD CONSTRAINT email_activities_error_category_check CHECK (
    safe_error_category IS NULL OR safe_error_category IN (
      'reconnect_required',
      'provider_rejected',
      'provider_unauthorized',
      'provider_permission_denied',
      'provider_throttled',
      'provider_unavailable',
      'persistence_failure',
      'unknown_outcome'
    )
  );

ALTER INDEX public.google_email_activities_lead_recent_idx
  RENAME TO email_activities_lead_recent_idx;
ALTER INDEX public.google_email_activities_connection_idx
  RENAME TO email_activities_google_connection_idx;
ALTER INDEX public.google_email_activities_document_idx
  RENAME TO email_activities_document_idx;

CREATE INDEX email_activities_microsoft_connection_idx
  ON public.email_activities (microsoft_connection_id)
  WHERE microsoft_connection_id IS NOT NULL;

-- Rolling-deployment compatibility for an older application instance. This is
-- an automatically updatable, security-invoker projection of Google rows; it
-- is not a second activity authority.
CREATE VIEW public.google_email_activities
WITH (security_invoker = true)
AS
SELECT
  id,
  company_id,
  event_id,
  lead_id,
  document_id,
  google_connection_id AS connection_id,
  acting_user_id,
  recipient_email,
  idempotency_key,
  provider_message_id AS gmail_message_id,
  provider_thread_id AS gmail_thread_id,
  status,
  safe_error_category,
  attempt_started_at,
  sent_at,
  failed_at,
  created_at,
  updated_at
FROM public.email_activities
WHERE provider = 'google_workspace'
WITH LOCAL CHECK OPTION;

REVOKE ALL ON TABLE public.google_email_activities FROM anon, authenticated;
COMMENT ON VIEW public.google_email_activities IS
  'Rolling-deployment compatibility view over canonical email_activities Google rows.';

COMMENT ON TABLE public.email_activities IS
  'Canonical safe one-to-one email send metadata. Content, credentials, and raw provider responses are never stored.';

COMMIT;
