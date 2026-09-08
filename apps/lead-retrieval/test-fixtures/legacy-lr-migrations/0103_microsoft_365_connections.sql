-- User-owned Microsoft 365 (Outlook) OAuth foundation.
--
-- Mirrors the Google Workspace connection tables so both providers share one
-- lifecycle model: browser-safe metadata separated from application-encrypted
-- credentials, plus single-use signed-state nonces bound to user and company.

BEGIN;

CREATE TABLE public.microsoft_365_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  microsoft_subject text NOT NULL,
  microsoft_email text NOT NULL,
  microsoft_display_name text,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  token_type text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_refresh_at timestamptz,
  last_refresh_attempt_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  refresh_lease_token uuid,
  refresh_lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT microsoft_365_connections_user_unique UNIQUE (user_id),
  CONSTRAINT microsoft_365_connections_subject_unique UNIQUE (microsoft_subject),
  CONSTRAINT microsoft_365_connections_status_check CHECK (
    status IN ('connected', 'reconnect_required', 'error', 'revocation_pending')
  ),
  CONSTRAINT microsoft_365_connections_scopes_check CHECK (
    granted_scopes <@ ARRAY[
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Mail.Send',
      'Calendars.ReadWrite'
    ]::text[]
  )
);

CREATE TABLE public.microsoft_365_connection_secrets (
  connection_id uuid PRIMARY KEY REFERENCES public.microsoft_365_connections (id) ON DELETE CASCADE,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  encryption_key_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.microsoft_oauth_state_nonces (
  jti_digest text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  code_verifier_digest text NOT NULL,
  return_to text NOT NULL DEFAULT '/exhibitor/integrations/microsoft-365',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX microsoft_365_connections_company_id_idx
  ON public.microsoft_365_connections (company_id);
CREATE INDEX microsoft_365_connections_refresh_lease_idx
  ON public.microsoft_365_connections (refresh_lease_until)
  WHERE refresh_lease_until IS NOT NULL;
CREATE INDEX microsoft_oauth_state_nonces_expiry_idx
  ON public.microsoft_oauth_state_nonces (expires_at)
  WHERE consumed_at IS NULL;

CREATE TRIGGER microsoft_365_connections_set_updated_at
BEFORE UPDATE ON public.microsoft_365_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER microsoft_365_connection_secrets_set_updated_at
BEFORE UPDATE ON public.microsoft_365_connection_secrets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.microsoft_365_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microsoft_365_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microsoft_oauth_state_nonces ENABLE ROW LEVEL SECURITY;

-- All access is intentionally mediated by authenticated server routes using the
-- service-role client after explicit user/company permission checks.
REVOKE ALL ON TABLE public.microsoft_365_connections FROM anon, authenticated;
REVOKE ALL ON TABLE public.microsoft_365_connection_secrets FROM anon, authenticated;
REVOKE ALL ON TABLE public.microsoft_oauth_state_nonces FROM anon, authenticated;

COMMENT ON TABLE public.microsoft_365_connections IS
  'Safe metadata for a Microsoft 365 OAuth connection owned by one public.users row.';
COMMENT ON TABLE public.microsoft_365_connection_secrets IS
  'Application-encrypted Microsoft OAuth credentials; service-role access only.';
COMMENT ON TABLE public.microsoft_oauth_state_nonces IS
  'Single-use server records for signed Microsoft OAuth state and PKCE binding.';

-- The provider-neutral mobile launch ticket table now carries Microsoft too.
ALTER TABLE public.mobile_oauth_launch_tickets
  DROP CONSTRAINT IF EXISTS mobile_oauth_launch_tickets_provider_check;
ALTER TABLE public.mobile_oauth_launch_tickets
  ADD CONSTRAINT mobile_oauth_launch_tickets_provider_check
  CHECK (provider IN ('google_workspace', 'microsoft_365'));

COMMIT;
