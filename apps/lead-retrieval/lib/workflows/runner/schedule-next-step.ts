// NOTE: type-only `createAdminClient` import; callers pass in a constructed client.
// Safe to import from node test runners.

import type { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowStepRunRow } from "../contracts/workflow-types";

/**
 * After a step run completes, decide what to do next:
 *   - schedule the next step (if any)
 *   - mark the run as `completed` (no next step)
 *
 * "Awaiting approval" and terminal-failure transitions are handled by their respective
 * helpers ({@link markStepRunFailed}, {@link markStepRunAwaitingApproval}); this helper
 * is only for the success path.
 */
export async function advanceRunAfterStepCompleted(input: {
  supabase: ReturnType<typeof createAdminClient>;
  runId: string;
  completedStepIndex: number;
  nowIso?: string;
}): Promise<void> {
  const supabase = input.supabase;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const nextIndex = input.completedStepIndex + 1;

  const { data: nextStepRun, error: pickError } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{
              data: Pick<WorkflowStepRunRow, "id"> | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("workflow_step_runs")
    .select("id")
    .eq("run_id", input.runId)
    .eq("step_index", nextIndex)
    .maybeSingle();

  if (pickError) {
    console.warn("[workflows/runner] advance pick failed", {
      runId: input.runId,
      nextIndex,
      message: pickError.message
    });
    return;
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
      .update({
        scheduled_at: nowIso,
        updated_at: nowIso
      })
      .eq("id", nextStepRun.id);

    if (scheduleError) {
      console.warn("[workflows/runner] failed scheduling next step", {
        runId: input.runId,
        nextIndex,
        message: scheduleError.message
      });
      return;
    }

    await updateRunMeta(supabase, {
      runId: input.runId,
      patch: { current_step_index: nextIndex, status: "queued", updated_at: nowIso }
    });
    return;
  }

  // No next step: terminal completion.
  await updateRunMeta(supabase, {
    runId: input.runId,
    patch: {
      status: "completed",
      completed_at: nowIso,
      updated_at: nowIso
    }
  });
}

/** Mark a step run as terminally failed; cascade to the parent run. */
export async function markStepRunFailed(input: {
  supabase: ReturnType<typeof createAdminClient>;
  stepRunId: string;
  runId: string;
  errorText: string;
  errorCode?: string;
  output?: Record<string, unknown> | null;
  nowIso?: string;
}): Promise<void> {
  const supabase = input.supabase;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const stepPatch: Record<string, unknown> = {
    status: "failed",
    completed_at: nowIso,
    error_text: input.errorText,
    error_code: input.errorCode ?? null,
    updated_at: nowIso
  };
  if (input.output !== undefined) {
    stepPatch.output_jsonb = input.output;
  }

  const { error: stepError } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_step_runs")
    .update(stepPatch)
    .eq("id", input.stepRunId);

  if (stepError) {
    console.warn("[workflows/runner] markStepRunFailed step update failed", {
      stepRunId: input.stepRunId,
      message: stepError.message
    });
  }

  await updateRunMeta(supabase, {
    runId: input.runId,
    patch: {
      status: "failed",
      completed_at: nowIso,
      updated_at: nowIso
    }
  });
}

/** Pause a step until required conversation data becomes ready. */
export async function markStepRunWaiting(input: {
  supabase: ReturnType<typeof createAdminClient>;
  stepRunId: string;
  runId: string;
  waitingReason: "waiting_for_audio_transcript" | "waiting_for_conversation_insights";
  errorText: string;
  output: Record<string, unknown>;
  waitExpiresAt: string;
  nowIso?: string;
}): Promise<void> {
  const supabase = input.supabase;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const requiredVersion = asNumber(input.output.required_conversation_version);
  const transcriptVersion = asNumber(input.output.current_transcript_version);
  const insightsVersion = asNumber(input.output.current_insights_version);

  const { error: stepError } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_step_runs")
    .update({
      status: input.waitingReason,
      completed_at: null,
      error_text: input.errorText,
      error_code: input.waitingReason,
      output_jsonb: input.output,
      waiting_reason: input.waitingReason,
      required_conversation_version: requiredVersion,
      current_transcript_version: transcriptVersion,
      current_insights_version: insightsVersion,
      wait_started_at: nowIso,
      wait_expires_at: input.waitExpiresAt,
      updated_at: nowIso
    })
    .eq("id", input.stepRunId);

  if (stepError) {
    console.warn("[workflows/runner] markStepRunWaiting step update failed", {
      stepRunId: input.stepRunId,
      message: stepError.message
    });
  }

  await updateRunMeta(supabase, {
    runId: input.runId,
    patch: {
      status: input.waitingReason,
      updated_at: nowIso
    }
  });
}

/** Re-queue a step for retry at `now + retryAfterMs`. */
export async function rescheduleStepRunForRetry(input: {
  supabase: ReturnType<typeof createAdminClient>;
  stepRunId: string;
  retryAfterMs: number;
  errorText: string;
  errorCode?: string;
  nowIso?: string;
}): Promise<void> {
  const supabase = input.supabase;
  const now = input.nowIso ? new Date(input.nowIso) : new Date();
  const scheduledAt = new Date(now.getTime() + Math.max(0, Math.floor(input.retryAfterMs)));

  const { error: stepError } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_step_runs")
    .update({
      status: "queued",
      scheduled_at: scheduledAt.toISOString(),
      error_text: input.errorText,
      error_code: input.errorCode ?? null,
      updated_at: now.toISOString()
    })
    .eq("id", input.stepRunId);

  if (stepError) {
    console.warn("[workflows/runner] rescheduleStepRunForRetry update failed", {
      stepRunId: input.stepRunId,
      message: stepError.message
    });
  }
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

async function updateRunMeta(
  supabase: ReturnType<typeof createAdminClient>,
  args: { runId: string; patch: Record<string, unknown> }
) {
  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_runs")
    .update(args.patch)
    .eq("id", args.runId);

  if (error) {
    console.warn("[workflows/runner] updateRunMeta failed", {
      runId: args.runId,
      message: error.message
    });
  }
}
