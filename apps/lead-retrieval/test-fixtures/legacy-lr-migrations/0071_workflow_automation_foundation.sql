-- Phase 2: Workflow Automation foundation tables.
-- Read-only by default at this phase: no UI authors templates yet, and the worker has no handlers.
--
-- Tables:
--   workflow_templates      one user-defined automation
--   workflow_steps          ordered steps inside a template
--   workflow_runs           one execution of a template against one lead
--   workflow_step_runs      one execution of one step inside a run
--   generated_drafts        persistent artifact for AI outputs requiring human review
--
-- RLS principle (mirrors lead_briefings 0030/0052):
--   - service role (admin client used by the worker + emitter) bypasses RLS
--   - authenticated reads are scoped via current_role() / current_company_id() to the company
--   - no public writes from authenticated clients in this phase; mutations go through server actions
--     using the admin client, which is the same pattern used by /api/exhibitor/* today

BEGIN;

-- ---------------------------------------------------------------------------
-- workflow_templates
-- ---------------------------------------------------------------------------
create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  trigger_event text not null
    check (trigger_event in ('lead_captured')),
  scope text not null
    check (scope in ('event', 'continuous_capture', 'any')),
  -- When pinned to a single event/CC bucket. Null = "any container of the chosen scope".
  event_id uuid references public.events(id) on delete set null,
  is_enabled boolean not null default false,
  version int not null default 1,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A pinned event must agree with the template's scope.
  constraint workflow_templates_pin_requires_scope check (
    event_id is null or scope in ('event', 'continuous_capture')
  )
);

create index if not exists idx_workflow_templates_company_trigger_enabled
  on public.workflow_templates (company_id, trigger_event, is_enabled);

create index if not exists idx_workflow_templates_event
  on public.workflow_templates (event_id)
  where event_id is not null;

create trigger workflow_templates_set_updated_at
before update on public.workflow_templates
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workflow_steps
-- ---------------------------------------------------------------------------
create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workflow_templates(id) on delete cascade,
  step_index int not null check (step_index >= 0),
  step_type text not null,
  -- Stable user-visible key used by later steps to reference outputs.
  step_key text not null,
  params_jsonb jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_steps_template_index_unique unique (template_id, step_index),
  constraint workflow_steps_template_key_unique unique (template_id, step_key)
);

create index if not exists idx_workflow_steps_template
  on public.workflow_steps (template_id, step_index);

create trigger workflow_steps_set_updated_at
before update on public.workflow_steps
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workflow_runs
-- ---------------------------------------------------------------------------
create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.workflow_templates(id) on delete cascade,
  template_version int not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- Resolved at trigger time. May be a continuous-capture bucket id (events.container_kind='continuous_capture').
  event_id uuid references public.events(id) on delete set null,
  trigger_event text not null,
  trigger_payload_jsonb jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  current_step_index int,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency: one *active* run per (template, lead, trigger).
-- Re-runs after terminal failure/cancellation are allowed (because of the WHERE clause).
create unique index if not exists workflow_runs_active_unique
  on public.workflow_runs (template_id, lead_id, trigger_event)
  where status not in ('failed', 'cancelled');

create index if not exists idx_workflow_runs_company_status_created
  on public.workflow_runs (company_id, status, created_at desc);

create index if not exists idx_workflow_runs_lead
  on public.workflow_runs (lead_id);

create trigger workflow_runs_set_updated_at
before update on public.workflow_runs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workflow_step_runs
-- ---------------------------------------------------------------------------
create table if not exists public.workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_id uuid not null references public.workflow_steps(id) on delete cascade,
  step_index int not null check (step_index >= 0),
  step_key text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval')),
  attempt_count int not null default 0,
  -- Refreshed on each claim. Worker uses this to detect concurrent claims after the fact.
  attempt_id uuid,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  input_jsonb jsonb,
  output_jsonb jsonb,
  error_text text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_step_runs_run_index_unique unique (run_id, step_index)
);

-- Hot path index for the worker claim query.
create index if not exists idx_workflow_step_runs_claim
  on public.workflow_step_runs (scheduled_at)
  where status = 'queued';

create index if not exists idx_workflow_step_runs_run
  on public.workflow_step_runs (run_id, step_index);

create trigger workflow_step_runs_set_updated_at
before update on public.workflow_step_runs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- generated_drafts
-- ---------------------------------------------------------------------------
create table if not exists public.generated_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- Inherited from the run for filtering convenience. May be null for company-only drafts.
  event_id uuid references public.events(id) on delete set null,
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_run_id uuid not null references public.workflow_step_runs(id) on delete cascade,
  kind text not null
    check (kind in ('email', 'briefing_block')),
  content_jsonb jsonb not null default '{}'::jsonb,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'sent')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  -- For emails: the resulting campaign_messages.id once approved+sent. Null otherwise.
  promoted_to_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generated_drafts_company_lead_kind_status
  on public.generated_drafts (company_id, lead_id, kind, approval_status);

create index if not exists idx_generated_drafts_run
  on public.generated_drafts (run_id);

create trigger generated_drafts_set_updated_at
before update on public.generated_drafts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: company-scoped read for exhibitors. No authenticated writes in this phase
-- (writes go through the admin client from server-side workflow code).
-- ---------------------------------------------------------------------------

alter table public.workflow_templates enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_step_runs enable row level security;
alter table public.generated_drafts enable row level security;

-- workflow_templates
drop policy if exists workflow_templates_select_scope on public.workflow_templates;
create policy workflow_templates_select_scope
on public.workflow_templates
for select
to authenticated
using (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and company_id = public.current_company_id()
);

-- workflow_steps: scoped via parent template
drop policy if exists workflow_steps_select_scope on public.workflow_steps;
create policy workflow_steps_select_scope
on public.workflow_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.workflow_templates t
    where t.id = public.workflow_steps.template_id
      and public.current_role() in ('exhibitor', 'exhibitor_admin')
      and t.company_id = public.current_company_id()
  )
);

-- workflow_runs
drop policy if exists workflow_runs_select_scope on public.workflow_runs;
create policy workflow_runs_select_scope
on public.workflow_runs
for select
to authenticated
using (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and company_id = public.current_company_id()
);

-- workflow_step_runs: scoped via parent run
drop policy if exists workflow_step_runs_select_scope on public.workflow_step_runs;
create policy workflow_step_runs_select_scope
on public.workflow_step_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.workflow_runs r
    where r.id = public.workflow_step_runs.run_id
      and public.current_role() in ('exhibitor', 'exhibitor_admin')
      and r.company_id = public.current_company_id()
  )
);

-- generated_drafts
drop policy if exists generated_drafts_select_scope on public.generated_drafts;
create policy generated_drafts_select_scope
on public.generated_drafts
for select
to authenticated
using (
  public.current_role() in ('exhibitor', 'exhibitor_admin')
  and company_id = public.current_company_id()
);

COMMIT;
