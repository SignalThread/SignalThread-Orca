import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import type { WorkflowHandler } from "../lib/workflows/contracts/step-handler";
import { createFakeSupabase, asAdminClient } from "./helpers/fake-supabase";
import type { createAdminClient } from "../lib/supabase/admin";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, NodeJS.Module | undefined>)[serverOnlyPath] = {
  id: serverOnlyPath,
  path: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {},
  isPreloading: false,
  require,
  parent: null,
} as unknown as NodeJS.Module;

function makeRun() {
  return {
    id: "run-1",
    company_id: "co-1",
    template_id: "tpl-1",
    template_version: 1,
    lead_id: "lead-1",
    event_id: "event-1",
    trigger_event: "lead_captured",
    trigger_payload_jsonb: {},
    trigger_fingerprint: "rating:5|temperature:hot",
    status: "queued",
    current_step_index: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:00:00.000Z"
  };
}

function makeStep(index: number, type: string, key = type) {
  return {
    id: `step-${index}`,
    template_id: "tpl-1",
    step_index: index,
    step_type: type,
    step_key: key,
    params_jsonb: {},
    requires_approval: type === "compose_campaign_draft",
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:00:00.000Z"
  };
}

function makeStepRun(index: number, type: string, scheduledAt: string) {
  return {
    id: `step-run-${index}`,
    run_id: "run-1",
    step_id: `step-${index}`,
    step_index: index,
    step_key: type,
    status: "queued",
    attempt_count: 0,
    attempt_id: null,
    scheduled_at: scheduledAt,
    started_at: null,
    completed_at: null,
    input_jsonb: null,
    output_jsonb: null,
    error_text: null,
    error_code: null,
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:00:00.000Z"
  };
}

const enrichHandler: WorkflowHandler = {
  stepType: "enrich_lead",
  displayName: "Stub enrich",
  run: async () => ({
    kind: "ok",
    output: {
      outcome: "updated",
      lead_summary: {
        job_title: "VP Engineering",
        company_text: "Ada Analytics"
      }
    }
  })
};

const campaignDraftHandler: WorkflowHandler = {
  stepType: "compose_campaign_draft",
  displayName: "Stub compose",
  run: async (ctx) => {
    const prior = ctx.previousStepOutputs.enrich as Record<string, unknown> | undefined;
    const summary = prior?.lead_summary as Record<string, unknown> | undefined;
    assert.equal(summary?.job_title, "VP Engineering");
    return {
      kind: "draft",
      output: {
        outcome: "campaign_draft_created",
        campaign_id: "campaign-1",
        campaign_recipient_id: "recipient-1",
        campaign_message_id: "message-1",
        subject_preview: "Hi Ada",
        body_preview: "Draft body",
        model: "gpt-test",
        signal_ids_used: ["sig-1"],
        signal_ids_missing: []
      },
      drafts: [
        {
          kind: "email",
          content: {
            subject: "Hi Ada",
            body_text: "Draft body",
            campaign_id: "campaign-1",
            campaign_recipient_id: "recipient-1",
            campaign_message_id: "message-1",
            signal_ids_used: ["sig-1"]
          }
        }
      ]
    };
  }
};

const failingCrmHandler: WorkflowHandler = {
  stepType: "crm_sync_salesforce",
  displayName: "Failing CRM",
  run: async () => ({
    kind: "fail",
    errorCode: "crm_salesforce_not_connected",
    errorText: "Salesforce is not connected for this account.",
    output: {
      provider: "salesforce"
    }
  })
};

const waitingForInsightsHandler: WorkflowHandler = {
  stepType: "crm_sync_hubspot",
  displayName: "Waiting CRM",
  run: async () => ({
    kind: "wait",
    waitingReason: "waiting_for_conversation_insights",
    errorText: "Waiting for AI conversation insights to finish.",
    waitExpiresAt: "2026-06-11T12:10:00.000Z",
    output: {
      workflowDataRequirements: {
        requiresAudioTranscript: false,
        requiresConversationInsights: true
      },
      required_conversation_version: 1,
      current_transcript_version: 1,
      current_insights_version: null,
      waiting_reason: "waiting_for_conversation_insights"
    }
  })
};

describe("executeWorkflowRunsToIdle", () => {
  it("stops at an approval-required campaign draft without executing the terminal action", async () => {
    const { buildWorkflowHandlerRegistry } = await import("../lib/workflows/contracts/step-handler");
    const { executeWorkflowRunsToIdle } = await import("../lib/workflows/runner/execute-runs-to-idle");
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [
        makeStep(0, "enrich_lead", "enrich"),
        makeStep(1, "compose_campaign_draft", "compose")
      ],
      workflow_step_runs: [
        makeStepRun(0, "enrich", "2026-06-11T12:00:00.000Z"),
        makeStepRun(1, "compose", "infinity")
      ],
      generated_drafts: []
    });

    const result = await executeWorkflowRunsToIdle({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry: buildWorkflowHandlerRegistry([enrichHandler, campaignDraftHandler]),
      runIds: ["run-1"],
      handlerTimeoutMs: 5000
    });

    assert.equal(result.processedStepCount, 2);
    assert.equal(result.runResults[0].terminalOutcome, "awaiting_approval");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.completed_at, null);

    const stepRuns = fake._tables.workflow_step_runs as Array<Record<string, unknown>>;
    assert.deepEqual(stepRuns.map((row) => row.status), ["completed", "awaiting_approval"]);
    const output = stepRuns[1].output_jsonb as Record<string, unknown>;
    assert.equal(output.outcome, "pending_approval");
    assert.equal(output.approval_required, true);

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].approval_status, "pending");
    assert.equal(drafts[0].promoted_to_id, null);
    const draftContent = drafts[0].content_jsonb as Record<string, unknown>;
    assert.equal(draftContent.approval_execution_mode, "execute_step_on_approval");
    assert.equal(draftContent.campaign_message_id, undefined);
  });

  it("records CRM sync failures on workflow run and step rows", async () => {
    const { buildWorkflowHandlerRegistry } = await import("../lib/workflows/contracts/step-handler");
    const { executeWorkflowRunsToIdle } = await import("../lib/workflows/runner/execute-runs-to-idle");
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [makeStep(0, "crm_sync_salesforce", "crm_salesforce_sync")],
      workflow_step_runs: [makeStepRun(0, "crm_salesforce_sync", "2026-06-11T12:00:00.000Z")],
      generated_drafts: []
    });

    const result = await executeWorkflowRunsToIdle({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry: buildWorkflowHandlerRegistry([failingCrmHandler]),
      runIds: ["run-1"],
      handlerTimeoutMs: 5000
    });

    assert.equal(result.processedStepCount, 1);
    assert.equal(result.runResults[0].terminalOutcome, "fail");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "failed");
    assert.ok(run.completed_at);

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "failed");
    assert.equal(stepRun.error_code, "crm_salesforce_not_connected");
    assert.equal(stepRun.error_text, "Salesforce is not connected for this account.");
    assert.deepEqual(stepRun.output_jsonb, { provider: "salesforce" });
  });

  it("pauses a step/run without failure when handler waits for conversation insights", async () => {
    const { buildWorkflowHandlerRegistry } = await import("../lib/workflows/contracts/step-handler");
    const { executeWorkflowRunsToIdle } = await import("../lib/workflows/runner/execute-runs-to-idle");
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [makeStep(0, "crm_sync_hubspot", "crm_hubspot_sync")],
      workflow_step_runs: [makeStepRun(0, "crm_hubspot_sync", "2026-06-11T12:00:00.000Z")],
      generated_drafts: []
    });

    const result = await executeWorkflowRunsToIdle({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      registry: buildWorkflowHandlerRegistry([waitingForInsightsHandler]),
      runIds: ["run-1"],
      handlerTimeoutMs: 5000
    });

    assert.equal(result.processedStepCount, 1);
    assert.equal(result.runResults[0].terminalOutcome, "waiting_for_conversation_insights");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "waiting_for_conversation_insights");
    assert.equal(run.completed_at, null);

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "waiting_for_conversation_insights");
    assert.equal(stepRun.error_code, "waiting_for_conversation_insights");
    assert.equal(stepRun.required_conversation_version, 1);
    assert.equal(stepRun.wait_expires_at, "2026-06-11T12:10:00.000Z");
  });

  it("resumes a waiting workflow step once insight readiness reaches the required version", async () => {
    const { resumeWaitingWorkflowStepsForLead } = await import("../lib/workflows/runner/resume-waiting");
    const stepRun = makeStepRun(0, "crm_hubspot_sync", "2026-06-11T12:00:00.000Z");
    const fake = createFakeSupabase({
      workflow_runs: [{ ...makeRun(), status: "waiting_for_conversation_insights" }],
      workflow_steps: [makeStep(0, "crm_sync_hubspot", "crm_hubspot_sync")],
      workflow_step_runs: [
        {
          ...stepRun,
          status: "waiting_for_conversation_insights",
          output_jsonb: {
            workflowDataRequirements: {
              requiresAudioTranscript: false,
              requiresConversationInsights: true
            }
          },
          wait_expires_at: "2026-06-11T12:10:00.000Z"
        }
      ],
      lead_conversation_readiness: [
        {
          lead_id: "lead-1",
          latest_conversation_version: 1,
          latest_audio_finalized_at: "2026-06-11T12:00:00.000Z",
          transcript_status: "ready",
          transcript_version: 1,
          transcript_ready_at: "2026-06-11T12:01:00.000Z",
          insights_status: "ready",
          insights_version: 1,
          insights_ready_at: "2026-06-11T12:02:00.000Z"
        }
      ],
      generated_drafts: []
    });

    const result = await resumeWaitingWorkflowStepsForLead({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      leadId: "lead-1",
      nowIso: "2026-06-11T12:03:00.000Z"
    });

    assert.deepEqual(result, { resumed: 1, timedOut: 0, stillWaiting: 0 });
    assert.equal((fake._tables.workflow_runs[0] as Record<string, unknown>).status, "queued");
    const resumedStep = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(resumedStep.status, "queued");
    assert.equal(resumedStep.scheduled_at, "2026-06-11T12:03:00.000Z");
    assert.equal(resumedStep.current_insights_version, 1);
  });

  it("updates waiting metadata to the latest audio version instead of resuming stale insights", async () => {
    const { resumeWaitingWorkflowStepsForLead } = await import("../lib/workflows/runner/resume-waiting");
    const fake = createFakeSupabase({
      workflow_runs: [{ ...makeRun(), status: "waiting_for_conversation_insights" }],
      workflow_steps: [makeStep(0, "crm_sync_hubspot", "crm_hubspot_sync")],
      workflow_step_runs: [
        {
          ...makeStepRun(0, "crm_hubspot_sync", "2026-06-11T12:00:00.000Z"),
          status: "waiting_for_conversation_insights",
          output_jsonb: {
            workflowDataRequirements: {
              requiresAudioTranscript: false,
              requiresConversationInsights: true
            }
          },
          wait_expires_at: "2026-06-11T12:10:00.000Z"
        }
      ],
      lead_conversation_readiness: [
        {
          lead_id: "lead-1",
          latest_conversation_version: 2,
          latest_audio_finalized_at: "2026-06-11T12:04:00.000Z",
          transcript_status: "ready",
          transcript_version: 2,
          transcript_ready_at: "2026-06-11T12:05:00.000Z",
          insights_status: "processing",
          insights_version: 1,
          insights_ready_at: "2026-06-11T12:02:00.000Z"
        }
      ],
      generated_drafts: []
    });

    const result = await resumeWaitingWorkflowStepsForLead({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      leadId: "lead-1",
      nowIso: "2026-06-11T12:06:00.000Z"
    });

    assert.deepEqual(result, { resumed: 0, timedOut: 0, stillWaiting: 1 });
    const step = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(step.status, "waiting_for_conversation_insights");
    assert.equal(step.required_conversation_version, 2);
    assert.equal(step.current_transcript_version, 2);
    assert.equal(step.current_insights_version, 1);
  });

  it("times out waiting workflow steps with a clear reason", async () => {
    const { resumeWaitingWorkflowStepsForLead } = await import("../lib/workflows/runner/resume-waiting");
    const fake = createFakeSupabase({
      workflow_runs: [{ ...makeRun(), status: "waiting_for_audio_transcript" }],
      workflow_steps: [makeStep(0, "crm_sync_hubspot", "crm_hubspot_sync")],
      workflow_step_runs: [
        {
          ...makeStepRun(0, "crm_hubspot_sync", "2026-06-11T12:00:00.000Z"),
          status: "waiting_for_audio_transcript",
          output_jsonb: {
            workflowDataRequirements: {
              requiresAudioTranscript: true,
              requiresConversationInsights: false
            }
          },
          wait_expires_at: "2026-06-11T12:10:00.000Z"
        }
      ],
      lead_conversation_readiness: [
        {
          lead_id: "lead-1",
          latest_conversation_version: 1,
          latest_audio_finalized_at: "2026-06-11T12:00:00.000Z",
          transcript_status: "processing",
          transcript_version: null,
          transcript_ready_at: null,
          insights_status: "pending",
          insights_version: null,
          insights_ready_at: null
        }
      ],
      generated_drafts: []
    });

    const result = await resumeWaitingWorkflowStepsForLead({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      leadId: "lead-1",
      nowIso: "2026-06-11T12:11:00.000Z"
    });

    assert.deepEqual(result, { resumed: 0, timedOut: 1, stillWaiting: 0 });
    assert.equal((fake._tables.workflow_runs[0] as Record<string, unknown>).status, "failed");
    const step = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(step.status, "failed");
    assert.equal(step.error_code, "timed_out_waiting_for_audio_transcript");
    assert.match(String(step.error_text), /Timed out/);
  });
});
