-- Event-scoped reusable briefing strategy (Product Focus, Persona, Event Goal).
-- Batch-specific notes remain on import_batches.briefing_context.batchNotes.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS briefing_strategy jsonb;

COMMENT ON COLUMN public.events.briefing_strategy IS 'Exhibitor briefing setup: product focus, persona, event goal (JSON). Event-scoped.';
