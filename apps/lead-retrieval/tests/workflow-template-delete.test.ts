import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteWorkflowTemplateForScope } from "../lib/exhibitor/workflows/delete-workflow-template";
import { createFakeSupabase } from "./helpers/fake-supabase";

const WORKFLOW_ID = "workflow-1";
const COMPANY_ID = "company-1";
const EVENT_ID = "event-1";
const USER_ID = "user-1";
const RUN_ID = "run-1";
const STEP_ID = "step-1";
const STEP_RUN_ID = "step-run-1";
const DRAFT_ID = "draft-1";

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    company_id: COMPANY_ID,
    name: "User workflow",
    description: null,
    trigger_event: "lead_captured",
    scope: "event",
    event_id: EVENT_ID,
    is_enabled: true,
    version: 1,
    created_by: USER_ID,
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:00:00.000Z",
    ...overrides
  };
}

function step(overrides: Record<string, unknown> = {}) {
  return {
    id: STEP_ID,
    template_id: WORKFLOW_ID,
    step_index: 0,
    step_type: "compose_campaign_draft",
    step_key: "compose",
    params_jsonb: {},
    requires_approval: true,
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:00:00.000Z",
    ...overrides
  };
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    company_id: COMPANY_ID,
    template_id: WORKFLOW_ID,
    template_version: 1,
    lead_id: "lead-1",
    event_id: EVENT_ID,
    trigger_event: "lead_captured",
    trigger_payload_jsonb: {},
    trigger_fingerprint: "default",
    status: "completed",
    current_step_index: null,
    started_at: null,
    completed_at: "2026-06-11T12:05:00.000Z",
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:05:00.000Z",
    ...overrides
  };
}

function stepRun(overrides: Record<string, unknown> = {}) {
  return {
    id: STEP_RUN_ID,
    run_id: RUN_ID,
    step_id: STEP_ID,
    step_index: 0,
    step_key: "compose",
    step_type: "compose_campaign_draft",
    status: "completed",
    attempt_count: 1,
    input_jsonb: {},
    output_jsonb: {},
    error_text: null,
    error_code: null,
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:05:00.000Z",
    ...overrides
  };
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    company_id: COMPANY_ID,
    lead_id: "lead-1",
    event_id: EVENT_ID,
    run_id: RUN_ID,
    step_run_id: STEP_RUN_ID,
    kind: "email",
    content_jsonb: {},
    approval_status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    promoted_to_id: null,
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:00:00.000Z",
    ...overrides
  };
}

describe("deleteWorkflowTemplateForScope", () => {
  it("hard-deletes a non-default workflow and dependent workflow records", async () => {
    const fake = createFakeSupabase({
      workflow_templates: [template()],
      workflow_steps: [step()],
      workflow_runs: [run()],
      workflow_step_runs: [stepRun()],
      generated_drafts: [draft()]
    });

    const result = await deleteWorkflowTemplateForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: COMPANY_ID,
      eventIdForScope: EVENT_ID
    });

    assert.deepEqual(result, {
      ok: true,
      workflowId: WORKFLOW_ID,
      deleted: true
    });
    assert.equal(fake._tables.workflow_templates.length, 0);
    assert.equal(fake._tables.workflow_steps.length, 0);
    assert.equal(fake._tables.workflow_runs.length, 0);
    assert.equal(fake._tables.workflow_step_runs.length, 0);
    assert.equal(fake._tables.generated_drafts.length, 0);
  });

  it("protects system workflows", async () => {
    const fake = createFakeSupabase({
      workflow_templates: [template({ created_by: null })],
      workflow_runs: []
    });

    const result = await deleteWorkflowTemplateForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: COMPANY_ID,
      eventIdForScope: EVENT_ID
    });

    assert.deepEqual(result, {
      ok: false,
      status: 403,
      error: "System workflows cannot be deleted."
    });
    assert.equal(fake._tables.workflow_templates.length, 1);
  });

  it("enforces company and event scope", async () => {
    const fake = createFakeSupabase({
      workflow_templates: [template()],
      workflow_runs: []
    });

    const wrongCompany = await deleteWorkflowTemplateForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: "company-2",
      eventIdForScope: EVENT_ID
    });
    const wrongEvent = await deleteWorkflowTemplateForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: COMPANY_ID,
      eventIdForScope: "event-2"
    });

    assert.equal(wrongCompany.ok, false);
    assert.equal(wrongCompany.status, 404);
    assert.equal(wrongEvent.ok, false);
    assert.equal(wrongEvent.status, 404);
    assert.equal(fake._tables.workflow_templates.length, 1);
  });

  it("allows platform admins to delete by workflow id without an exhibitor company id", async () => {
    const fake = createFakeSupabase({
      workflow_templates: [template()],
      workflow_steps: [],
      workflow_runs: [],
      workflow_step_runs: [],
      generated_drafts: []
    });

    const result = await deleteWorkflowTemplateForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: null,
      isPlatformAdmin: true
    });

    assert.equal(result.ok, true);
    assert.equal(fake._tables.workflow_templates.length, 0);
  });
});
