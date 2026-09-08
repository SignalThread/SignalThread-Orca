import assert from "node:assert/strict";
import test from "node:test";
import { runCrmSyncHubspotStep } from "../lib/workflows/step-handlers/crm-sync-hubspot-runner";
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
    step_type: "crm_sync_hubspot",
    step_key: "crm_hubspot_sync",
    params_jsonb: {
      operation: "hubspot_upsert_contact",
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
    step_key: "crm_hubspot_sync",
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

const HUBSPOT_SYNC_CONFIG = resolveWorkflowCrmSyncConfig({
  provider: "hubspot",
  workflowMode: "override",
  workflowOverride: {
    recordType: "contact",
    matchBehavior: "update_existing",
    sourceLabel: "VIP campaign"
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

test("runCrmSyncHubspotStep keeps legacy contact sync behavior when AI notes are off", async () => {
  let noteCalled = false;
  const result = await runCrmSyncHubspotStep({
    ctx: makeCtx(),
    effectiveSyncConfig: HUBSPOT_SYNC_CONFIG,
    adapters: {
      async syncLead({ leadId, syncConfig }) {
        assert.equal(leadId, "lead-1");
        assert.equal(syncConfig.matchBehavior, "update_existing");
        assert.equal(syncConfig.sourceLabel, "VIP campaign");
        return { success: true, hubspotId: "12345" };
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
      async createContactNote() {
        noteCalled = true;
        return { success: true, noteId: "note-1" };
      }
    }
  });

  assert.equal(result.kind, "ok");
  assert.equal(noteCalled, false);
  if (result.kind === "ok") {
    assert.deepEqual(result.output, {
      operation: "hubspot_upsert_contact",
      crmSyncConfig: {
        recordType: "contact",
        matchBehavior: "update_existing",
        sourceLabel: "VIP campaign"
      },
      hubspotId: "12345"
    });
  }
});

test("runCrmSyncHubspotStep creates an associated HubSpot note when AI notes are enabled", async () => {
  const calls: Array<{ accountId: string; contactId: string; noteBody: string }> = [];
  const result = await runCrmSyncHubspotStep({
    ctx: makeCtx({
      includeAiNotes: true,
      includeSuggestedEmailDraftInCrmNote: true
    }),
    effectiveSyncConfig: HUBSPOT_SYNC_CONFIG,
    adapters: {
      async syncLead() {
        return { success: true, hubspotId: "67890" };
      },
      async loadConversationReadiness() {
        return readyReadiness();
      },
      async loadLatestConversationInsights(input) {
        assert.equal(input.accountId, "account-1");
        assert.equal(input.leadId, "lead-1");
        return {
          summary: "Wants better booth follow-up visibility.",
          objections: ["Needs buy-in from RevOps."],
          nextSteps: ["Share examples from similar event teams."]
        };
      },
      async loadLeadProfile(input) {
        assert.equal(input.accountId, "account-1");
        assert.equal(input.leadId, "lead-1");
        return {
          fullName: "Nina Buyer",
          email: "nina@example.com",
          companyText: "BuyerCo",
          jobTitle: "VP Marketing",
          rating: 4,
          temperature: "hot",
          status: "new"
        };
      },
      async loadLatestFollowUpDraft(input) {
        assert.equal(input.runId, "run-1");
        return {
          subject: "Following up after the event",
          bodyText: "Thanks again for stopping by."
        };
      },
      async createContactNote(input) {
        calls.push(input);
        return { success: true, noteId: "note-2" };
      }
    }
  });

  assert.equal(result.kind, "ok");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.accountId, "account-1");
  assert.equal(calls[0]!.contactId, "67890");
  assert.match(calls[0]!.noteBody, /Lead Retrieval AI Follow-up Notes/);
  assert.match(calls[0]!.noteBody, /Lead Summary/);
  assert.match(calls[0]!.noteBody, /Wants better booth follow-up visibility\./);
  assert.match(calls[0]!.noteBody, /Needs buy-in from RevOps\./);
  assert.match(calls[0]!.noteBody, /Suggested Email Draft/);
  assert.match(calls[0]!.noteBody, /Following up after the event/);
  assert.match(calls[0]!.noteBody, /Insight version: 2/);
  if (result.kind === "ok") {
    assert.equal(result.output.hubspotNoteId, "note-2");
    assert.deepEqual(result.output.crmConversationData, {
      transcriptVersion: 2,
      insightsVersion: 2,
      generatedAt: result.output.crmConversationData &&
        typeof result.output.crmConversationData === "object" &&
        "generatedAt" in result.output.crmConversationData
        ? (result.output.crmConversationData as Record<string, unknown>).generatedAt
        : undefined
    });
  }
});

test("runCrmSyncHubspotStep reports note failures as partial failures", async () => {
  const result = await runCrmSyncHubspotStep({
    ctx: makeCtx({
      includeAiNotes: true
    }),
    effectiveSyncConfig: HUBSPOT_SYNC_CONFIG,
    adapters: {
      async syncLead() {
        return { success: true, hubspotId: "13579" };
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
      async createContactNote() {
        return { success: false, error: "HubSpot note creation failed upstream." };
      }
    }
  });

  assert.equal(result.kind, "fail");
  if (result.kind === "fail") {
    assert.equal(result.errorCode, "crm_hubspot_note_failed");
    assert.match(result.errorText, /HubSpot contact synced, but AI note creation failed/i);
    assert.deepEqual(result.output, {
      operation: "hubspot_upsert_contact",
      crmSyncConfig: {
        recordType: "contact",
        matchBehavior: "update_existing",
        sourceLabel: "VIP campaign"
      },
      hubspotId: "13579",
      partial_success: true,
      notes_requested: true,
      note_error: "HubSpot note creation failed upstream."
    });
  }
});

test("runCrmSyncHubspotStep omits Suggested Email Draft when disabled", async () => {
  const calls: Array<{ noteBody: string }> = [];
  const result = await runCrmSyncHubspotStep({
    ctx: makeCtx({
      includeAiNotes: true,
      includeSuggestedEmailDraftInCrmNote: false
    }),
    effectiveSyncConfig: HUBSPOT_SYNC_CONFIG,
    adapters: {
      async syncLead() {
        return { success: true, hubspotId: "67890" };
      },
      async loadConversationReadiness() {
        return readyReadiness();
      },
      async loadLatestConversationInsights() {
        return {
          summary: "Good discussion.",
          objections: [],
          nextSteps: ["Send a demo invite."]
        };
      },
      async loadLeadProfile() {
        return null;
      },
      async loadLatestFollowUpDraft() {
        throw new Error("should not load suggested email draft when disabled");
      },
      async createContactNote(input) {
        calls.push({ noteBody: input.noteBody });
        return { success: true, noteId: "note-3" };
      }
    }
  });

  assert.equal(result.kind, "ok");
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0]!.noteBody, /Suggested Email Draft/);
  assert.match(calls[0]!.noteBody, /Recommended Follow-up/);
});

test("runCrmSyncHubspotStep waits for conversation insights before CRM side effects", async () => {
  let syncCalled = false;
  const result = await runCrmSyncHubspotStep({
    ctx: makeCtx({
      includeAiNotes: true,
      includeSuggestedEmailDraftInCrmNote: true
    }),
    effectiveSyncConfig: HUBSPOT_SYNC_CONFIG,
    adapters: {
      async syncLead() {
        syncCalled = true;
        return { success: true, hubspotId: "67890" };
      },
      async loadConversationReadiness() {
        return {
          ...readyReadiness(),
          transcriptStatus: "ready",
          transcriptVersion: 3,
          insightsStatus: "processing",
          insightsVersion: 2,
          latestConversationVersion: 3
        };
      },
      async loadLatestConversationInsights() {
        throw new Error("should not load stale conversation insights");
      },
      async loadLeadProfile() {
        throw new Error("should not load lead profile while waiting");
      },
      async loadLatestFollowUpDraft() {
        throw new Error("should not load draft while waiting");
      },
      async createContactNote() {
        throw new Error("should not create note while waiting");
      }
    }
  });

  assert.equal(syncCalled, false);
  assert.equal(result.kind, "wait");
  if (result.kind === "wait") {
    assert.equal(result.waitingReason, "waiting_for_conversation_insights");
    assert.equal(result.output.required_conversation_version, 3);
    assert.equal(result.output.current_insights_version, 2);
  }
});
