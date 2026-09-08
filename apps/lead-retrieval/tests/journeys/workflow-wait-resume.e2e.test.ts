/**
 * Workflow wait/resume journey.
 *
 * Drives the REAL canonical resume engine (`resumeWaitingWorkflowStepsForLead`) over the
 * in-memory `fake-supabase` shim. Proves a run waits only when required, resumes once
 * conversation readiness reaches the required version, stays waiting (refreshing the required
 * version) for stale audio, and times out cleanly — and that no stuck waiting run remains.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { createAdminClient } from "../../lib/supabase/admin";
import { resumeWaitingWorkflowStepsForLead } from "../../lib/workflows/runner/resume-waiting";
import { asAdminClient, createFakeSupabase } from "../helpers/fake-supabase";

const LEAD = "lead-1";
const T0 = "2026-06-11T12:00:00.000Z";
const WAIT_EXPIRES = "2026-06-11T12:10:00.000Z";
const NOW_RESUME = "2026-06-11T12:03:00.000Z";
const NOW_TIMEOUT = "2026-06-11T12:11:00.000Z";

const WAITING_STATUSES = ["waiting_for_audio_transcript", "waiting_for_conversation_insights"];

function waitingRun(status: string) {
  return {
    id: "run-1",
    company_id: "co-1",
    template_id: "tpl-1",
    template_version: 1,
    lead_id: LEAD,
    event_id: "event-1",
    trigger_event: "lead_captured",
    trigger_payload_jsonb: {},
    trigger_fingerprint: "rating:5|temperature:hot",
    status,
    current_step_index: 0,
    started_at: null,
    completed_at: null,
    created_at: T0,
    updated_at: T0,
  };
}

function waitingStepRun(
  status: string,
  requirements: { requiresAudioTranscript: boolean; requiresConversationInsights: boolean }
) {
  return {
    id: "step-run-0",
    run_id: "run-1",
    step_id: "step-0",
    step_index: 0,
    step_key: "crm_hubspot_sync",
    status,
    attempt_count: 0,
    attempt_id: null,
    scheduled_at: T0,
    started_at: null,
    completed_at: null,
    input_jsonb: null,
    output_jsonb: { workflowDataRequirements: requirements },
    error_text: null,
    error_code: null,
    required_conversation_version: 1,
    wait_expires_at: WAIT_EXPIRES,
    created_at: T0,
    updated_at: T0,
  };
}

function readiness(over: Record<string, unknown>) {
  return {
    lead_id: LEAD,
    latest_conversation_version: 1,
    latest_audio_finalized_at: T0,
    transcript_status: "pending",
    transcript_version: null,
    transcript_ready_at: null,
    insights_status: "pending",
    insights_version: null,
    insights_ready_at: null,
    ...over,
  };
}

function noWaitingRunsRemain(tables: any): boolean {
  return (tables.workflow_runs as Array<{ status: string }>).every(
    (r) => !WAITING_STATUSES.includes(r.status)
  );
}

describe("workflow wait/resume journey — resumes once readiness reaches the required version", () => {
  it("clears the wait, requeues the step/run, and leaves no stuck waiting run", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [waitingRun("waiting_for_conversation_insights")],
      workflow_steps: [{ id: "step-0", template_id: "tpl-1", step_index: 0, step_type: "crm_sync_hubspot", step_key: "crm_hubspot_sync", params_jsonb: {}, requires_approval: false, created_at: T0, updated_at: T0 }],
      workflow_step_runs: [
        waitingStepRun("waiting_for_conversation_insights", {
          requiresAudioTranscript: false,
          requiresConversationInsights: true,
        }),
      ],
      lead_conversation_readiness: [
        readiness({
          latest_conversation_version: 1,
          transcript_status: "ready",
          transcript_version: 1,
          insights_status: "ready",
          insights_version: 1,
        }),
      ],
      generated_drafts: [],
    });

    const result = await resumeWaitingWorkflowStepsForLead({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      leadId: LEAD,
      nowIso: NOW_RESUME,
    });

    assert.deepEqual(result, { resumed: 1, timedOut: 0, stillWaiting: 0 });
    assert.equal((fake._tables.workflow_runs[0] as any).status, "queued");
    assert.equal((fake._tables.workflow_step_runs[0] as any).status, "queued");
    assert.ok(noWaitingRunsRemain(fake._tables), "no run should remain in a waiting status");
  });
});

describe("workflow wait/resume journey — stays waiting for stale audio (refreshes required version)", () => {
  it("does not resume on a newer conversation version whose insights are not ready", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [waitingRun("waiting_for_conversation_insights")],
      workflow_steps: [{ id: "step-0", template_id: "tpl-1", step_index: 0, step_type: "crm_sync_hubspot", step_key: "crm_hubspot_sync", params_jsonb: {}, requires_approval: false, created_at: T0, updated_at: T0 }],
      workflow_step_runs: [
        waitingStepRun("waiting_for_conversation_insights", {
          requiresAudioTranscript: false,
          requiresConversationInsights: true,
        }),
      ],
      lead_conversation_readiness: [
        readiness({
          latest_conversation_version: 2,
          transcript_status: "ready",
          transcript_version: 2,
          insights_status: "processing",
          insights_version: 1,
        }),
      ],
      generated_drafts: [],
    });

    const result = await resumeWaitingWorkflowStepsForLead({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      leadId: LEAD,
      nowIso: "2026-06-11T12:06:00.000Z",
    });

    assert.deepEqual(result, { resumed: 0, timedOut: 0, stillWaiting: 1 });
    const step = fake._tables.workflow_step_runs[0] as any;
    assert.equal(step.status, "waiting_for_conversation_insights");
    assert.equal(step.required_conversation_version, 2); // refreshed to the newer audio version
  });
});

describe("workflow wait/resume journey — times out cleanly past the deadline", () => {
  it("fails the waiting run with a clear timeout reason (no indefinite wait)", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [waitingRun("waiting_for_audio_transcript")],
      workflow_steps: [{ id: "step-0", template_id: "tpl-1", step_index: 0, step_type: "crm_sync_hubspot", step_key: "crm_hubspot_sync", params_jsonb: {}, requires_approval: false, created_at: T0, updated_at: T0 }],
      workflow_step_runs: [
        waitingStepRun("waiting_for_audio_transcript", {
          requiresAudioTranscript: true,
          requiresConversationInsights: false,
        }),
      ],
      lead_conversation_readiness: [
        readiness({ transcript_status: "processing", insights_status: "pending" }),
      ],
      generated_drafts: [],
    });

    const result = await resumeWaitingWorkflowStepsForLead({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      leadId: LEAD,
      nowIso: NOW_TIMEOUT,
    });

    assert.deepEqual(result, { resumed: 0, timedOut: 1, stillWaiting: 0 });
    assert.equal((fake._tables.workflow_runs[0] as any).status, "failed");
    const step = fake._tables.workflow_step_runs[0] as any;
    assert.equal(step.status, "failed");
    assert.equal(step.error_code, "timed_out_waiting_for_audio_transcript");
    assert.match(String(step.error_text), /Timed out/i);
    assert.ok(noWaitingRunsRemain(fake._tables), "timed-out run must not remain in a waiting status");
  });
});
