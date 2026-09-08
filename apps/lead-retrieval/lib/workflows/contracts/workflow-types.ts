/**
 * Canonical workflow domain types.
 *
 * These mirror the schema in supabase/migrations/0071_workflow_automation_foundation.sql.
 * Keep them as the only source of truth for the workflow runtime; do not duplicate
 * inline string literals in handlers or callers.
 */

import type { EventContainerKind } from "@/lib/events/event-container-kind";

export const WORKFLOW_TRIGGER_EVENTS = ["lead_captured"] as const;
export type WorkflowTriggerEvent = (typeof WORKFLOW_TRIGGER_EVENTS)[number];

/**
 * Template scope axis. Mirrors {@link EventContainerKind} plus a wildcard.
 *
 * - `event`              — only fires for leads in a finite event container
 * - `continuous_capture` — only fires for leads in a CC bucket
 * - `any`                — fires regardless of container (incl. leads with `event_id IS NULL`)
 */
export const WORKFLOW_SCOPES = ["event", "continuous_capture", "any"] as const;
export type WorkflowScope = (typeof WORKFLOW_SCOPES)[number];

export const WORKFLOW_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_for_audio_transcript",
  "waiting_for_conversation_insights",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled"
] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export const WORKFLOW_STEP_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_for_audio_transcript",
  "waiting_for_conversation_insights",
  "completed",
  "failed",
  "skipped",
  "awaiting_approval"
] as const;
export type WorkflowStepRunStatus = (typeof WORKFLOW_STEP_RUN_STATUSES)[number];

export const GENERATED_DRAFT_KINDS = ["email", "briefing_block"] as const;
export type GeneratedDraftKind = (typeof GENERATED_DRAFT_KINDS)[number];

export const GENERATED_DRAFT_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "sent"
] as const;
export type GeneratedDraftApprovalStatus = (typeof GENERATED_DRAFT_APPROVAL_STATUSES)[number];

export type WorkflowTemplateRow = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  trigger_event: WorkflowTriggerEvent;
  trigger_conditions_jsonb?: Record<string, unknown> | null;
  scope: WorkflowScope;
  event_id: string | null;
  is_enabled: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowStepRow = {
  id: string;
  template_id: string;
  step_index: number;
  step_type: string;
  step_key: string;
  params_jsonb: Record<string, unknown>;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkflowRunRow = {
  id: string;
  company_id: string;
  template_id: string;
  template_version: number;
  lead_id: string;
  event_id: string | null;
  trigger_event: WorkflowTriggerEvent;
  trigger_fingerprint?: string | null;
  trigger_payload_jsonb: Record<string, unknown>;
  status: WorkflowRunStatus;
  current_step_index: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowStepRunRow = {
  id: string;
  run_id: string;
  step_id: string;
  step_index: number;
  step_key: string;
  status: WorkflowStepRunStatus;
  attempt_count: number;
  attempt_id: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  input_jsonb: Record<string, unknown> | null;
  output_jsonb: Record<string, unknown> | null;
  error_text: string | null;
  error_code: string | null;
  waiting_reason?: string | null;
  required_conversation_version?: number | null;
  current_transcript_version?: number | null;
  current_insights_version?: number | null;
  wait_started_at?: string | null;
  wait_expires_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type GeneratedDraftRow = {
  id: string;
  company_id: string;
  lead_id: string;
  event_id: string | null;
  run_id: string;
  step_run_id: string;
  kind: GeneratedDraftKind;
  content_jsonb: Record<string, unknown>;
  approval_status: GeneratedDraftApprovalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  promoted_to_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Minimal lead context used by the trigger resolver to decide template eligibility.
 * Container kind is derived from the lead's `event_id` joined to `events.container_kind`.
 *
 * `containerKind = null` means the lead has `event_id IS NULL` — treated as
 * "company-only" for trigger purposes (eligible for `any` and `continuous_capture`-scoped
 * templates that are not pinned to a specific event id).
 */
export type LeadCaptureContext = {
  leadId: string;
  companyId: string;
  eventId: string | null;
  containerKind: EventContainerKind | null;
  /** Free-form for analytics/debugging (e.g., `mobile_capture`, `csv_publish`). */
  source: string;
};

export type LeadCapturedTriggerPayload = {
  trigger_event: "lead_captured";
  lead_id: string;
  company_id: string;
  event_id: string | null;
  container_kind: EventContainerKind | null;
  source: string;
  emitted_at: string;
  rule_id?: string | null;
  trigger_fingerprint?: string | null;
};
