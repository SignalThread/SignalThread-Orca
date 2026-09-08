BEGIN;

alter table public.workflow_templates
  add column if not exists trigger_conditions_jsonb jsonb;

alter table public.workflow_runs
  add column if not exists trigger_fingerprint text;

update public.workflow_runs
set trigger_fingerprint = 'default'
where trigger_fingerprint is null;

alter table public.workflow_runs
  alter column trigger_fingerprint set default 'default';

drop index if exists public.workflow_runs_active_unique;

create unique index if not exists workflow_runs_active_unique
  on public.workflow_runs (template_id, lead_id, trigger_event, (coalesce(trigger_fingerprint, 'default')))
  where status not in ('failed', 'cancelled');

COMMIT;
