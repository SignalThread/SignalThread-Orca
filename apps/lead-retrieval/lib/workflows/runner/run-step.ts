// NOTE: This module uses type-only imports of `createAdminClient` and operates purely
// on a supabase client passed in by the caller. It is safe to import from node test
// runners; the `server-only` guard was previously belt-and-suspenders since callers must
// already construct a real admin client (which itself is server-only) to invoke any of
// these functions in production.

import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  WorkflowHandler,
  WorkflowHandlerContext,
  WorkflowHandlerRegistry,
  WorkflowHandlerResult
} from "../contracts/step-handler";
import type {
  WorkflowRunRow,
  WorkflowStepRow,
  WorkflowStepRunRow
} from "../contracts/workflow-types";
import {
  advanceRunAfterStepCompleted,
  markStepRunWaiting,
  markStepRunFailed,
  rescheduleStepRunForRetry
} from "./schedule-next-step";
import { persistDraftsAndPauseRun } from "./persist-drafts-and-pause";
import { persistPromotedDrafts } from "./persist-drafts-and-complete";

/**
 * Execute one claimed step:
 *   1. Look up parent run + step definition + previous outputs.
 *   2. Resolve handler from registry. If unknown, terminally fail with
 *      `error_code = 'unknown_step_type'`. (Phase 2 ships an empty registry, so this is
 *      the expected outcome until handlers land in later phases.)
 *   3. Invoke the handler with an abort signal.
 *   4. Persist the result and advance / fail / reschedule the run accordingly.
 *
 * Note: approval-required steps are paused BEFORE the handler runs. The approval API is
 * the only place allowed to execute those terminal actions. When `requires_approval` is
 * false, draft-shaped handler results can complete/promote normally.
 */
export async function executeClaimedStepRun(input: {
  supabase: ReturnType<typeof createAdminClient>;
  registry: WorkflowHandlerRegistry;
  claimed: WorkflowStepRunRow;
  /** Cap per-handler runtime; the worker uses ~20s by default. */
  handlerTimeoutMs: number;
}): Promise<{
  outcome:
    | Exclude<WorkflowHandlerResult["kind"], "wait">
    | "waiting_for_audio_transcript"
    | "waiting_for_conversation_insights"
    | "awaiting_approval"
    | "unknown_step_type"
    | "load_failed";
}> {
  const { supabase, registry, claimed, handlerTimeoutMs } = input;

  // 1. Load parent run.
  const { data: runRow, error: runErr } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: WorkflowRunRow | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_runs")
    .select(
      "id, company_id, template_id, template_version, lead_id, event_id, trigger_event, trigger_payload_jsonb, status, current_step_index, started_at, completed_at, created_at, updated_at"
    )
    .eq("id", claimed.run_id)
    .maybeSingle();

  if (runErr || !runRow) {
    await markStepRunFailed({
      supabase,
      stepRunId: claimed.id,
      runId: claimed.run_id,
      errorText: runErr?.message ?? "parent run not found",
      errorCode: "load_run_failed"
    });
    return { outcome: "load_failed" };
  }

  // 2. Load step definition.
  const { data: stepRow, error: stepErr } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: WorkflowStepRow | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_steps")
    .select(
      "id, template_id, step_index, step_type, step_key, params_jsonb, requires_approval, created_at, updated_at"
    )
    .eq("id", claimed.step_id)
    .maybeSingle();

  if (stepErr || !stepRow) {
    await markStepRunFailed({
      supabase,
      stepRunId: claimed.id,
      runId: claimed.run_id,
      errorText: stepErr?.message ?? "step definition not found",
      errorCode: "load_step_failed"
    });
    return { outcome: "load_failed" };
  }

  if (stepRow.requires_approval) {
    const previousOutputs = await loadPreviousStepOutputs(supabase, claimed.run_id, claimed.step_index);
    await persistDraftsAndPauseRun({
      supabase,
      run: {
        id: runRow.id,
        company_id: runRow.company_id,
        lead_id: runRow.lead_id,
        event_id: runRow.event_id
      },
      stepRun: { id: claimed.id, step_index: claimed.step_index },
      drafts: [buildApprovalRequiredPlaceholderDraft(stepRow, runRow, claimed, previousOutputs)],
      stepOutput: {
        outcome: "pending_approval",
        approval_required: true,
        step_type: stepRow.step_type,
        step_key: stepRow.step_key
      },
      nowIso: new Date().toISOString()
    });
    return { outcome: "awaiting_approval" };
  }

  // 3. Load previous step outputs (only completed predecessors).
  const previousOutputs = await loadPreviousStepOutputs(supabase, claimed.run_id, claimed.step_index);

  // 4. Resolve handler.
  const handler = registry.get(stepRow.step_type);
  if (!handler) {
    await markStepRunFailed({
      supabase,
      stepRunId: claimed.id,
      runId: claimed.run_id,
      errorText: `No handler registered for step_type "${stepRow.step_type}".`,
      errorCode: "unknown_step_type"
    });
    return { outcome: "unknown_step_type" };
  }

  // 5. Run handler with abort budget.
  const timeoutMs = Math.max(1, Math.min(handlerTimeoutMs, handler.defaultTimeoutMs ?? handlerTimeoutMs));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const ctx: WorkflowHandlerContext = {
    run: runRow,
    step: stepRow,
    stepRun: claimed,
    previousStepOutputs: previousOutputs,
    abortSignal: controller.signal
  };

  let result: WorkflowHandlerResult;
  try {
    result = await runHandlerSafely(handler, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handler threw unexpectedly.";
    await markStepRunFailed({
      supabase,
      stepRunId: claimed.id,
      runId: claimed.run_id,
      errorText: message,
      errorCode: "handler_threw"
    });
    return { outcome: "fail" };
  } finally {
    clearTimeout(timer);
  }

  // 6. Persist outcome.
  const nowIso = new Date().toISOString();

  if (result.kind === "ok") {
    await persistStepCompletion(supabase, claimed.id, result.output, nowIso);
    await advanceRunAfterStepCompleted({
      supabase,
      runId: claimed.run_id,
      completedStepIndex: claimed.step_index,
      nowIso
    });
    return { outcome: "ok" };
  }

  if (result.kind === "draft") {
    if (hasPromotedCampaignDraft(result)) {
      await persistPromotedDrafts({
        supabase,
        run: {
          id: runRow.id,
          company_id: runRow.company_id,
          lead_id: runRow.lead_id,
          event_id: runRow.event_id
        },
        stepRun: { id: claimed.id },
        drafts: result.drafts,
        nowIso
      });
      await persistStepCompletion(supabase, claimed.id, result.output, nowIso);
      await advanceRunAfterStepCompleted({
        supabase,
        runId: claimed.run_id,
        completedStepIndex: claimed.step_index,
        nowIso
      });
      return { outcome: "draft" };
    }

    await persistStepCompletion(supabase, claimed.id, result.output, nowIso);
    await advanceRunAfterStepCompleted({
      supabase,
      runId: claimed.run_id,
      completedStepIndex: claimed.step_index,
      nowIso
    });
    return { outcome: "ok" };
  }

  if (result.kind === "skipped") {
    await persistStepCompletion(
      supabase,
      claimed.id,
      result.output ?? { skipped_reason: result.reason },
      nowIso,
      "skipped"
    );
    await advanceRunAfterStepCompleted({
      supabase,
      runId: claimed.run_id,
      completedStepIndex: claimed.step_index,
      nowIso
    });
    return { outcome: "skipped" };
  }

  if (result.kind === "retry") {
    await rescheduleStepRunForRetry({
      supabase,
      stepRunId: claimed.id,
      retryAfterMs: result.retryAfterMs,
      errorText: result.errorText,
      errorCode: result.errorCode ?? "retry"
    });
    return { outcome: "retry" };
  }

  if (result.kind === "wait") {
    await markStepRunWaiting({
      supabase,
      stepRunId: claimed.id,
      runId: claimed.run_id,
      waitingReason: result.waitingReason,
      errorText: result.errorText,
      output: result.output,
      waitExpiresAt: result.waitExpiresAt
    });
    return { outcome: result.waitingReason };
  }

  await markStepRunFailed({
    supabase,
    stepRunId: claimed.id,
    runId: claimed.run_id,
    errorText: result.errorText,
    errorCode: result.errorCode ?? "fail",
    output: result.output ?? null
  });
  return { outcome: "fail" };
}

async function runHandlerSafely(
  handler: WorkflowHandler,
  ctx: WorkflowHandlerContext
): Promise<WorkflowHandlerResult> {
  return handler.run(ctx);
}

async function persistStepCompletion(
  supabase: ReturnType<typeof createAdminClient>,
  stepRunId: string,
  output: Record<string, unknown>,
  nowIso: string,
  status: "completed" | "skipped" = "completed"
) {
  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_step_runs")
    .update({
      status,
      completed_at: nowIso,
      output_jsonb: output,
      error_text: null,
      error_code: null,
      updated_at: nowIso
    })
    .eq("id", stepRunId);

  if (error) {
    console.warn("[workflows/runner] persistStepCompletion failed", {
      stepRunId,
      message: error.message
    });
  }
}

export async function loadPreviousStepOutputs(
  supabase: ReturnType<typeof createAdminClient>,
  runId: string,
  upToExclusiveIndex: number
): Promise<Record<string, Record<string, unknown> | null>> {
  if (upToExclusiveIndex <= 0) return {};
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          lt: (col: string, val: unknown) => {
            in: (col: string, vals: unknown[]) => Promise<{
              data: Array<Pick<WorkflowStepRunRow, "step_key" | "output_jsonb">> | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("workflow_step_runs")
    .select("step_key, output_jsonb")
    .eq("run_id", runId)
    .lt("step_index", upToExclusiveIndex)
    .in("status", ["completed", "skipped"]);

  if (error) {
    console.warn("[workflows/runner] loadPreviousStepOutputs failed", {
      runId,
      message: error.message
    });
    return {};
  }

  const map: Record<string, Record<string, unknown> | null> = {};
  for (const row of data ?? []) {
    map[row.step_key] = (row.output_jsonb as Record<string, unknown> | null) ?? null;
  }
  return map;
}

function hasPromotedCampaignDraft(result: Extract<WorkflowHandlerResult, { kind: "draft" }>) {
  const outputMessageId = result.output.campaign_message_id;
  if (typeof outputMessageId === "string" && outputMessageId.trim()) return true;
  return result.drafts.some((draft) => {
    const raw = draft.content.campaign_message_id;
    return typeof raw === "string" && raw.trim().length > 0;
  });
}

function buildApprovalRequiredPlaceholderDraft(
  step: WorkflowStepRow,
  run: WorkflowRunRow,
  stepRun: WorkflowStepRunRow,
  previousStepOutputs: Record<string, Record<string, unknown> | null>
) {
  const actionLabel = workflowActionLabel(step.step_type);
  const params = (step.params_jsonb ?? {}) as Record<string, unknown>;
  const subjectTemplate = typeof params.subjectTemplate === "string" ? params.subjectTemplate : null;
  return {
    kind: "email" as const,
    content: {
      approval_execution_mode: "execute_step_on_approval",
      approval_required: true,
      workflow_run_id: run.id,
      workflow_id: run.template_id,
      lead_id: run.lead_id,
      event_id: run.event_id,
      step_id: step.id,
      step_index: step.step_index,
      step_type: step.step_type,
      step_key: step.step_key,
      step_run_id: stepRun.id,
      action_type: step.step_type,
      action_label: actionLabel,
      params_jsonb: params,
      input_context_snapshot: {
        trigger_payload_jsonb: run.trigger_payload_jsonb,
        previous_step_outputs: previousStepOutputs
      },
      subject: subjectTemplate ?? actionLabel,
      subject_template: subjectTemplate ?? null,
      proposed_output_summary: `${actionLabel} pending approval`,
      approval_action_label: `Approve ${approvalVerbForStep(step.step_type)}`
    }
  };
}

function workflowActionLabel(stepType: string): string {
  switch (stepType) {
    case "compose_campaign_draft":
      return "Campaign Draft";
    case "crm_sync_hubspot":
      return "HubSpot CRM Sync";
    case "crm_sync_salesforce":
      return "Salesforce CRM Sync";
    default:
      return stepType
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function approvalVerbForStep(stepType: string): string {
  switch (stepType) {
    case "compose_campaign_draft":
      return "creating campaign draft";
    case "crm_sync_hubspot":
    case "crm_sync_salesforce":
      return "CRM sync";
    default:
      return "workflow action";
  }
}
