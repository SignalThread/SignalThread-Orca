import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeClaimedStepRun } from "../lib/workflows/runner/run-step";
import { buildWorkflowHandlerRegistry } from "../lib/workflows/contracts/step-handler";
import type { WorkflowHandler } from "../lib/workflows/contracts/step-handler";
import { createFakeSupabase, asAdminClient } from "./helpers/fake-supabase";
import type { createAdminClient } from "../lib/supabase/admin";

const STEP_TYPE = "compose_campaign_draft";

function makeRun() {
  return {
    id: "run-1",
    company_id: "co-1",
    template_id: "tpl-1",
    template_version: 1,
    lead_id: "lead-1",
    event_id: null,
    trigger_event: "lead_captured",
    trigger_payload_jsonb: {},
    status: "queued",
    current_step_index: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-05-13T01:00:00Z",
    updated_at: "2026-05-13T01:00:00Z"
  };
}
function makeStep(stepType: string, stepIndex: number) {
  return {
    id: `step-${stepIndex}`,
    template_id: "tpl-1",
    step_index: stepIndex,
    step_type: stepType,
    step_key: stepType,
    params_jsonb: stepType === STEP_TYPE ? { subjectTemplate: "Hi {{first_name}}" } : {},
    requires_approval: stepType === STEP_TYPE,
    created_at: "2026-05-13T01:00:00Z",
    updated_at: "2026-05-13T01:00:00Z"
  };
}
function makeStepRun(stepIndex: number, status: "queued" | "running" = "running") {
  return {
    id: `step-run-${stepIndex}`,
    run_id: "run-1",
    step_id: `step-${stepIndex}`,
    step_index: stepIndex,
    step_key: `step-${stepIndex}`,
    status,
    attempt_count: 1,
    attempt_id: "att-1",
    scheduled_at: "2026-05-13T01:00:00Z",
    started_at: "2026-05-13T01:00:00Z",
    completed_at: null,
    input_jsonb: null,
    output_jsonb: null,
    error_text: null,
    error_code: null,
    created_at: "2026-05-13T01:00:00Z",
    updated_at: "2026-05-13T01:00:00Z"
  };
}

function stubDraftHandler(calls?: { count: number }): WorkflowHandler {
  return {
    stepType: STEP_TYPE,
    displayName: "stub compose",
    run: async () => {
      if (calls) calls.count += 1;
      return {
        kind: "draft",
        output: {
          outcome: "draft_pending_review",
          draft_id: null,
          subject_preview: "Hi Ada",
          body_preview: "Hi Ada,\n\nGreat chatting.",
          model: "gpt-test",
          signal_ids_used: ["sig-1"],
          signal_ids_missing: []
        },
        drafts: [
          {
            kind: "email",
            content: {
              subject: "Hi Ada",
              body_text: "Hi Ada,\n\nGreat chatting.\n\nBest,\nMe",
              body_html: null,
              model: "gpt-test",
              signal_ids_used: ["sig-1"]
            }
          }
        ]
      };
    }
  };
}

function stubPromotedCampaignDraftHandler(calls?: { count: number }): WorkflowHandler {
  return {
    stepType: STEP_TYPE,
    displayName: "stub promoted compose",
    run: async () => {
      if (calls) calls.count += 1;
      return {
        kind: "draft",
        output: {
          outcome: "campaign_draft_created",
          campaign_id: "campaign-1",
          campaign_recipient_id: "recipient-1",
          campaign_message_id: "message-1",
          draft_id: null,
          subject_preview: "Hi Ada",
          body_preview: "Hi Ada,\n\nGreat chatting.",
          model: "gpt-test",
          signal_ids_used: ["sig-1"],
          signal_ids_missing: []
        },
        drafts: [
          {
            kind: "email",
            content: {
              subject: "Hi Ada",
              body_text: "Hi Ada,\n\nGreat chatting.\n\nBest,\nMe",
              body_html: null,
              campaign_id: "campaign-1",
              campaign_recipient_id: "recipient-1",
              campaign_message_id: "message-1",
              model: "gpt-test",
              signal_ids_used: ["sig-1"]
            }
          }
        ]
      };
    }
  };
}

function stubCrmHandler(calls?: { count: number }): WorkflowHandler {
  return {
    stepType: "crm_sync_hubspot",
    displayName: "stub CRM",
    run: async () => {
      if (calls) calls.count += 1;
      return {
        kind: "ok",
        output: {
          outcome: "crm_synced",
          provider: "hubspot",
          contact_id: "contact-1"
        }
      };
    }
  };
}

describe("runner draft pause — single-step template", () => {
  it("inserts a pending generated_drafts row, marks step+run awaiting_approval, does not schedule a next step", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [makeStep(STEP_TYPE, 0)],
      workflow_step_runs: [makeStepRun(0)],
      generated_drafts: []
    });

    const calls = { count: 0 };
    const registry = buildWorkflowHandlerRegistry([stubDraftHandler(calls)]);

    const { outcome } = await executeClaimedStepRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry,
      claimed: makeStepRun(0),
      handlerTimeoutMs: 5000
    });

    assert.equal(outcome, "awaiting_approval");
    assert.equal(calls.count, 0, "approval-required handler must not run before approval");

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].approval_status, "pending");
    assert.equal(drafts[0].company_id, "co-1");
    assert.equal(drafts[0].lead_id, "lead-1");
    assert.equal(drafts[0].kind, "email");
    const content = drafts[0].content_jsonb as Record<string, unknown>;
    assert.equal(content.approval_execution_mode, "execute_step_on_approval");
    assert.equal(content.step_type, STEP_TYPE);
    assert.equal(content.subject, "Hi {{first_name}}");
    assert.equal(content.subject_template, "Hi {{first_name}}");
    assert.equal(content.body_text, undefined);

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "awaiting_approval");
    // output_jsonb summary is persisted on the step run (small, bounded):
    const stepOutput = stepRun.output_jsonb as Record<string, unknown>;
    assert.equal(stepOutput.outcome, "pending_approval");
    assert.equal(stepOutput.approval_required, true);
    // step run is NOT marked completed; completed_at must not be set yet:
    assert.equal(stepRun.completed_at, null);

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.current_step_index, 0);
    assert.equal(run.completed_at, null);
  });
});

describe("runner draft pause — multi-step template", () => {
  it("does NOT schedule the next step until approval", async () => {
    const futureScheduledAt = "2099-01-01T00:00:00.000Z";
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [
        makeStep(STEP_TYPE, 0),
        makeStep("never_runs_in_phase_4", 1)
      ],
      workflow_step_runs: [
        makeStepRun(0),
        {
          ...makeStepRun(1, "queued"),
          scheduled_at: futureScheduledAt
        }
      ],
      generated_drafts: []
    });
    const calls = { count: 0 };
    const registry = buildWorkflowHandlerRegistry([stubDraftHandler(calls)]);

    await executeClaimedStepRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry,
      claimed: makeStepRun(0),
      handlerTimeoutMs: 5000
    });
    assert.equal(calls.count, 0, "approval-required handler must not run before approval");

    const stepRun1 = (fake._tables.workflow_step_runs as Array<Record<string, unknown>>).find(
      (r) => r.id === "step-run-1"
    );
    assert.ok(stepRun1, "step run for index 1 must exist");
    // Critical: the next step's scheduled_at is unchanged — runner did not advance.
    assert.equal(stepRun1.scheduled_at, futureScheduledAt);
    assert.equal(stepRun1.status, "queued");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.current_step_index, 0); // frozen at the paused step
  });
});

describe("runner approval gate — generic action steps", () => {
  it("does not execute an approval-required CRM step and stores exact resume context", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [{ ...makeRun(), current_step_index: 1 }],
      workflow_steps: [
        { ...makeStep("enrich_lead", 0), requires_approval: false },
        { ...makeStep("crm_sync_hubspot", 1), step_key: "crm_hubspot_sync", requires_approval: true }
      ],
      workflow_step_runs: [
        {
          ...makeStepRun(0, "queued"),
          status: "completed",
          output_jsonb: { outcome: "enriched", lead_summary: { title: "VP Engineering" } },
          completed_at: "2026-05-13T01:01:00Z"
        },
        { ...makeStepRun(1), step_key: "crm_hubspot_sync" }
      ],
      generated_drafts: []
    });
    const calls = { count: 0 };
    const registry = buildWorkflowHandlerRegistry([stubCrmHandler(calls)]);

    const { outcome } = await executeClaimedStepRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry,
      claimed: { ...makeStepRun(1), step_key: "crm_hubspot_sync" },
      handlerTimeoutMs: 5000
    });

    assert.equal(outcome, "awaiting_approval");
    assert.equal(calls.count, 0, "approval-required CRM handler must not run before approval");

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].approval_status, "pending");
    const content = drafts[0].content_jsonb as Record<string, unknown>;
    assert.equal(content.workflow_run_id, "run-1");
    assert.equal(content.workflow_id, "tpl-1");
    assert.equal(content.lead_id, "lead-1");
    assert.equal(content.step_id, "step-1");
    assert.equal(content.step_index, 1);
    assert.equal(content.step_type, "crm_sync_hubspot");
    assert.equal(content.action_type, "crm_sync_hubspot");
    assert.equal(content.action_label, "HubSpot CRM Sync");
    assert.equal(content.approval_action_label, "Approve CRM sync");
    const snapshot = content.input_context_snapshot as Record<string, unknown>;
    const previous = snapshot.previous_step_outputs as Record<string, Record<string, unknown>>;
    assert.deepEqual(previous["step-0"], { outcome: "enriched", lead_summary: { title: "VP Engineering" } });

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.current_step_index, 1);
  });
});

describe("runner draft pause — idempotency", () => {
  it("does not insert duplicate generated_drafts rows on re-claim of the same step run", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [makeStep(STEP_TYPE, 0)],
      workflow_step_runs: [makeStepRun(0)],
      generated_drafts: [
        {
          id: "existing-draft-1",
          company_id: "co-1",
          lead_id: "lead-1",
          event_id: null,
          run_id: "run-1",
          step_run_id: "step-run-0",
          kind: "email",
          content_jsonb: { subject: "Existing" },
          approval_status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          promoted_to_id: null
        }
      ]
    });
    const calls = { count: 0 };
    const registry = buildWorkflowHandlerRegistry([stubDraftHandler(calls)]);

    await executeClaimedStepRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry,
      claimed: makeStepRun(0),
      handlerTimeoutMs: 5000
    });
    assert.equal(calls.count, 0, "re-claim should not execute approval-required handler");

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts.length, 1, "should not insert another draft when one already exists for this step_run_id");
    assert.equal(drafts[0].id, "existing-draft-1");
  });
});

describe("runner compose draft — automatic (no approval pause)", () => {
  it("completes the step without generated_drafts when requires_approval is false", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [{ ...makeStep(STEP_TYPE, 0), requires_approval: false }],
      workflow_step_runs: [makeStepRun(0)],
      generated_drafts: []
    });

    const calls = { count: 0 };
    const registry = buildWorkflowHandlerRegistry([stubDraftHandler(calls)]);

    const { outcome } = await executeClaimedStepRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry,
      claimed: makeStepRun(0),
      handlerTimeoutMs: 5000
    });

    assert.equal(outcome, "ok");
    assert.equal(calls.count, 1);

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts.length, 0);

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "completed");
    assert.ok(stepRun.completed_at);

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "completed");
    assert.ok(run.completed_at);
  });
});

describe("runner compose draft — persisted campaign draft", () => {
  it("does not run approval-required steps even if their handler would return promoted-looking campaign ids", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [makeStep(STEP_TYPE, 0)],
      workflow_step_runs: [makeStepRun(0)],
      generated_drafts: []
    });

    const calls = { count: 0 };
    const registry = buildWorkflowHandlerRegistry([stubPromotedCampaignDraftHandler(calls)]);

    const { outcome } = await executeClaimedStepRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry,
      claimed: makeStepRun(0),
      handlerTimeoutMs: 5000
    });

    assert.equal(outcome, "awaiting_approval");
    assert.equal(calls.count, 0, "approval-required handler must not run before approval");

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].approval_status, "pending");
    assert.equal(drafts[0].promoted_to_id, null);
    const content = drafts[0].content_jsonb as Record<string, unknown>;
    assert.equal(content.campaign_id, undefined);
    assert.equal(content.campaign_message_id, undefined);
    assert.equal(content.approval_execution_mode, "execute_step_on_approval");

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "awaiting_approval");
    assert.equal(stepRun.completed_at, null);
    const output = stepRun.output_jsonb as Record<string, unknown>;
    assert.equal(output.outcome, "pending_approval");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.completed_at, null);
  });

  it("records generated_drafts metadata and completes the run once an automatic campaign message exists", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [{ ...makeStep(STEP_TYPE, 0), requires_approval: false }],
      workflow_step_runs: [makeStepRun(0)],
      generated_drafts: []
    });

    const registry = buildWorkflowHandlerRegistry([stubPromotedCampaignDraftHandler()]);

    const { outcome } = await executeClaimedStepRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry,
      claimed: makeStepRun(0),
      handlerTimeoutMs: 5000
    });

    assert.equal(outcome, "draft");

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].approval_status, "approved");
    assert.equal(drafts[0].promoted_to_id, "message-1");

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "completed");
    assert.ok(stepRun.completed_at);

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "completed");
    assert.ok(run.completed_at);
  });
});
