BEGIN;

alter table public.workflow_templates
  add column if not exists trigger_conditions_jsonb jsonb;

notify pgrst, 'reload schema';

COMMIT;
