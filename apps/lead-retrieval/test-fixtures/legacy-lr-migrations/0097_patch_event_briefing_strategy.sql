-- Atomic, event-scoped JSONB PATCH for AI Briefing Strategy. This prevents a
-- stale partial autosave from replacing sibling strategy fields.
CREATE OR REPLACE FUNCTION public.patch_event_briefing_strategy(
  p_event_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_strategy jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'briefing strategy patch must be an object';
  END IF;

  UPDATE public.events
  SET briefing_strategy =
    (COALESCE(briefing_strategy, '{}'::jsonb) || (p_patch - 'guardrails')) ||
    CASE
      WHEN p_patch ? 'guardrails' THEN jsonb_build_object(
        'guardrails',
        COALESCE(briefing_strategy->'guardrails', '{}'::jsonb) || p_patch->'guardrails'
      )
      ELSE '{}'::jsonb
    END
  WHERE id = p_event_id
  RETURNING briefing_strategy INTO v_strategy;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found';
  END IF;

  RETURN v_strategy;
END;
$$;
