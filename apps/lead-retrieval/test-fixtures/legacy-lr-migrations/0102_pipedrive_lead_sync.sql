-- Phase 2 Pipedrive delivery: note-content settings + the canonical per-lead
-- sync/mapping table that makes retries idempotent.
--
-- Safe against existing environments: every statement is additive/idempotent
-- and nothing here drops or rewrites existing data.

BEGIN;

ALTER TABLE public.pipedrive_integration_settings
  ADD COLUMN IF NOT EXISTS send_conversation_synopsis boolean NOT NULL DEFAULT true;

ALTER TABLE public.pipedrive_integration_settings
  ADD COLUMN IF NOT EXISTS send_generated_email_draft boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.pipedrive_lead_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'syncing', 'synced', 'failed')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'bulk', 'test', 'auto')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz,
  requested_by_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  pipedrive_person_id text,
  person_action text CHECK (person_action IN ('created', 'matched', 'reused', 'skipped')),
  pipedrive_organization_id text,
  organization_action text CHECK (organization_action IN ('created', 'matched', 'reused', 'skipped')),
  destination_kind text CHECK (destination_kind IN ('lead', 'deal')),
  pipedrive_destination_id text,
  destination_action text CHECK (destination_action IN ('created', 'reused', 'skipped')),
  synopsis_note_id text,
  synopsis_note_action text CHECK (synopsis_note_action IN ('created', 'reused', 'skipped')),
  email_draft_note_id text,
  email_draft_note_action text CHECK (email_draft_note_action IN ('created', 'reused', 'skipped')),
  activity_id text,
  activity_action text CHECK (activity_action IN ('created', 'reused', 'skipped')),
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipedrive_lead_syncs_company_lead_unique UNIQUE (company_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_pipedrive_lead_syncs_queue
  ON public.pipedrive_lead_syncs (next_attempt_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_pipedrive_lead_syncs_company_status
  ON public.pipedrive_lead_syncs (company_id, status);

DROP TRIGGER IF EXISTS pipedrive_lead_syncs_set_updated_at
  ON public.pipedrive_lead_syncs;

CREATE TRIGGER pipedrive_lead_syncs_set_updated_at
BEFORE UPDATE ON public.pipedrive_lead_syncs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pipedrive_lead_syncs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pipedrive_lead_syncs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pipedrive_lead_syncs TO service_role;

COMMENT ON TABLE public.pipedrive_lead_syncs IS
  'Canonical per-lead Pipedrive sync/mapping state. Persists provider record ids so retries are idempotent.';

COMMIT;
