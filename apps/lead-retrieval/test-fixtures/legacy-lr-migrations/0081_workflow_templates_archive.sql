BEGIN;

alter table public.workflow_templates
  add column if not exists archived_at timestamptz;

alter table public.workflow_templates
  add column if not exists archived_by uuid references public.users(id) on delete set null;

create index if not exists idx_workflow_templates_company_active
  on public.workflow_templates (company_id, updated_at desc)
  where archived_at is null;

notify pgrst, 'reload schema';

COMMIT;
