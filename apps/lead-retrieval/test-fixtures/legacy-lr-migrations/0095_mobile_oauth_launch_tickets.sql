BEGIN;

CREATE TABLE public.mobile_oauth_launch_tickets (
  ticket_digest text PRIMARY KEY,
  provider text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  correlation text NOT NULL,
  force_reconnect boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_oauth_launch_tickets_provider_check CHECK (provider IN ('google_workspace')),
  CONSTRAINT mobile_oauth_launch_tickets_correlation_check CHECK (
    correlation ~ '^[A-Za-z0-9_-]{16,128}$'
  )
);

CREATE INDEX mobile_oauth_launch_tickets_expiry_idx
  ON public.mobile_oauth_launch_tickets (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.mobile_oauth_launch_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mobile_oauth_launch_tickets FROM anon, authenticated;

COMMENT ON TABLE public.mobile_oauth_launch_tickets IS
  'Short-lived single-use bearer-to-browser handoff tickets for provider-neutral mobile OAuth.';

COMMIT;
