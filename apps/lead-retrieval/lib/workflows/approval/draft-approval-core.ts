// NOTE: type-only `createAdminClient` import; callers pass a constructed client.
// Importable from node test runners.

import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  GeneratedDraftApprovalStatus,
  GeneratedDraftRow,
  WorkflowRunRow,
  WorkflowStepRow,
  WorkflowStepRunRow
} from "../contracts/workflow-types";
import type {
  WorkflowHandlerContext,
  WorkflowHandlerRegistry,
  WorkflowHandlerResult
} from "../contracts/step-handler";
import { persistWorkflowCampaignDraft } from "@/lib/campaigns/workflow-campaign-draft-persistence";
import { loadPreviousStepOutputs } from "../runner/run-step";

export type DraftApprovalContext = {
  /** The logged-in user's id (recorded on `generated_drafts.reviewed_by`). */
  reviewerUserId: string;
  /** Reviewer's company id; must match `generated_drafts.company_id`. Enforced. */
  reviewerCompanyId: string;
};

export type DraftApprovalError =
  | { code: "not_found"; status: 404; message: string }
  | { code: "forbidden"; status: 403; message: string }
  | { code: "conflict"; status: 409; message: string }
  | { code: "internal"; status: 500; message: string };

export type DraftApprovalResult =
  | { ok: true; draft: GeneratedDraftRow; nextStepScheduled: boolean }
  | { ok: false; error: DraftApprovalError };

export type DraftRejectionResult =
  | { ok: true; draft: GeneratedDraftRow }
  | { ok: false; error: DraftApprovalError };

/**
 * Approve a pending draft and resume the workflow run.
 *
 * Server-side enforcement:
 *   - draft must exist
 *   - draft.company_id MUST match reviewer.company_id (403 otherwise)
 *   - draft.approval_status MUST be 'pending' (409 otherwise) — guards re-approval and
 *     post-rejection approval attempts
 *   - parent run must be `awaiting_approval` (409 otherwise) — guards against the
 *     run being concurrently cancelled or otherwise advanced
 *
 * After mutation:
 *   - The paused step run is marked `completed` (`output_jsonb` is preserved).
 *   - If a next step exists, its `scheduled_at` is set to now and the parent run
 *     returns to `queued`. The worker will pick it up on the next tick.
 *   - If no next step exists, the parent run is marked `completed`.
 *
 * Idempotency: a second approve call returns 409 (`conflict`) because the draft is no
 * longer pending. The caller (route handler) can translate this into a benign response
 * if needed.
 */
export async function approveDraftAndResumeRun(input: {
  supabase: ReturnType<typeof createAdminClient>;
  draftId: string;
  context: DraftApprovalContext;
  registry?: WorkflowHandlerRegistry;
  handlerTimeoutMs?: number;
  nowIso?: string;
}): Promise<DraftApprovalResult> {
  const supabase = input.supabase;
  const nowIso = input.nowIso ?? new Date().toISOString();

  const draftLookup = await loadAndAuthorizeDraft(supabase, input.draftId, input.context);
  if (!draftLookup.ok) return draftLookup;
  const draft = draftLookup.draft;

  if (draft.approval_status !== "pending") {
    return {
      ok: false,
      error: {
        code: "conflict",
        status: 409,
        message: `Draft is not pending (current status: ${draft.approval_status}).`
      }
    };
  }

  const runLookup = await loadRunForResume(supabase, draft.run_id);
  if (!runLookup.ok) return runLookup;
  const run = runLookup.run;

  if (run.status !== "awaiting_approval") {
    return {
      ok: false,
      error: {
        code: "conflict",
        status: 409,
        message: `Workflow run is not awaiting approval (current status: ${run.status}).`
      }
    };
  }

  const stepRunLookup = await loadStepRunForResume(supabase, draft.step_run_id);
  if (!stepRunLookup.ok) return stepRunLookup;
  const stepRun = stepRunLookup.stepRun;

  const execution = await executeApprovalGatedStepIfNeeded({
    supabase,
    draft,
    run,
    stepRun,
    registry: input.registry,
    handlerTimeoutMs: input.handlerTimeoutMs ?? 60_000
  });
  if (!execution.ok) return execution;
  const draftForApproval = execution.draft;

  // 1. Promote review payload into the official draft artifact, when this draft
  // carries campaign promotion metadata. The helper is idempotent by campaign name,
  // recipient, and message row.
  const promotion = await promoteDraftArtifactIfNeeded({
    supabase,
    draft: draftForApproval,
    nowIso
  });
  if (!promotion.ok) return promotion;

  // 2. Mark draft approved.
  const draftUpdate = await updateDraftStatus(supabase, draft.id, "approved", {
    reviewer_user_id: input.context.reviewerUserId,
    now_iso: nowIso,
    promoted_to_id: promotion.promotedToId,
    content_jsonb: draftForApproval.content_jsonb
  });
  if (!draftUpdate.ok) return draftUpdate;

  // 3. Mark paused step run completed.
  const stepOutputPatch = {
    ...(execution.stepOutputPatch ?? {}),
    ...(promotion.stepOutputPatch ?? {})
  };
  const stepUpdate = await markStepRunCompletedAfterApproval(
    supabase,
    stepRun.id,
    nowIso,
    Object.keys(stepOutputPatch).length > 0 ? stepOutputPatch : null
  );
  if (!stepUpdate.ok) return stepUpdate;

  // 4. Schedule the next step, or mark run completed if none.
  const advanceResult = await scheduleNextStepOrCompleteRun({
    supabase,
    run,
    completedStepIndex: stepRun.step_index,
    nowIso
  });
  if (!advanceResult.ok) return advanceResult;

  return {
    ok: true,
    draft: {
      ...draftForApproval,
      approval_status: "approved",
      reviewed_by: input.context.reviewerUserId,
      reviewed_at: nowIso,
      promoted_to_id: promotion.promotedToId ?? draftForApproval.promoted_to_id
    },
    nextStepScheduled: advanceResult.nextStepScheduled
  };
}

/**
 * Reject a pending draft and CANCEL the workflow run.
 *
 * This is the server-side hard stop: once a draft is rejected, no later step in the
 * run can ever execute. We do not just leave the run paused — we cancel it to
 * eliminate any chance of a future approval / send / sync continuation.
 *
 * Server-side enforcement:
 *   - draft must exist
 *   - draft.company_id MUST match reviewer.company_id (403 otherwise)
 *   - draft.approval_status MUST be 'pending' (409 otherwise)
 */
export async function rejectDraftAndCancelRun(input: {
  supabase: ReturnType<typeof createAdminClient>;
  draftId: string;
  context: DraftApprovalContext;
  reason?: string;
  nowIso?: string;
}): Promise<DraftRejectionResult> {
  const supabase = input.supabase;
  const nowIso = input.nowIso ?? new Date().toISOString();

  const draftLookup = await loadAndAuthorizeDraft(supabase, input.draftId, input.context);
  if (!draftLookup.ok) return draftLookup;
  const draft = draftLookup.draft;

  if (draft.approval_status !== "pending") {
    return {
      ok: false,
      error: {
        code: "conflict",
        status: 409,
        message: `Draft is not pending (current status: ${draft.approval_status}).`
      }
    };
  }

  // 1. Mark draft rejected.
  const draftUpdate = await updateDraftStatus(supabase, draft.id, "rejected", {
    reviewer_user_id: input.context.reviewerUserId,
    now_iso: nowIso
  });
  if (!draftUpdate.ok) return draftUpdate;

  // 2. Mark the paused step run as `failed` with a stable error code. Using `failed`
  // (not `skipped`) ensures downstream observability flags it as a non-success.
  const reasonText = input.reason?.trim() ? input.reason.trim() : "Draft rejected by reviewer.";
  const { error: stepErr } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_step_runs")
    .update({
      status: "failed",
      completed_at: nowIso,
      error_text: reasonText,
      error_code: "draft_rejected",
      updated_at: nowIso
    })
    .eq("id", draft.step_run_id);
  if (stepErr) {
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: `Failed to mark paused step run failed: ${stepErr.message}`
      }
    };
  }

  // 3. Cancel the parent run. Use `cancelled`, NOT `failed`, so terminal status reflects
  // a deliberate human decision.
  const { error: runErr } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_runs")
    .update({
      status: "cancelled",
      completed_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", draft.run_id);
  if (runErr) {
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: `Failed to cancel workflow run: ${runErr.message}`
      }
    };
  }

  return {
    ok: true,
    draft: { ...draft, approval_status: "rejected", reviewed_by: input.context.reviewerUserId, reviewed_at: nowIso }
  };
}

async function loadAndAuthorizeDraft(
  supabase: ReturnType<typeof createAdminClient>,
  draftId: string,
  context: DraftApprovalContext
): Promise<{ ok: true; draft: GeneratedDraftRow } | { ok: false; error: DraftApprovalError }> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: GeneratedDraftRow | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
    };
  })
    .from("generated_drafts")
    .select(
      "id, company_id, lead_id, event_id, run_id, step_run_id, kind, content_jsonb, approval_status, reviewed_by, reviewed_at, promoted_to_id, created_at, updated_at"
    )
    .eq("id", draftId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { code: "internal", status: 500, message: `Failed to load draft: ${error.message}` }
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "not_found", status: 404, message: "Draft not found." }
    };
  }
  if (data.company_id !== context.reviewerCompanyId) {
    // Use 404 to avoid leaking existence to cross-company callers. The route maps this
    // to the same shape it uses for "truly not found." We return `forbidden` internally
    // so tests can distinguish.
    return {
      ok: false,
      error: { code: "forbidden", status: 403, message: "Draft is not visible to your company." }
    };
  }

  return { ok: true, draft: data };
}

async function loadRunForResume(
  supabase: ReturnType<typeof createAdminClient>,
  runId: string
): Promise<{ ok: true; run: WorkflowRunRow } | { ok: false; error: DraftApprovalError }> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: WorkflowRunRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_runs")
    .select(
      "id, company_id, template_id, template_version, lead_id, event_id, trigger_event, trigger_payload_jsonb, status, current_step_index, started_at, completed_at, created_at, updated_at"
    )
    .eq("id", runId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { code: "internal", status: 500, message: `Failed to load run: ${error.message}` }
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "not_found", status: 404, message: "Workflow run not found." }
    };
  }
  return { ok: true, run: data };
}

async function loadStepRunForResume(
  supabase: ReturnType<typeof createAdminClient>,
  stepRunId: string
): Promise<{ ok: true; stepRun: WorkflowStepRunRow } | { ok: false; error: DraftApprovalError }> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: WorkflowStepRunRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_step_runs")
    .select(
      "id, run_id, step_id, step_index, step_key, status, attempt_count, attempt_id, scheduled_at, started_at, completed_at, input_jsonb, output_jsonb, error_text, error_code, created_at, updated_at"
    )
    .eq("id", stepRunId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { code: "internal", status: 500, message: `Failed to load step run: ${error.message}` }
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "not_found", status: 404, message: "Step run not found." }
    };
  }
  return { ok: true, stepRun: data };
}

async function executeApprovalGatedStepIfNeeded(input: {
  supabase: ReturnType<typeof createAdminClient>;
  draft: GeneratedDraftRow;
  run: WorkflowRunRow;
  stepRun: WorkflowStepRunRow;
  registry?: WorkflowHandlerRegistry;
  handlerTimeoutMs: number;
}): Promise<
  | { ok: true; draft: GeneratedDraftRow; stepOutputPatch: Record<string, unknown> | null }
  | { ok: false; error: DraftApprovalError }
> {
  if (!isExecuteOnApprovalDraft(input.draft)) {
    return { ok: true, draft: input.draft, stepOutputPatch: null };
  }

  if (!input.registry) {
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: "Approval cannot execute this workflow step because no handler registry was provided."
      }
    };
  }

  const stepLookup = await loadStepForApproval(input.supabase, input.stepRun.step_id);
  if (!stepLookup.ok) return stepLookup;
  const step = stepLookup.step;
  const handler = input.registry.get(step.step_type);
  if (!handler) {
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: `No handler registered for approval-required step_type "${step.step_type}".`
      }
    };
  }

  const timeoutMs = Math.max(
    1,
    Math.min(input.handlerTimeoutMs, handler.defaultTimeoutMs ?? input.handlerTimeoutMs)
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const previousStepOutputs = await loadPreviousStepOutputs(
    input.supabase,
    input.run.id,
    input.stepRun.step_index
  );
  const ctx: WorkflowHandlerContext = {
    run: input.run,
    step,
    stepRun: input.stepRun,
    previousStepOutputs,
    abortSignal: controller.signal
  };

  let result: WorkflowHandlerResult;
  try {
    result = await handler.run(ctx);
  } catch (error) {
    clearTimeout(timer);
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: error instanceof Error ? error.message : "Approval-required workflow step threw unexpectedly."
      }
    };
  } finally {
    clearTimeout(timer);
  }

  if (result.kind === "draft") {
    const generatedDraft = result.drafts.find((candidate) => candidate.content);
    if (!generatedDraft) {
      return {
        ok: false,
        error: {
          code: "internal",
          status: 500,
          message: "Approval-required workflow step did not produce a reviewable draft."
        }
      };
    }
    return {
      ok: true,
      draft: {
        ...input.draft,
        kind: generatedDraft.kind,
        content_jsonb: generatedDraft.content
      },
      stepOutputPatch: result.output
    };
  }

  if (result.kind === "ok" || result.kind === "skipped") {
    return {
      ok: true,
      draft: {
        ...input.draft,
        content_jsonb:
          result.kind === "ok"
            ? result.output
            : {
                skipped_reason: result.reason,
                ...(result.output ?? {})
              }
      },
      stepOutputPatch:
        result.kind === "ok"
          ? result.output
          : {
              skipped_reason: result.reason,
              ...(result.output ?? {})
            }
    };
  }

  const errorText =
    result.kind === "retry"
      ? result.errorText
      : result.kind === "wait"
        ? result.errorText
        : result.errorText;
  const errorCode =
    result.kind === "retry"
      ? (result.errorCode ?? "retry")
      : result.kind === "wait"
        ? result.waitingReason
        : (result.errorCode ?? "fail");
  return {
    ok: false,
    error: {
      code: "internal",
      status: 500,
      message: `Approval-required workflow step could not execute (${errorCode}): ${errorText}`
    }
  };
}

async function loadStepForApproval(
  supabase: ReturnType<typeof createAdminClient>,
  stepId: string
): Promise<{ ok: true; step: WorkflowStepRow } | { ok: false; error: DraftApprovalError }> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: WorkflowStepRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_steps")
    .select(
      "id, template_id, step_index, step_type, step_key, params_jsonb, requires_approval, created_at, updated_at"
    )
    .eq("id", stepId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { code: "internal", status: 500, message: `Failed to load workflow step: ${error.message}` }
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "not_found", status: 404, message: "Workflow step not found." }
    };
  }
  return { ok: true, step: data };
}

function isExecuteOnApprovalDraft(draft: GeneratedDraftRow): boolean {
  return draft.content_jsonb?.approval_execution_mode === "execute_step_on_approval";
}

async function updateDraftStatus(
  supabase: ReturnType<typeof createAdminClient>,
  draftId: string,
  status: GeneratedDraftApprovalStatus,
  args: {
    reviewer_user_id: string;
    now_iso: string;
    promoted_to_id?: string | null;
    content_jsonb?: Record<string, unknown>;
  }
): Promise<{ ok: true } | { ok: false; error: DraftApprovalError }> {
  const patch: Record<string, unknown> = {
    approval_status: status,
    reviewed_by: args.reviewer_user_id,
    reviewed_at: args.now_iso,
    updated_at: args.now_iso
  };
  if (Object.prototype.hasOwnProperty.call(args, "promoted_to_id")) {
    patch.promoted_to_id = args.promoted_to_id;
  }
  if (args.content_jsonb) {
    patch.content_jsonb = args.content_jsonb;
  }

  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  })
    .from("generated_drafts")
    .update(patch)
    // Optimistic guard against races: only flip from pending. If a concurrent caller
    // already flipped it, the row count will be 0 and the next read will surface that.
    .eq("id", draftId)
    .eq("approval_status", "pending");

  if (error) {
    return {
      ok: false,
      error: { code: "internal", status: 500, message: `Failed to update draft status: ${error.message}` }
    };
  }
  return { ok: true };
}

async function markStepRunCompletedAfterApproval(
  supabase: ReturnType<typeof createAdminClient>,
  stepRunId: string,
  nowIso: string,
  outputPatch?: Record<string, unknown> | null
): Promise<{ ok: true } | { ok: false; error: DraftApprovalError }> {
  let mergedOutput: Record<string, unknown> | undefined;
  if (outputPatch && Object.keys(outputPatch).length > 0) {
    const { data: existingStepRun, error: loadError } = await (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{
              data: Pick<WorkflowStepRunRow, "output_jsonb"> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    })
      .from("workflow_step_runs")
      .select("output_jsonb")
      .eq("id", stepRunId)
      .maybeSingle();
    if (loadError) {
      return {
        ok: false,
        error: {
          code: "internal",
          status: 500,
          message: `Failed to load step output for approval: ${loadError.message}`
        }
      };
    }
    mergedOutput = {
      ...((existingStepRun?.output_jsonb as Record<string, unknown> | null) ?? {}),
      ...outputPatch
    };
  }

  const patch: Record<string, unknown> = {
    status: "completed",
    completed_at: nowIso,
    updated_at: nowIso
  };
  if (mergedOutput) {
    patch.output_jsonb = mergedOutput;
  }

  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_step_runs")
    .update(patch)
    .eq("id", stepRunId);

  if (error) {
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: `Failed to mark step run completed: ${error.message}`
      }
    };
  }
  return { ok: true };
}

async function promoteDraftArtifactIfNeeded(input: {
  supabase: ReturnType<typeof createAdminClient>;
  draft: GeneratedDraftRow;
  nowIso: string;
}): Promise<
  | { ok: true; promotedToId: string | null; stepOutputPatch: Record<string, unknown> | null }
  | { ok: false; error: DraftApprovalError }
> {
  const content = (input.draft.content_jsonb ?? {}) as Record<string, unknown>;
  const existingMessageId = cleanString(content.campaign_message_id) || cleanString(input.draft.promoted_to_id);
  if (existingMessageId) {
    return {
      ok: true,
      promotedToId: existingMessageId,
      stepOutputPatch: { campaign_message_id: existingMessageId }
    };
  }

  const campaignName = cleanString(content.workflow_campaign_name);
  if (!campaignName) {
    return { ok: true, promotedToId: null, stepOutputPatch: null };
  }

  const subject = cleanString(content.subject);
  const bodyText = typeof content.body_text === "string" ? content.body_text : "";
  if (!subject || !bodyText.trim()) {
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: "Pending draft payload is missing subject or body."
      }
    };
  }

  try {
    const promoted = await persistWorkflowCampaignDraft({
      supabase: input.supabase,
      companyId: input.draft.company_id,
      leadId: input.draft.lead_id,
      campaignName,
      subject,
      bodyText,
      bodyHtml: typeof content.body_html === "string" ? content.body_html : null,
      selectedSignalIds: Array.isArray(content.signal_ids_used)
        ? content.signal_ids_used.filter((id): id is string => typeof id === "string")
        : [],
      subjectLine: cleanString(content.subject_template) || subject,
      nowIso: input.nowIso
    });
    return {
      ok: true,
      promotedToId: promoted.messageId,
      stepOutputPatch: {
        outcome: "campaign_draft_created",
        campaign_id: promoted.campaignId,
        campaign_recipient_id: promoted.recipientId,
        campaign_message_id: promoted.messageId
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: error instanceof Error ? error.message : "Failed to create approved campaign draft."
      }
    };
  }
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function scheduleNextStepOrCompleteRun(input: {
  supabase: ReturnType<typeof createAdminClient>;
  run: WorkflowRunRow;
  completedStepIndex: number;
  nowIso: string;
}): Promise<{ ok: true; nextStepScheduled: boolean } | { ok: false; error: DraftApprovalError }> {
  const { supabase, run, completedStepIndex, nowIso } = input;
  const nextIndex = completedStepIndex + 1;

  const { data: nextStepRun, error: pickError } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{
              data: Pick<WorkflowStepRunRow, "id"> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("workflow_step_runs")
    .select("id")
    .eq("run_id", run.id)
    .eq("step_index", nextIndex)
    .maybeSingle();

  if (pickError) {
    return {
      ok: false,
      error: { code: "internal", status: 500, message: `Failed to look up next step: ${pickError.message}` }
    };
  }

  if (nextStepRun?.id) {
    const { error: scheduleError } = await (supabase as unknown as {
      from: (t: string) => {
        update: (patch: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("workflow_step_runs")
      .update({ scheduled_at: nowIso, updated_at: nowIso })
      .eq("id", nextStepRun.id);
    if (scheduleError) {
      return {
        ok: false,
        error: {
          code: "internal",
          status: 500,
          message: `Failed to schedule next step: ${scheduleError.message}`
        }
      };
    }

    const { error: runError } = await (supabase as unknown as {
      from: (t: string) => {
        update: (patch: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("workflow_runs")
      .update({
        status: "queued",
        current_step_index: nextIndex,
        updated_at: nowIso
      })
      .eq("id", run.id);
    if (runError) {
      return {
        ok: false,
        error: {
          code: "internal",
          status: 500,
          message: `Failed to resume run: ${runError.message}`
        }
      };
    }

    return { ok: true, nextStepScheduled: true };
  }

  // No next step: terminal completion.
  const { error: runDoneError } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_runs")
    .update({
      status: "completed",
      completed_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", run.id);

  if (runDoneError) {
    return {
      ok: false,
      error: {
        code: "internal",
        status: 500,
        message: `Failed to mark run completed: ${runDoneError.message}`
      }
    };
  }
  return { ok: true, nextStepScheduled: false };
}
