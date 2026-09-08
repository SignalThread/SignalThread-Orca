BEGIN;

CREATE TABLE IF NOT EXISTS public.workflow_trigger_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  trigger_event text NOT NULL DEFAULT 'lead_captured',
  source text,
  status text NOT NULL CHECK (
    status IN ('matched', 'skipped', 'no_templates', 'no_runs_created', 'error')
  ),
  reason text NOT NULL,
  trigger_fingerprint text,
  details_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_trigger_decisions_lead_created
  ON public.workflow_trigger_decisions (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_trigger_decisions_company_created
  ON public.workflow_trigger_decisions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_trigger_decisions_template_created
  ON public.workflow_trigger_decisions (template_id, created_at DESC)
  WHERE template_id IS NOT NULL;

ALTER TABLE public.workflow_trigger_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_trigger_decisions_select_scope
  ON public.workflow_trigger_decisions;

CREATE POLICY workflow_trigger_decisions_select_scope
  ON public.workflow_trigger_decisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'platform_admin'
          OR u.company_id = workflow_trigger_decisions.company_id
        )
    )
  );

COMMIT;
