-- Company-scoped Pipedrive delivery configuration.
--
-- This stores future Phase 2 behavior only; OAuth credentials remain in
-- integration_connection_secrets and are never copied into this table.
--
-- Safe against existing environments: creation, trigger, and grants are all
-- idempotent, and nothing here drops or rewrites existing data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pipedrive_integration_settings (
  -- One settings record per company: the FK column is the primary key.
  company_id uuid PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pipedrive' CHECK (provider = 'pipedrive'),
  destination_type text NOT NULL DEFAULT 'lead' CHECK (destination_type IN ('lead', 'deal')),
  create_person boolean NOT NULL DEFAULT true,
  create_organization boolean NOT NULL DEFAULT true,
  pipeline_id text,
  stage_id text,
  owner_mode text NOT NULL DEFAULT 'connected_user' CHECK (owner_mode IN ('connected_user', 'selected_user')),
  owner_user_id text,
  create_follow_up_activity boolean NOT NULL DEFAULT true,
  match_person_by_email boolean NOT NULL DEFAULT true,
  match_organization_by_name_or_domain boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipedrive_integration_settings_deal_destination_check CHECK (
    (destination_type = 'lead' AND pipeline_id IS NULL AND stage_id IS NULL)
    OR (destination_type = 'deal' AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL)
  ),
  -- Named distinctly from the column-level owner_mode CHECK, which Postgres
  -- auto-names `pipedrive_integration_settings_owner_mode_check`.
  CONSTRAINT pipedrive_integration_settings_owner_selection_check CHECK (
    (owner_mode = 'connected_user' AND owner_user_id IS NULL)
    OR (owner_mode = 'selected_user' AND owner_user_id IS NOT NULL)
  )
);

DROP TRIGGER IF EXISTS pipedrive_integration_settings_set_updated_at
  ON public.pipedrive_integration_settings;

CREATE TRIGGER pipedrive_integration_settings_set_updated_at
BEFORE UPDATE ON public.pipedrive_integration_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pipedrive_integration_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pipedrive_integration_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pipedrive_integration_settings TO service_role;

COMMENT ON TABLE public.pipedrive_integration_settings IS
  'Company-scoped Pipedrive lead delivery settings. OAuth credentials remain in integration_connection_secrets.';

COMMIT;
