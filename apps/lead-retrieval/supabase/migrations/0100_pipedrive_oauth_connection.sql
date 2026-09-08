-- Company-scoped Pipedrive OAuth foundation.
--
-- `integrations` remains the canonical provider/account metadata row. OAuth
-- credentials are encrypted by the application and isolated in a
-- service-role-only companion table; raw OAuth state is never persisted.

BEGIN;

ALTER TABLE public.integrations
  ALTER COLUMN access_token DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS provider_user_id text,
  ADD COLUMN IF NOT EXISTS provider_account_name text,
  ADD COLUMN IF NOT EXISTS provider_api_domain text,
  ADD COLUMN IF NOT EXISTS connected_by_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS token_type text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS refresh_lease_token uuid,
  ADD COLUMN IF NOT EXISTS refresh_lease_until timestamptz;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_oauth_status_check CHECK (
    status IS NULL OR status IN ('connected', 'error', 'reconnect_required', 'revocation_pending')
  );

-- Existing providers retain their legacy storage contract. New Pipedrive rows
-- are forbidden from placing credentials in those browser-era columns.
ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_pipedrive_no_plaintext_tokens_check CHECK (
    provider <> 'pipedrive' OR (access_token IS NULL AND refresh_token IS NULL)
  ) NOT VALID;

CREATE TABLE public.integration_connection_secrets (
  connection_id uuid PRIMARY KEY REFERENCES public.integrations (id) ON DELETE CASCADE,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  encryption_key_version text NOT NULL,
  credential_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.integration_oauth_states (
  state_digest text PRIMARY KEY,
  provider text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  return_to text NOT NULL DEFAULT '/exhibitor/integrations',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX integration_oauth_states_expiry_idx
  ON public.integration_oauth_states (expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX integrations_refresh_lease_idx
  ON public.integrations (refresh_lease_until)
  WHERE refresh_lease_until IS NOT NULL;

CREATE TRIGGER integration_connection_secrets_set_updated_at
BEFORE UPDATE ON public.integration_connection_secrets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.persist_integration_oauth_refresh(
  p_connection_id uuid,
  p_provider text,
  p_lease_token uuid,
  p_expected_credential_version bigint,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text,
  p_encryption_key_version text,
  p_expires_at timestamptz,
  p_scope text[],
  p_provider_api_domain text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.integration_connection_secrets
  SET access_token_encrypted = p_access_token_encrypted,
      refresh_token_encrypted = p_refresh_token_encrypted,
      encryption_key_version = p_encryption_key_version,
      credential_version = credential_version + 1
  WHERE connection_id = p_connection_id
    AND credential_version = p_expected_credential_version;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.integrations
  SET expires_at = p_expires_at,
      scope = p_scope,
      provider_api_domain = p_provider_api_domain,
      status = 'connected',
      last_refresh_attempt_at = now(),
      last_error_at = NULL,
      last_error_code = NULL,
      last_sync_error = NULL,
      refresh_lease_token = NULL,
      refresh_lease_until = NULL
  WHERE id = p_connection_id
    AND provider = p_provider
    AND refresh_lease_token = p_lease_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OAuth refresh lease is no longer current.';
  END IF;

  RETURN true;
END;
$$;

ALTER TABLE public.integration_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;

-- All OAuth state and credential access is mediated by authenticated server
-- routes after canonical user/company authorization.
REVOKE ALL ON TABLE public.integration_connection_secrets FROM anon, authenticated;
REVOKE ALL ON TABLE public.integration_oauth_states FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.integration_connection_secrets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.integration_oauth_states TO service_role;
REVOKE ALL ON FUNCTION public.persist_integration_oauth_refresh(
  uuid, text, uuid, bigint, text, text, text, timestamptz, text[], text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_integration_oauth_refresh(
  uuid, text, uuid, bigint, text, text, text, timestamptz, text[], text
) TO service_role;

COMMENT ON TABLE public.integration_connection_secrets IS
  'Application-encrypted OAuth credentials for provider-agnostic integration rows; service-role access only.';
COMMENT ON TABLE public.integration_oauth_states IS
  'Single-use digest-only OAuth state records bound to an LR user and company.';

COMMIT;
