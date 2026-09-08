/**
 * Pure helpers that compute the exact row payloads for a workflow run + its step rows.
 * No I/O. Lives outside `runner/create-run.ts` (which has `import "server-only"`) so unit
 * tests can import it without pulling in the server-only guard.
 */

import type {
  LeadCaptureContext,
  LeadCapturedTriggerPayload,
  WorkflowStepRow
} from "../contracts/workflow-types";

/**
 * Step 0 is queued for immediate claim (`scheduled_at = now`). Later steps are seeded with
 * a far-future `scheduled_at` ('infinity' sentinel) so the worker cannot claim them out of
 * order; `advanceRunAfterStepCompleted` rewrites this when the predecessor completes.
 */
export function buildWorkflowRunInsertRows(input: {
  templateId: string;
  templateVersion: number;
  steps: ReadonlyArray<Pick<WorkflowStepRow, "id" | "step_index" | "step_key">>;
  capture: LeadCaptureContext;
  triggerPayload: LeadCapturedTriggerPayload;
  triggerFingerprint?: string | null;
  /** Override for tests; production passes `new Date().toISOString()`. */
  nowIso: string;
}): {
  runRow: Record<string, unknown>;
  stepRunRowsForRunId: (runId: string) => Record<string, unknown>[];
} {
  const sortedSteps = [...input.steps].sort((a, b) => a.step_index - b.step_index);
  const runRow: Record<string, unknown> = {
    company_id: input.capture.companyId,
    template_id: input.templateId,
    template_version: input.templateVersion,
    lead_id: input.capture.leadId,
    event_id: input.capture.eventId,
    trigger_event: input.triggerPayload.trigger_event,
    trigger_fingerprint: input.triggerFingerprint || "default",
    trigger_payload_jsonb: input.triggerPayload as unknown as Record<string, unknown>,
    status: sortedSteps.length === 0 ? "completed" : "queued",
    current_step_index: sortedSteps.length === 0 ? null : 0,
    started_at: null,
    completed_at: sortedSteps.length === 0 ? input.nowIso : null,
    created_at: input.nowIso,
    updated_at: input.nowIso
  };

  const stepRunRowsForRunId = (runId: string) =>
    sortedSteps.map((step, index) => ({
      run_id: runId,
      step_id: step.id,
      step_index: step.step_index,
      step_key: step.step_key,
      status: "queued" as const,
      attempt_count: 0,
      attempt_id: null,
      scheduled_at: index === 0 ? input.nowIso : "infinity",
      started_at: null,
      completed_at: null,
      input_jsonb: null,
      output_jsonb: null,
      error_text: null,
      error_code: null,
      created_at: input.nowIso,
      updated_at: input.nowIso
    }));

  return { runRow, stepRunRowsForRunId };
}
