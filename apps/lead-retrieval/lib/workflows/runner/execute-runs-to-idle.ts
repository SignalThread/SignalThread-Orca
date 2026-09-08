import type { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowHandlerRegistry } from "../contracts/step-handler";
import { claimNextDueStepRun } from "./claim-next-step";
import { executeClaimedStepRun } from "./run-step";

export type ExecuteWorkflowRunsToIdleResult = {
  processedStepCount: number;
  runResults: Array<{
    runId: string;
    processedStepCount: number;
    terminalOutcome: string;
  }>;
};

export async function executeWorkflowRunsToIdle(input: {
  supabase: ReturnType<typeof createAdminClient>;
  registry: WorkflowHandlerRegistry;
  runIds: ReadonlyArray<string>;
  handlerTimeoutMs?: number;
  maxStepsPerRun?: number;
}): Promise<ExecuteWorkflowRunsToIdleResult> {
  const runIds = [...new Set(input.runIds.map((runId) => runId.trim()).filter(Boolean))];
  const maxStepsPerRun = Math.max(1, Math.floor(input.maxStepsPerRun ?? 20));
  const handlerTimeoutMs = Math.max(1, Math.floor(input.handlerTimeoutMs ?? 60_000));
  const runResults: ExecuteWorkflowRunsToIdleResult["runResults"] = [];
  let processedStepCount = 0;

  for (const runId of runIds) {
    let runProcessed = 0;
    let terminalOutcome = "idle";

    for (let i = 0; i < maxStepsPerRun; i += 1) {
      const claimed = await claimNextDueStepRun({
        supabase: input.supabase,
        runId,
        nowIso: new Date().toISOString()
      });
      if (!claimed) {
        terminalOutcome = runProcessed > 0 ? "drained" : "idle";
        break;
      }

      const result = await executeClaimedStepRun({
        supabase: input.supabase,
        registry: input.registry,
        claimed,
        handlerTimeoutMs
      });

      runProcessed += 1;
      processedStepCount += 1;
      terminalOutcome = result.outcome;

      if (
        result.outcome === "fail" ||
        result.outcome === "retry" ||
        result.outcome === "awaiting_approval" ||
        result.outcome === "waiting_for_audio_transcript" ||
        result.outcome === "waiting_for_conversation_insights" ||
        result.outcome === "unknown_step_type" ||
        result.outcome === "load_failed"
      ) {
        break;
      }
    }

    if (runProcessed >= maxStepsPerRun) {
      terminalOutcome = "max_steps_reached";
    }

    runResults.push({ runId, processedStepCount: runProcessed, terminalOutcome });
  }

  return { processedStepCount, runResults };
}
