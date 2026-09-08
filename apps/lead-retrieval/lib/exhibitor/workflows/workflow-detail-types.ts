/**
 * Serializable shapes for the exhibitor workflow detail page (server → client props).
 */

import type { WorkflowScope, WorkflowTriggerEvent } from "@/lib/workflows/contracts/workflow-types";

export type WorkflowDetailStepRow = {
  id: string;
  step_index: number;
  step_type: string;
  step_key: string;
  requires_approval: boolean;
  params_jsonb: Record<string, unknown>;
};

export type WorkflowDetailTemplate = {
  id: string;
  name: string;
  description: string | null;
  trigger_event: WorkflowTriggerEvent;
  scope: WorkflowScope;
  event_id: string | null;
  is_enabled: boolean;
  version: number;
  trigger_conditions_jsonb: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowDetailComposeSignal = {
  id: string;
  name: string;
};

export type WorkflowRunSummaryRow = {
  id: string;
  status: string;
  lead_id: string;
  current_step_index: number | null;
  template_version: number;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type LeadSummaryMini = {
  id: string;
  full_name: string;
  email: string | null;
  company_text: string | null;
};

export type WorkflowStepRunDetailRow = {
  id: string;
  step_index: number;
  step_key: string;
  step_type: string;
  status: string;
  attempt_count: number;
  output_jsonb: Record<string, unknown> | null;
  error_code: string | null;
  error_text: string | null;
  waiting_reason: string | null;
  required_conversation_version: number | null;
  current_transcript_version: number | null;
  current_insights_version: number | null;
  wait_started_at: string | null;
  wait_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type WorkflowDraftDetailRow = {
  id: string;
  run_id: string;
  lead_id: string;
  step_run_id: string;
  kind: string;
  approval_status: string;
  subject_preview: string | null;
  body_preview: string | null;
  campaign_id: string | null;
  campaign_message_id: string | null;
  promoted_to_id: string | null;
  created_at: string;
};

export type WorkflowPendingApprovalDetail = {
  draft: WorkflowDraftDetailRow;
  run: WorkflowRunSummaryRow;
  lead: LeadSummaryMini | null;
  step_label: string | null;
};

export type WorkflowDetailRunFilter = "all" | "awaiting_approval" | "completed" | "failed" | "active";

export type WorkflowDetailRunPagination = {
  pageSize: number;
  hasMore: boolean;
  nextCursor: string | null;
};

/** Full payload assembled by {@link loadWorkflowDetailPage}. */
export type WorkflowDetailLoadResult = {
  template: WorkflowDetailTemplate | null;
  steps: WorkflowDetailStepRow[];
  composeSignals: WorkflowDetailComposeSignal[];
  runs: WorkflowRunSummaryRow[];
  runFilter: WorkflowDetailRunFilter;
  runPagination: WorkflowDetailRunPagination;
  leads: LeadSummaryMini[];
  selectedRunId: string | null;
  stepRuns: WorkflowStepRunDetailRow[];
  drafts: WorkflowDraftDetailRow[];
  pendingApprovals: WorkflowPendingApprovalDetail[];
  selectedApprovalId: string | null;
};
