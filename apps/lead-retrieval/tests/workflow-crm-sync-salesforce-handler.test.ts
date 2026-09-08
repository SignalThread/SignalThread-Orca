import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmAiNotesBody } from "../lib/workflows/step-handlers/crm-sync-ai-notes";
import { runCrmSyncSalesforceStep } from "../lib/workflows/step-handlers/crm-sync-salesforce-runner";
import { resolveWorkflowCrmSyncConfig } from "../lib/workflows/step-handlers/crm-sync-effective-config";
import type { WorkflowHandlerContext } from "../lib/workflows/contracts/step-handler";
import type {
  WorkflowRunRow,
  WorkflowStepRow,
  WorkflowStepRunRow
} from "../lib/workflows/contracts/workflow-types";

function makeCtx(params?: Record<string, unknown>): WorkflowHandlerContext {
  const run: WorkflowRunRow = {
    id: "run-1",
    company_id: "account-1",
    template_id: "tpl-1",
    template_version: 1,
    lead_id: "lead-1",
    event_id: "ev-1",
    trigger_event: "lead_captured",
    trigger_payload_jsonb: {},
    status: "running",
    current_step_index: 0,
    started_at: "2026-06-21T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z"
  };
  const step: WorkflowStepRow = {
    id: "step-1",
    template_id: "tpl-1",
    step_index: 0,
    step_type: "crm_sync_salesforce",
    step_key: "crm_salesforce_sync",
    params_jsonb: {
      operation: "salesforce_upsert_lead",
      ...params
    },
    requires_approval: false,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z"
  };
  const stepRun: WorkflowStepRunRow = {
    id: "step-run-1",
    run_id: "run-1",
    step_id: "step-1",
    step_index: 0,
    step_key: "crm_salesforce_sync",
    status: "running",
    attempt_count: 1,
    attempt_id: "attempt-1",
    scheduled_at: "2026-06-21T00:00:00.000Z",
    started_at: "2026-06-21T00:00:00.000Z",
    completed_at: null,
    input_jsonb: null,
    output_jsonb: null,
    error_text: null,
    error_code: null,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z"
  };

  return {
    run,
    step,
    stepRun,
    previousStepOutputs: {},
    abortSignal: new AbortController().signal
  };
}

const SALESFORCE_SYNC_CONFIG = resolveWorkflowCrmSyncConfig({
  provider: "salesforce",
  integrationDefault: {
    recordType: "lead",
    matchBehavior: "upsert_by_email",
    sourceLabel: "Expo floor"
  }
});

function readyReadiness() {
  return {
    leadId: "lead-1",
    latestConversationVersion: 2,
    latestAudioFinalizedAt: "2026-06-21T00:01:00.000Z",
    transcriptStatus: "ready" as const,
    transcriptVersion: 2,
    transcriptReadyAt: "2026-06-21T00:02:00.000Z",
    insightsStatus: "ready" as const,
    insightsVersion: 2,
    insightsReadyAt: "2026-06-21T00:03:00.000Z"
  };
}

test("buildCrmAiNotesBody renders fallback text for missing sections", () => {
  const body = buildCrmAiNotesBody({
    contentOptions: {
      includeLeadDetails: true,
      includeAiNotes: true,
      includeCampaignContextInCrmNote: false,
      includeRecommendedFollowUpInCrmNote: true,
      includeSuggestedEmailDraftInCrmNote: true,
      suggestedEmailInstructions: null
    },
    syncConfig: SALESFORCE_SYNC_CONFIG,
    lead: null,
    conversation: null,
    followUpDraft: null
  });

  assert.match(body, /Conversation Summary/);
  assert.match(body, /Not available yet\./);
  assert.match(body, /Suggested Email Draft/);
  assert.match(body, /Subject: Follow-up from Expo floor/);
  assert.match(body, /Body:\nHi there,/);
});

test("runCrmSyncSalesforceStep keeps legacy lead sync behavior when note options are off", async () => {
  let taskCalled = false;
  const result = await runCrmSyncSalesforceStep({
    ctx: makeCtx(),
    effectiveSyncConfig: SALESFORCE_SYNC_CONFIG,
    adapters: {
      async syncLead(input) {
        assert.equal(input.accountId, "account-1");
        assert.equal(input.leadId, "lead-1");
        assert.equal(input.syncConfig.matchBehavior, "upsert_by_email");
        assert.equal(input.syncConfig.sourceLabel, "Expo floor");
        return { success: true, action: "updated", salesforceLeadId: "sf-lead-1" };
      },
      async loadLatestConversationInsights() {
        throw new Error("should not load conversation insights");
      },
      async loadLeadProfile() {
        throw new Error("should not load lead profile");
      },
      async loadConversationReadiness() {
        throw new Error("should not load readiness");
      },
      async loadLatestFollowUpDraft() {
        throw new Error("should not load drafts");
      },
      async createLeadTask() {
        taskCalled = true;
        return { success: true, taskId: "task-1" };
      }
    }
  });

  assert.equal(result.kind, "ok");
  assert.equal(taskCalled, false);
  if (result.kind === "ok") {
    assert.deepEqual(result.output, {
      operation: "salesforce_upsert_lead",
      crmSyncConfig: {
        recordType: "lead",
        matchBehavior: "upsert_by_email",
        sourceLabel: "Expo floor"
      },
      salesforceLeadId: "sf-lead-1",
      action: "updated"
    });
  }
});

test("runCrmSyncSalesforceStep creates a Salesforce task with account-scoped note content", async () => {
  const calls: Array<{ accountId: string; salesforceLeadId: string; noteBody: string }> = [];
  const result = await runCrmSyncSalesforceStep({
    ctx: makeCtx({
      includeAiNotes: true,
      includeSuggestedEmailDraftInCrmNote: true
    }),
    effectiveSyncConfig: SALESFORCE_SYNC_CONFIG,
    adapters: {
      async syncLead() {
        return { success: true, action: "created", salesforceLeadId: "sf-lead-2" };
      },
      async loadConversationReadiness() {
        return readyReadiness();
      },
      async loadLatestConversationInsights(input) {
        assert.equal(input.accountId, "account-1");
        assert.equal(input.leadId, "lead-1");
        return {
          summary: "Strong interest in post-event follow-up automation.",
          objections: ["Budget timing is still under review."],
          nextSteps: ["Share a pricing comparison with procurement."]
        };
      },
      async loadLeadProfile(input) {
        assert.equal(input.accountId, "account-1");
        assert.equal(input.leadId, "lead-1");
        return {
          fullName: "Sam Seller",
          email: "sam@example.com",
          companyText: "ProcureCo",
          jobTitle: "Director",
          rating: 5,
          temperature: "hot",
          status: "new"
        };
      },
      async loadLatestFollowUpDraft(input) {
        assert.equal(input.accountId, "account-1");
        assert.equal(input.leadId, "lead-1");
        assert.equal(input.runId, "run-1");
        return {
          subject: "Next steps after the event",
          bodyText: "Thanks again for the conversation."
        };
      },
      async createLeadTask(input) {
        calls.push(input);
        return { success: true, taskId: "task-2" };
      }
    }
  });

  assert.equal(result.kind, "ok");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.accountId, "account-1");
  assert.equal(calls[0]!.salesforceLeadId, "sf-lead-2");
  assert.match(calls[0]!.noteBody, /Lead Retrieval AI Follow-up Notes/);
  assert.match(calls[0]!.noteBody, /Strong interest in post-event follow-up automation\./);
  assert.match(calls[0]!.noteBody, /Budget timing is still under review\./);
  assert.match(calls[0]!.noteBody, /Recommended Follow-up/);
  assert.match(calls[0]!.noteBody, /Suggested Email Draft/);
  assert.match(calls[0]!.noteBody, /Next steps after the event/);
  assert.match(calls[0]!.noteBody, /Insight version: 2/);
  if (result.kind === "ok") {
    assert.equal(result.output.salesforceTaskId, "task-2");
  }
});

test("runCrmSyncSalesforceStep reports note failures as explicit partial failures", async () => {
  const result = await runCrmSyncSalesforceStep({
    ctx: makeCtx({
      includeAiNotes: true
    }),
    effectiveSyncConfig: SALESFORCE_SYNC_CONFIG,
    adapters: {
      async syncLead() {
        return { success: true, action: "created", salesforceLeadId: "sf-lead-3" };
      },
      async loadConversationReadiness() {
        return readyReadiness();
      },
      async loadLatestConversationInsights() {
        return {
          summary: null,
          objections: [],
          nextSteps: []
        };
      },
      async loadLeadProfile() {
        return null;
      },
      async loadLatestFollowUpDraft() {
        return null;
      },
      async createLeadTask() {
        return { success: false, error: "Task insert rejected by Salesforce." };
      }
    }
  });

  assert.equal(result.kind, "fail");
  if (result.kind === "fail") {
    assert.equal(result.errorCode, "crm_salesforce_note_failed");
    assert.match(result.errorText, /Lead synced, but follow-up note creation failed/i);
    assert.deepEqual(result.output, {
      operation: "salesforce_upsert_lead",
      crmSyncConfig: {
        recordType: "lead",
        matchBehavior: "upsert_by_email",
        sourceLabel: "Expo floor"
      },
      salesforceLeadId: "sf-lead-3",
      action: "created",
      partial_success: true,
      notes_requested: true,
      note_error: "Task insert rejected by Salesforce."
    });
  }
});

test("runCrmSyncSalesforceStep omits Suggested Email Draft when disabled", async () => {
  const calls: Array<{ noteBody: string }> = [];
  const result = await runCrmSyncSalesforceStep({
    ctx: makeCtx({
      includeAiNotes: true,
      includeSuggestedEmailDraftInCrmNote: false
    }),
    effectiveSyncConfig: SALESFORCE_SYNC_CONFIG,
    adapters: {
      async syncLead() {
        return { success: true, action: "updated", salesforceLeadId: "sf-lead-4" };
      },
      async loadConversationReadiness() {
        return readyReadiness();
      },
      async loadLatestConversationInsights() {
        return {
          summary: "Interested in automation.",
          objections: [],
          nextSteps: ["Send event follow-up examples."]
        };
      },
      async loadLeadProfile() {
        return null;
      },
      async loadLatestFollowUpDraft() {
        throw new Error("should not load suggested email draft when disabled");
      },
      async createLeadTask(input) {
        calls.push({ noteBody: input.noteBody });
        return { success: true, taskId: "task-4" };
      }
    }
  });

  assert.equal(result.kind, "ok");
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0]!.noteBody, /Suggested Email Draft/);
  assert.match(calls[0]!.noteBody, /Recommended Follow-up/);
});

test("runCrmSyncSalesforceStep waits for latest transcript before CRM side effects", async () => {
  let syncCalled = false;
  const result = await runCrmSyncSalesforceStep({
    ctx: makeCtx({
      includeAiNotes: true
    }),
    effectiveSyncConfig: SALESFORCE_SYNC_CONFIG,
    adapters: {
      async syncLead() {
        syncCalled = true;
        return { success: true, action: "updated", salesforceLeadId: "sf-lead-5" };
      },
      async loadConversationReadiness() {
        return {
          ...readyReadiness(),
          latestConversationVersion: 4,
          transcriptStatus: "processing",
          transcriptVersion: 3,
          insightsStatus: "ready",
          insightsVersion: 3
        };
      },
      async loadLatestConversationInsights() {
        throw new Error("should not load stale insights while waiting");
      },
      async loadLeadProfile() {
        throw new Error("should not load profile while waiting");
      },
      async loadLatestFollowUpDraft() {
        throw new Error("should not load draft while waiting");
      },
      async createLeadTask() {
        throw new Error("should not create Salesforce task while waiting");
      }
    }
  });

  assert.equal(syncCalled, false);
  assert.equal(result.kind, "wait");
  if (result.kind === "wait") {
    assert.equal(result.waitingReason, "waiting_for_audio_transcript");
    assert.equal(result.output.required_conversation_version, 4);
    assert.equal(result.output.current_transcript_version, 3);
  }
});
