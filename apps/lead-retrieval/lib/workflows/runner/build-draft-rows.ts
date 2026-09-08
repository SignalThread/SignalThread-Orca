/**
 * Pure helper: build `generated_drafts` insert rows from a handler's `draft` result.
 *
 * Extracted from `run-step.ts` so unit tests can exercise the mapping without a real
 * supabase client. Production code calls this helper, then passes the rows to
 * `persistDraftsAndPauseRun`.
 *
 * Defaults:
 *   - `approval_status='pending'` (review-required by default — hard rule).
 *   - `reviewed_by`/`reviewed_at`/`promoted_to_id` always null at insert time.
 *
 * Each draft's `content_jsonb` is the handler's `content` payload as-is. We trust the
 * handler to keep it bounded (no oversized prompt blobs). The runner enforces a bound on
 * `workflow_step_runs.output_jsonb` separately.
 */

import type { WorkflowHandlerDraft } from "../contracts/step-handler";
import type {
  GeneratedDraftApprovalStatus,
  GeneratedDraftKind,
  WorkflowRunRow,
  WorkflowStepRunRow
} from "../contracts/workflow-types";

export type GeneratedDraftInsertRow = {
  company_id: string;
  lead_id: string;
  event_id: string | null;
  run_id: string;
  step_run_id: string;
  kind: GeneratedDraftKind;
  content_jsonb: Record<string, unknown>;
  approval_status: GeneratedDraftApprovalStatus;
  reviewed_by: null;
  reviewed_at: null;
  promoted_to_id: null;
};

/**
 * Build one `generated_drafts` insert row per draft returned by the handler.
 *
 * All drafts inherit `company_id`, `lead_id`, `event_id` from the parent run. We
 * intentionally do NOT trust the handler to populate scope fields: the runner is the
 * single source of truth for what company/lead this draft belongs to.
 */
export function buildGeneratedDraftInsertRows(input: {
  run: Pick<WorkflowRunRow, "id" | "company_id" | "lead_id" | "event_id">;
  stepRun: Pick<WorkflowStepRunRow, "id">;
  drafts: ReadonlyArray<WorkflowHandlerDraft>;
}): GeneratedDraftInsertRow[] {
  return input.drafts.map((draft) => ({
    company_id: input.run.company_id,
    lead_id: input.run.lead_id,
    event_id: input.run.event_id,
    run_id: input.run.id,
    step_run_id: input.stepRun.id,
    kind: draft.kind,
    content_jsonb: draft.content ?? {},
    approval_status: "pending" as const,
    reviewed_by: null,
    reviewed_at: null,
    promoted_to_id: null
  }));
}
