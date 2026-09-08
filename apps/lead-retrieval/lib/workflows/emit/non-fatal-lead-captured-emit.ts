import "server-only";

import {
  emitLeadCaptured,
  type EmitLeadCapturedInput,
  type EmitLeadCapturedResult,
} from "@/lib/workflows/emit/lead-captured-emit";
import { attemptPipedriveAutoSyncEnqueue } from "@/lib/integrations/pipedrive/auto-sync-hook";

type AttemptLeadCapturedWorkflowEmitInput = EmitLeadCapturedInput & {
  logContext: string;
  emitLeadCapturedFn?: (input: EmitLeadCapturedInput) => Promise<EmitLeadCapturedResult>;
};

/**
 * Shared lead-create wrapper: workflow emit is always attempted after a successful
 * insert/replay, and failures never block lead capture/import.
 */
export async function attemptLeadCapturedWorkflowEmit(
  input: AttemptLeadCapturedWorkflowEmitInput
): Promise<EmitLeadCapturedResult | null> {
  const emitFn = input.emitLeadCapturedFn ?? emitLeadCaptured;
  const emitInput: EmitLeadCapturedInput = {
    leadId: input.leadId,
    companyId: input.companyId,
    eventId: input.eventId,
    source: input.source,
  };

  console.info("[workflows/emit] lead_captured emit attempt", {
    context: input.logContext,
    leadId: emitInput.leadId,
    companyId: emitInput.companyId,
    eventId: emitInput.eventId,
    source: emitInput.source,
    workflowEmitAttempted: true,
  });

  // Independent of the workflow-automation emit below: best-effort, never throws,
  // never affects this function's return value.
  await attemptPipedriveAutoSyncEnqueue({ leadId: emitInput.leadId, companyId: emitInput.companyId });

  try {
    const emitResult = await emitFn(emitInput);
    console.info("[workflows/emit] lead_captured emit result", {
      context: input.logContext,
      leadId: emitInput.leadId,
      companyId: emitInput.companyId,
      eventId: emitInput.eventId,
      source: emitInput.source,
      status: emitResult.status,
      runCount: emitResult.status === "queued" ? emitResult.runIds.length : 0,
      templateCount:
        emitResult.status === "no_runs_created" ? emitResult.templateIds.length : undefined,
      message: emitResult.status === "error" ? emitResult.message : undefined,
    });
    return emitResult;
  } catch (emitError) {
    console.warn("[workflows/emit] lead_captured emit failed (non-fatal)", {
      context: input.logContext,
      leadId: emitInput.leadId,
      companyId: emitInput.companyId,
      eventId: emitInput.eventId,
      source: emitInput.source,
      message: emitError instanceof Error ? emitError.message : "unknown",
    });
    return null;
  }
}
