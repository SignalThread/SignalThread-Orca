import assert from "node:assert/strict";
import test from "node:test";
import { createFakeSupabase, asAdminClient } from "./helpers/fake-supabase";
import type { createSupabaseServerClient } from "../lib/supabase/server";
import {
  loadLeadIdsForWorkflowStatus,
  loadPendingWorkflowApprovalCount,
  loadWorkflowActivityRecords,
  loadWorkflowSummariesForLeads
} from "../lib/exhibitor/workflows/workflow-lead-activity";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

test("workflow pending approval filter returns only leads with pending generated drafts", async () => {
  const fake = createFakeSupabase({
    generated_drafts: [
      {
        id: "draft-1",
        company_id: "company-1",
        lead_id: "lead-1",
        event_id: "event-1",
        run_id: "run-1",
        step_run_id: "step-run-1",
        kind: "email",
        content_jsonb: {},
        approval_status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        promoted_to_id: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      },
      {
        id: "draft-2",
        company_id: "company-1",
        lead_id: "lead-2",
        event_id: "event-1",
        run_id: "run-2",
        step_run_id: "step-run-2",
        kind: "email",
        content_jsonb: {},
        approval_status: "approved",
        reviewed_by: "user-1",
        reviewed_at: "2026-06-22T11:00:00.000Z",
        promoted_to_id: null,
        created_at: "2026-06-22T09:00:00.000Z",
        updated_at: "2026-06-22T11:00:00.000Z"
      }
    ],
    workflow_runs: []
  });

  const ids = await loadLeadIdsForWorkflowStatus({
    supabase: asAdminClient<ServerClient>(fake),
    companyId: "company-1",
    eventId: "event-1",
    status: "pending_approval"
  });

  assert.deepEqual(ids, ["lead-1"]);
});

test("pending workflow approval count is scoped by company and event", async () => {
  const fake = createFakeSupabase({
    generated_drafts: [
      {
        id: "draft-1",
        company_id: "company-1",
        lead_id: "lead-1",
        event_id: "event-1",
        run_id: "run-1",
        step_run_id: "step-run-1",
        kind: "email",
        content_jsonb: {},
        approval_status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        promoted_to_id: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      },
      {
        id: "draft-2",
        company_id: "company-1",
        lead_id: "lead-2",
        event_id: "event-2",
        run_id: "run-2",
        step_run_id: "step-run-2",
        kind: "email",
        content_jsonb: {},
        approval_status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        promoted_to_id: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      },
      {
        id: "draft-3",
        company_id: "company-2",
        lead_id: "lead-3",
        event_id: "event-1",
        run_id: "run-3",
        step_run_id: "step-run-3",
        kind: "email",
        content_jsonb: {},
        approval_status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        promoted_to_id: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      },
      {
        id: "draft-4",
        company_id: "company-1",
        lead_id: "lead-4",
        event_id: "event-1",
        run_id: "run-4",
        step_run_id: "step-run-4",
        kind: "email",
        content_jsonb: {},
        approval_status: "approved",
        reviewed_by: "user-1",
        reviewed_at: "2026-06-22T11:00:00.000Z",
        promoted_to_id: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T11:00:00.000Z"
      }
    ],
    workflow_runs: []
  });

  const count = await loadPendingWorkflowApprovalCount({
    supabase: asAdminClient<ServerClient>(fake),
    companyId: "company-1",
    eventId: "event-1"
  });

  assert.equal(count, 1);
});

test("workflow approval activity records include lead metadata, action type, and proposed payload", async () => {
  const fake = createFakeSupabase({
    generated_drafts: [
      {
        id: "draft-1",
        company_id: "company-1",
        lead_id: "lead-1",
        event_id: "event-1",
        run_id: "run-1",
        step_run_id: "step-run-1",
        kind: "email",
        content_jsonb: { subject: "Follow up", body_text: "Thanks for stopping by." },
        approval_status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        promoted_to_id: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      }
    ],
    workflow_runs: [
      {
        id: "run-1",
        company_id: "company-1",
        template_id: "workflow-1",
        template_version: 1,
        lead_id: "lead-1",
        event_id: "event-1",
        trigger_event: "lead_captured",
        trigger_payload_jsonb: {},
        trigger_fingerprint: "default",
        status: "awaiting_approval",
        current_step_index: 0,
        started_at: null,
        completed_at: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      }
    ],
    workflow_step_runs: [
      {
        id: "step-run-1",
        run_id: "run-1",
        step_id: "step-1",
        step_index: 0,
        step_key: "compose_draft",
        status: "awaiting_approval",
        attempt_count: 1,
        attempt_id: null,
        scheduled_at: "2026-06-22T10:00:00.000Z",
        started_at: "2026-06-22T10:00:00.000Z",
        completed_at: null,
        input_jsonb: {},
        output_jsonb: {},
        error_text: null,
        error_code: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      }
    ],
    workflow_templates: [
      {
        id: "workflow-1",
        company_id: "company-1",
        name: "Hot lead follow-up",
        description: null,
        trigger_event: "lead_captured",
        scope: "event",
        event_id: "event-1",
        is_enabled: true,
        version: 1,
        created_by: "user-1",
        created_at: "2026-06-22T09:00:00.000Z",
        updated_at: "2026-06-22T09:00:00.000Z",
        trigger_conditions_jsonb: {}
      }
    ],
    leads: [
      {
        id: "lead-1",
        company_id: "company-1",
        event_id: "event-1",
        full_name: "Test Lead",
        email: "lead@example.com",
        company_text: "Example Co"
      }
    ]
  });

  const records = await loadWorkflowActivityRecords({
    supabase: asAdminClient<ServerClient>(fake),
    companyId: "company-1",
    eventId: "event-1",
    leadId: null,
    status: "pending_approval"
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]!.lead_name, "Test Lead");
  assert.equal(records[0]!.lead_email, "lead@example.com");
  assert.equal(records[0]!.lead_company, "Example Co");
  assert.equal(records[0]!.template_name, "Hot lead follow-up");
  assert.equal(records[0]!.step_key, "compose_draft");
  assert.deepEqual(records[0]!.content, { subject: "Follow up", body_text: "Thanks for stopping by." });
});

test("workflow lead summaries include pending approval counts and canonical review href", async () => {
  const fake = createFakeSupabase({
    generated_drafts: [
      {
        id: "draft-1",
        company_id: "company-1",
        lead_id: "lead-1",
        event_id: "event-1",
        run_id: "run-1",
        step_run_id: "step-run-1",
        kind: "email",
        content_jsonb: {},
        approval_status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        promoted_to_id: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      }
    ],
    workflow_runs: [
      {
        id: "run-1",
        company_id: "company-1",
        template_id: "workflow-1",
        template_version: 1,
        lead_id: "lead-1",
        event_id: "event-1",
        trigger_event: "lead_captured",
        trigger_payload_jsonb: {},
        trigger_fingerprint: "default",
        status: "awaiting_approval",
        current_step_index: 0,
        started_at: null,
        completed_at: null,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z"
      }
    ]
  });

  const summaries = await loadWorkflowSummariesForLeads({
    supabase: asAdminClient<ServerClient>(fake),
    companyId: "company-1",
    eventId: "event-1",
    leadIds: ["lead-1"]
  });

  assert.equal(summaries["lead-1"]!.pendingApprovalCount, 1);
  assert.equal(
    summaries["lead-1"]!.reviewHref,
    "/exhibitor/workflows/workflow-1?runId=run-1&eventId=event-1#draft-draft-1"
  );
});
