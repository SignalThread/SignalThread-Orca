-- User-owned Google Workspace OAuth foundation.
-- Credentials are encrypted by the application before reaching Postgres and are
-- isolated from browser-readable connection metadata.

BEGIN;

CREATE TABLE public.google_workspace_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  google_subject text NOT NULL,
  google_email text NOT NULL,
  google_display_name text,
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
  CONSTRAINT google_workspace_connections_user_unique UNIQUE (user_id),
  CONSTRAINT google_workspace_connections_subject_unique UNIQUE (google_subject),
  CONSTRAINT google_workspace_connections_status_check CHECK (
    status IN ('connected', 'reconnect_required', 'error', 'revocation_pending')
  ),
  CONSTRAINT google_workspace_connections_scopes_check CHECK (
    granted_scopes <@ ARRAY[
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.events.owned',
      'https://www.googleapis.com/auth/calendar.events.freebusy'
    ]::text[]
  )
);

CREATE TABLE public.google_workspace_connection_secrets (
  connection_id uuid PRIMARY KEY REFERENCES public.google_workspace_connections (id) ON DELETE CASCADE,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  encryption_key_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.google_oauth_state_nonces (
  jti_digest text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  code_verifier_digest text NOT NULL,
  return_to text NOT NULL DEFAULT '/exhibitor/integrations/google-workspace',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX google_workspace_connections_company_id_idx
  ON public.google_workspace_connections (company_id);
CREATE INDEX google_workspace_connections_refresh_lease_idx
  ON public.google_workspace_connections (refresh_lease_until)
  WHERE refresh_lease_until IS NOT NULL;
CREATE INDEX google_oauth_state_nonces_expiry_idx
  ON public.google_oauth_state_nonces (expires_at)
  WHERE consumed_at IS NULL;

CREATE TRIGGER google_workspace_connections_set_updated_at
BEFORE UPDATE ON public.google_workspace_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER google_workspace_connection_secrets_set_updated_at
BEFORE UPDATE ON public.google_workspace_connection_secrets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.google_workspace_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_workspace_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_oauth_state_nonces ENABLE ROW LEVEL SECURITY;

-- All access is intentionally mediated by authenticated server routes using the
-- service-role client after explicit user/company permission checks.
REVOKE ALL ON TABLE public.google_workspace_connections FROM anon, authenticated;
REVOKE ALL ON TABLE public.google_workspace_connection_secrets FROM anon, authenticated;
REVOKE ALL ON TABLE public.google_oauth_state_nonces FROM anon, authenticated;

COMMENT ON TABLE public.google_workspace_connections IS
  'Safe metadata for a Google Workspace OAuth connection owned by one public.users row.';
COMMENT ON TABLE public.google_workspace_connection_secrets IS
  'Application-encrypted Google OAuth credentials; service-role access only.';
COMMENT ON TABLE public.google_oauth_state_nonces IS
  'Single-use server records for signed Google OAuth state and PKCE binding.';

COMMIT;
