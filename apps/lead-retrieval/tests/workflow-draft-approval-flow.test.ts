import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approveDraftAndResumeRun,
  rejectDraftAndCancelRun
} from "../lib/workflows/approval/draft-approval-core";
import { buildWorkflowHandlerRegistry } from "../lib/workflows/contracts/step-handler";
import type { WorkflowHandler } from "../lib/workflows/contracts/step-handler";
import { createFakeSupabase, asAdminClient } from "./helpers/fake-supabase";
import type { createAdminClient } from "../lib/supabase/admin";

function seedAwaitingApprovalState(opts?: {
  includeNextStep?: boolean;
  draftStatus?: "pending" | "approved" | "rejected" | "sent";
  draftCompanyId?: string;
  futureScheduledAt?: string;
  includePromotionPayload?: boolean;
  executeOnApproval?: boolean;
}) {
  const includeNext = opts?.includeNextStep ?? true;
  const draftStatus = opts?.draftStatus ?? "pending";
  const draftCompanyId = opts?.draftCompanyId ?? "co-1";
  const futureScheduledAt = opts?.futureScheduledAt ?? "2099-01-01T00:00:00.000Z";

  const stepRuns: Array<Record<string, unknown>> = [
    {
      id: "step-run-0",
      run_id: "run-1",
      step_id: "step-0",
      step_index: 0,
      step_key: "compose",
      status: "awaiting_approval",
      attempt_count: 1,
      attempt_id: "att-1",
      scheduled_at: "2026-05-13T01:00:00.000Z",
      started_at: "2026-05-13T01:00:00.000Z",
      completed_at: null,
      input_jsonb: null,
      output_jsonb: { outcome: "draft_pending_review" },
      error_text: null,
      error_code: null,
      created_at: "2026-05-13T01:00:00.000Z",
      updated_at: "2026-05-13T01:00:00.000Z"
    }
  ];
  if (includeNext) {
    stepRuns.push({
      id: "step-run-1",
      run_id: "run-1",
      step_id: "step-1",
      step_index: 1,
      step_key: "later_step",
      status: "queued",
      attempt_count: 0,
      attempt_id: null,
      scheduled_at: futureScheduledAt,
      started_at: null,
      completed_at: null,
      input_jsonb: null,
      output_jsonb: null,
      error_text: null,
      error_code: null,
      created_at: "2026-05-13T01:00:00.000Z",
      updated_at: "2026-05-13T01:00:00.000Z"
    });
  }

  const draftContent = opts?.includePromotionPayload
    ? {
        subject: "Hi Ada",
        body_text: "Hi Ada,\n\nGreat chatting.\n\nBest,\nMe",
        body_html: null,
        workflow_campaign_name: "Workflow Draft - Lead Intel - Ada - run-1",
        subject_template: "Hi {{first_name}}",
        signal_ids_used: ["sig-1"]
      }
    : opts?.executeOnApproval
      ? {
          approval_execution_mode: "execute_step_on_approval",
          approval_required: true,
          step_type: "compose_campaign_draft",
          step_key: "compose",
          subject: "Hi {{first_name}}",
          subject_template: "Hi {{first_name}}"
        }
      : { subject: "Hi", body_text: "Body" };

  return createFakeSupabase({
    workflow_runs: [
      {
        id: "run-1",
        company_id: "co-1",
        template_id: "tpl-1",
        template_version: 1,
        lead_id: "lead-1",
        event_id: null,
        trigger_event: "lead_captured",
        trigger_payload_jsonb: {},
        status: "awaiting_approval",
        current_step_index: 0,
        started_at: "2026-05-13T01:00:00.000Z",
        completed_at: null,
        created_at: "2026-05-13T01:00:00.000Z",
        updated_at: "2026-05-13T01:00:00.000Z"
      }
    ],
    workflow_steps: [
      {
        id: "step-0",
        template_id: "tpl-1",
        step_index: 0,
        step_type: "compose_campaign_draft",
        step_key: "compose",
        params_jsonb: {},
        requires_approval: true,
        created_at: "2026-05-13T01:00:00.000Z",
        updated_at: "2026-05-13T01:00:00.000Z"
      }
    ],
    workflow_step_runs: stepRuns,
    generated_drafts: [
      {
        id: "draft-1",
        company_id: draftCompanyId,
        lead_id: "lead-1",
        event_id: null,
        run_id: "run-1",
        step_run_id: "step-run-0",
        kind: "email",
        content_jsonb: draftContent,
        approval_status: draftStatus,
        reviewed_by: null,
        reviewed_at: null,
        promoted_to_id: null,
        created_at: "2026-05-13T01:00:00.000Z",
        updated_at: "2026-05-13T01:00:00.000Z"
      }
    ],
    campaigns: [],
    campaign_recipients: [],
    campaign_messages: []
  });
}

function approvalExecutionHandler(calls: { count: number }): WorkflowHandler {
  return {
    stepType: "compose_campaign_draft",
    displayName: "approval execution handler",
    run: async () => {
      calls.count += 1;
      return {
        kind: "draft",
        output: {
          outcome: "draft_pending_review",
          subject_preview: "Hi Ada",
          body_preview: "Hi Ada,\n\nGreat chatting.",
          model: "gpt-test"
        },
        drafts: [
          {
            kind: "email",
            content: {
              subject: "Hi Ada",
              body_text: "Hi Ada,\n\nGreat chatting.\n\nBest,\nMe",
              body_html: null,
              workflow_campaign_name: "Workflow Draft - Lead Intel - Ada - run-1",
              subject_template: "Hi {{first_name}}",
              signal_ids_used: ["sig-1"]
            }
          }
        ]
      };
    }
  };
}

function approvalGatedCrmHandler(calls: { count: number }): WorkflowHandler {
  return {
    stepType: "crm_sync_hubspot",
    displayName: "approval gated CRM",
    run: async (ctx) => {
      calls.count += 1;
      const prior = ctx.previousStepOutputs.enrich as Record<string, unknown> | undefined;
      assert.equal(prior?.outcome, "enriched");
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

describe("approveDraftAndResumeRun", () => {
  it("approves a pending draft, marks the paused step completed, and schedules the next step", async () => {
    const fake = seedAwaitingApprovalState();
    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.draft.approval_status, "approved");
    assert.equal(result.nextStepScheduled, true);

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts[0].approval_status, "approved");
    assert.equal(drafts[0].reviewed_by, "user-1");
    assert.ok(drafts[0].reviewed_at);

    const stepRuns = fake._tables.workflow_step_runs as Array<Record<string, unknown>>;
    const paused = stepRuns.find((r) => r.id === "step-run-0")!;
    assert.equal(paused.status, "completed");
    // output_jsonb on the previously-paused step run is preserved (observability):
    assert.deepEqual(paused.output_jsonb, { outcome: "draft_pending_review" });

    const next = stepRuns.find((r) => r.id === "step-run-1")!;
    assert.notEqual(next.scheduled_at, "2099-01-01T00:00:00.000Z");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "queued");
    assert.equal(run.current_step_index, 1);
    assert.equal(run.completed_at, null);
  });

  it("completes the run when there is no next step", async () => {
    const fake = seedAwaitingApprovalState({ includeNextStep: false });
    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.nextStepScheduled, false);
    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "completed");
    assert.ok(run.completed_at);
  });

  it("promotes the pending payload into exactly one official campaign draft on approval", async () => {
    const fake = seedAwaitingApprovalState({
      includeNextStep: false,
      includePromotionPayload: true
    });
    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" },
      nowIso: "2026-05-13T02:00:00.000Z"
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const campaigns = fake._tables.campaigns as Array<Record<string, unknown>>;
    const recipients = fake._tables.campaign_recipients as Array<Record<string, unknown>>;
    const messages = fake._tables.campaign_messages as Array<Record<string, unknown>>;
    assert.equal(campaigns.length, 1);
    assert.equal(recipients.length, 1);
    assert.equal(messages.length, 1);
    assert.equal(campaigns[0].name, "Workflow Draft - Lead Intel - Ada - run-1");
    assert.equal(campaigns[0].status, "draft");
    assert.equal(messages[0].status, "draft");
    assert.equal(messages[0].subject, "Hi Ada");

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts[0].approval_status, "approved");
    assert.equal(drafts[0].promoted_to_id, messages[0].id);

    const stepRun = (fake._tables.workflow_step_runs as Array<Record<string, unknown>>)[0]!;
    const output = stepRun.output_jsonb as Record<string, unknown>;
    assert.equal(output.outcome, "campaign_draft_created");
    assert.equal(output.campaign_id, campaigns[0].id);
    assert.equal(output.campaign_recipient_id, recipients[0].id);
    assert.equal(output.campaign_message_id, messages[0].id);

    const second = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" },
      nowIso: "2026-05-13T02:01:00.000Z"
    });
    assert.equal(second.ok, false);
    assert.equal((fake._tables.campaigns as Array<Record<string, unknown>>).length, 1);
    assert.equal((fake._tables.campaign_recipients as Array<Record<string, unknown>>).length, 1);
    assert.equal((fake._tables.campaign_messages as Array<Record<string, unknown>>).length, 1);
  });

  it("executes approval-gated campaign draft only on approve and promotes exactly one official artifact", async () => {
    const fake = seedAwaitingApprovalState({
      includeNextStep: false,
      executeOnApproval: true
    });
    const calls = { count: 0 };
    const registry = buildWorkflowHandlerRegistry([approvalExecutionHandler(calls)]);

    assert.equal((fake._tables.campaigns as Array<Record<string, unknown>>).length, 0);
    assert.equal((fake._tables.campaign_messages as Array<Record<string, unknown>>).length, 0);

    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" },
      registry,
      nowIso: "2026-05-13T02:00:00.000Z"
    });
    assert.equal(result.ok, true);
    assert.equal(calls.count, 1);
    if (!result.ok) return;

    const campaigns = fake._tables.campaigns as Array<Record<string, unknown>>;
    const messages = fake._tables.campaign_messages as Array<Record<string, unknown>>;
    assert.equal(campaigns.length, 1);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].subject, "Hi Ada");

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts[0].approval_status, "approved");
    const approvedContent = drafts[0].content_jsonb as Record<string, unknown>;
    assert.equal(approvedContent.subject, "Hi Ada");
    assert.equal(approvedContent.approval_execution_mode, undefined);
    assert.equal(drafts[0].promoted_to_id, messages[0].id);

    const stepRun = (fake._tables.workflow_step_runs as Array<Record<string, unknown>>)[0]!;
    assert.equal(stepRun.status, "completed");
    const output = stepRun.output_jsonb as Record<string, unknown>;
    assert.equal(output.outcome, "campaign_draft_created");
    assert.equal(output.campaign_message_id, messages[0].id);

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "completed");

    const second = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" },
      registry,
      nowIso: "2026-05-13T02:01:00.000Z"
    });
    assert.equal(second.ok, false);
    assert.equal(calls.count, 1);
    assert.equal((fake._tables.campaigns as Array<Record<string, unknown>>).length, 1);
    assert.equal((fake._tables.campaign_messages as Array<Record<string, unknown>>).length, 1);
  });

  it("executes approval-gated CRM sync only on approve and resumes the following step", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [
        {
          id: "run-1",
          company_id: "co-1",
          template_id: "tpl-1",
          template_version: 1,
          lead_id: "lead-1",
          event_id: null,
          trigger_event: "lead_captured",
          trigger_payload_jsonb: {},
          status: "awaiting_approval",
          current_step_index: 1,
          started_at: "2026-05-13T01:00:00.000Z",
          completed_at: null,
          created_at: "2026-05-13T01:00:00.000Z",
          updated_at: "2026-05-13T01:00:00.000Z"
        }
      ],
      workflow_steps: [
        {
          id: "step-0",
          template_id: "tpl-1",
          step_index: 0,
          step_type: "enrich_lead",
          step_key: "enrich",
          params_jsonb: {},
          requires_approval: false,
          created_at: "2026-05-13T01:00:00.000Z",
          updated_at: "2026-05-13T01:00:00.000Z"
        },
        {
          id: "step-1",
          template_id: "tpl-1",
          step_index: 1,
          step_type: "crm_sync_hubspot",
          step_key: "crm_hubspot_sync",
          params_jsonb: {},
          requires_approval: true,
          created_at: "2026-05-13T01:00:00.000Z",
          updated_at: "2026-05-13T01:00:00.000Z"
        },
        {
          id: "step-2",
          template_id: "tpl-1",
          step_index: 2,
          step_type: "follow_up_task",
          step_key: "follow_up_task",
          params_jsonb: {},
          requires_approval: false,
          created_at: "2026-05-13T01:00:00.000Z",
          updated_at: "2026-05-13T01:00:00.000Z"
        }
      ],
      workflow_step_runs: [
        {
          id: "step-run-0",
          run_id: "run-1",
          step_id: "step-0",
          step_index: 0,
          step_key: "enrich",
          status: "completed",
          attempt_count: 1,
          attempt_id: "att-0",
          scheduled_at: "2026-05-13T01:00:00.000Z",
          started_at: "2026-05-13T01:00:00.000Z",
          completed_at: "2026-05-13T01:00:30.000Z",
          input_jsonb: null,
          output_jsonb: { outcome: "enriched" },
          error_text: null,
          error_code: null,
          created_at: "2026-05-13T01:00:00.000Z",
          updated_at: "2026-05-13T01:00:30.000Z"
        },
        {
          id: "step-run-1",
          run_id: "run-1",
          step_id: "step-1",
          step_index: 1,
          step_key: "crm_hubspot_sync",
          status: "awaiting_approval",
          attempt_count: 1,
          attempt_id: "att-1",
          scheduled_at: "2026-05-13T01:01:00.000Z",
          started_at: "2026-05-13T01:01:00.000Z",
          completed_at: null,
          input_jsonb: null,
          output_jsonb: { outcome: "pending_approval", approval_required: true },
          error_text: null,
          error_code: null,
          created_at: "2026-05-13T01:01:00.000Z",
          updated_at: "2026-05-13T01:01:00.000Z"
        },
        {
          id: "step-run-2",
          run_id: "run-1",
          step_id: "step-2",
          step_index: 2,
          step_key: "follow_up_task",
          status: "queued",
          attempt_count: 0,
          attempt_id: null,
          scheduled_at: "2099-01-01T00:00:00.000Z",
          started_at: null,
          completed_at: null,
          input_jsonb: null,
          output_jsonb: null,
          error_text: null,
          error_code: null,
          created_at: "2026-05-13T01:01:00.000Z",
          updated_at: "2026-05-13T01:01:00.000Z"
        }
      ],
      generated_drafts: [
        {
          id: "draft-1",
          company_id: "co-1",
          lead_id: "lead-1",
          event_id: null,
          run_id: "run-1",
          step_run_id: "step-run-1",
          kind: "email",
          content_jsonb: {
            approval_execution_mode: "execute_step_on_approval",
            approval_required: true,
            workflow_run_id: "run-1",
            workflow_id: "tpl-1",
            step_id: "step-1",
            step_index: 1,
            step_type: "crm_sync_hubspot",
            action_type: "crm_sync_hubspot",
            action_label: "HubSpot CRM Sync",
            proposed_output_summary: "HubSpot CRM Sync pending approval"
          },
          approval_status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          promoted_to_id: null,
          created_at: "2026-05-13T01:01:00.000Z",
          updated_at: "2026-05-13T01:01:00.000Z"
        }
      ],
      campaigns: [],
      campaign_recipients: [],
      campaign_messages: []
    });
    const calls = { count: 0 };
    const registry = buildWorkflowHandlerRegistry([approvalGatedCrmHandler(calls)]);

    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" },
      registry,
      nowIso: "2026-05-13T02:00:00.000Z"
    });

    assert.equal(result.ok, true);
    assert.equal(calls.count, 1);
    if (!result.ok) return;
    assert.equal(result.nextStepScheduled, true);

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts[0].approval_status, "approved");
    assert.deepEqual(drafts[0].content_jsonb, {
      outcome: "crm_synced",
      provider: "hubspot",
      contact_id: "contact-1"
    });

    const stepRuns = fake._tables.workflow_step_runs as Array<Record<string, unknown>>;
    const approvedStep = stepRuns.find((step) => step.id === "step-run-1")!;
    assert.equal(approvedStep.status, "completed");
    assert.deepEqual(approvedStep.output_jsonb, {
      outcome: "crm_synced",
      approval_required: true,
      provider: "hubspot",
      contact_id: "contact-1"
    });
    const nextStep = stepRuns.find((step) => step.id === "step-run-2")!;
    assert.equal(nextStep.status, "queued");
    assert.equal(nextStep.scheduled_at, "2026-05-13T02:00:00.000Z");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "queued");
    assert.equal(run.current_step_index, 2);

    const second = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" },
      registry,
      nowIso: "2026-05-13T02:01:00.000Z"
    });
    assert.equal(second.ok, false);
    assert.equal(calls.count, 1);
  });

  it("returns 404 for an unknown draft id", async () => {
    const fake = seedAwaitingApprovalState();
    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "missing",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "not_found");
  });

  it("returns 403 (forbidden) when the reviewer's company_id mismatches the draft's company_id", async () => {
    const fake = seedAwaitingApprovalState({ draftCompanyId: "co-2" });
    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "forbidden");
    // Critical: the draft state must not change on a failed authorization.
    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts[0].approval_status, "pending");
  });

  it("returns 409 (conflict) on double-approve", async () => {
    const fake = seedAwaitingApprovalState({ draftStatus: "approved" });
    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "conflict");
  });

  it("returns 409 when trying to approve an already-rejected draft", async () => {
    const fake = seedAwaitingApprovalState({ draftStatus: "rejected" });
    const result = await approveDraftAndResumeRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "conflict");
  });
});

describe("rejectDraftAndCancelRun", () => {
  it("marks draft rejected, fails the paused step, and CANCELS the workflow run", async () => {
    const fake = seedAwaitingApprovalState();
    const result = await rejectDraftAndCancelRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" },
      reason: "Wrong tone"
    });
    assert.equal(result.ok, true);

    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts[0].approval_status, "rejected");
    assert.equal(drafts[0].reviewed_by, "user-1");

    const stepRuns = fake._tables.workflow_step_runs as Array<Record<string, unknown>>;
    const paused = stepRuns.find((r) => r.id === "step-run-0")!;
    assert.equal(paused.status, "failed");
    assert.equal(paused.error_code, "draft_rejected");
    assert.equal(paused.error_text, "Wrong tone");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "cancelled");
    assert.ok(run.completed_at);
  });

  it("does not create an official draft artifact when the approval is rejected", async () => {
    const fake = seedAwaitingApprovalState({ includePromotionPayload: true });
    const result = await rejectDraftAndCancelRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, true);
    assert.equal((fake._tables.campaigns as Array<Record<string, unknown>>).length, 0);
    assert.equal((fake._tables.campaign_recipients as Array<Record<string, unknown>>).length, 0);
    assert.equal((fake._tables.campaign_messages as Array<Record<string, unknown>>).length, 0);
  });

  it("prevents downstream send/sync continuation: next step is NOT scheduled after rejection", async () => {
    const fake = seedAwaitingApprovalState({
      includeNextStep: true,
      futureScheduledAt: "2099-01-01T00:00:00.000Z"
    });
    await rejectDraftAndCancelRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    const stepRuns = fake._tables.workflow_step_runs as Array<Record<string, unknown>>;
    const next = stepRuns.find((r) => r.id === "step-run-1")!;
    assert.equal(next.scheduled_at, "2099-01-01T00:00:00.000Z");
    assert.equal(next.status, "queued");

    // And because the run is cancelled, even if the worker claims the next step, it
    // SHOULD short-circuit (see workflow_runs_active_unique partial index excluding cancelled).
    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "cancelled");
  });

  it("returns 403 on cross-company access without mutating any state", async () => {
    const fake = seedAwaitingApprovalState({ draftCompanyId: "co-2" });
    const result = await rejectDraftAndCancelRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "forbidden");
    const drafts = fake._tables.generated_drafts as Array<Record<string, unknown>>;
    assert.equal(drafts[0].approval_status, "pending");
    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "awaiting_approval");
  });

  it("returns 409 when trying to reject an already-approved draft (cannot undo send-able state)", async () => {
    const fake = seedAwaitingApprovalState({ draftStatus: "approved" });
    const result = await rejectDraftAndCancelRun({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      draftId: "draft-1",
      context: { reviewerUserId: "user-1", reviewerCompanyId: "co-1" }
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "conflict");
  });
});
