import type { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateWorkflowDataReadiness,
  loadConversationReadinessState,
  type WorkflowDataRequirements
} from "@/lib/conversations/conversation-readiness";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const WAITING_STATUSES = ["waiting_for_audio_transcript", "waiting_for_conversation_insights"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requirementsFromOutput(output: unknown): WorkflowDataRequirements {
  const record = asRecord(output);
  const nested = asRecord(record.workflowDataRequirements);
  return {
    requiresAudioTranscript:
      nested.requiresAudioTranscript === true || record.requires_audio_transcript === true,
    requiresConversationInsights:
      nested.requiresConversationInsights === true || record.requires_conversation_insights === true
  };
}

export async function resumeWaitingWorkflowStepsForLead(input: {
  supabase: SupabaseAdmin;
  leadId: string;
  nowIso?: string;
}): Promise<{ resumed: number; timedOut: number; stillWaiting: number }> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const state = await loadConversationReadinessState(input.supabase, input.leadId);

  const { data: runs, error: runsError } = await (input.supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          in: (col: string, val: readonly string[]) => Promise<{
            data: Array<{ id: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_runs")
    .select("id")
    .eq("lead_id", input.leadId)
    .in("status", WAITING_STATUSES);

  if (runsError) {
    throw new Error(runsError.message ?? "Failed loading waiting workflow runs.");
  }

  const runIds = (runs ?? []).map((row) => String(row.id ?? "").trim()).filter(Boolean);
  if (runIds.length === 0) {
    return { resumed: 0, timedOut: 0, stillWaiting: 0 };
  }

  const { data: stepRuns, error: stepRunsError } = await (input.supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        in: (col: string, val: readonly string[]) => {
          in: (col: string, val: readonly string[]) => Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_step_runs")
    .select(
      "id, run_id, status, output_jsonb, wait_expires_at, required_conversation_version, current_transcript_version, current_insights_version"
    )
    .in("run_id", runIds)
    .in("status", WAITING_STATUSES);

  if (stepRunsError) {
    throw new Error(stepRunsError.message ?? "Failed loading waiting workflow step runs.");
  }

  let resumed = 0;
  let timedOut = 0;
  let stillWaiting = 0;

  for (const stepRun of stepRuns ?? []) {
    const stepRunId = String(stepRun.id ?? "").trim();
    const runId = String(stepRun.run_id ?? "").trim();
    if (!stepRunId || !runId) continue;

    const requirements = requirementsFromOutput(stepRun.output_jsonb);
    const decision = evaluateWorkflowDataReadiness({ state, requirements, nowIso });

    const expiresAt = String(stepRun.wait_expires_at ?? "").trim();
    const isTimedOut = expiresAt ? expiresAt <= nowIso : false;
    if (!decision.ready && isTimedOut) {
      const timeoutCode =
        decision.waitingReason === "waiting_for_audio_transcript"
          ? "timed_out_waiting_for_audio_transcript"
          : "timed_out_waiting_for_insights";
      await markTimedOut({
        supabase: input.supabase,
        stepRunId,
        runId,
        nowIso,
        errorCode: timeoutCode,
        errorText: `${decision.errorText} Timed out after waiting.`
      });
      timedOut += 1;
      continue;
    }

    if (decision.ready) {
      await queueWaitingStep({
        supabase: input.supabase,
        stepRunId,
        runId,
        nowIso,
        requiredConversationVersion: decision.requiredConversationVersion,
        currentTranscriptVersion: decision.currentTranscriptVersion,
        currentInsightsVersion: decision.currentInsightsVersion
      });
      resumed += 1;
      continue;
    }

    await refreshWaitingMetadata({
      supabase: input.supabase,
      stepRunId,
      runId,
      nowIso,
      waitingReason: decision.waitingReason,
      errorText: decision.errorText,
      requiredConversationVersion: decision.requiredConversationVersion,
      currentTranscriptVersion: decision.currentTranscriptVersion,
      currentInsightsVersion: decision.currentInsightsVersion
    });
    stillWaiting += 1;
  }

  return { resumed, timedOut, stillWaiting };
}

async function queueWaitingStep(input: {
  supabase: SupabaseAdmin;
  stepRunId: string;
  runId: string;
  nowIso: string;
  requiredConversationVersion: number;
  currentTranscriptVersion: number | null;
  currentInsightsVersion: number | null;
}) {
  await updateStep(input.supabase, input.stepRunId, {
    status: "queued",
    scheduled_at: input.nowIso,
    error_text: null,
    error_code: null,
    waiting_reason: null,
    required_conversation_version: input.requiredConversationVersion,
    current_transcript_version: input.currentTranscriptVersion,
    current_insights_version: input.currentInsightsVersion,
    updated_at: input.nowIso
  });
  await updateRun(input.supabase, input.runId, { status: "queued", updated_at: input.nowIso });
  console.info("[workflows/runner] resumed waiting workflow step", {
    runId: input.runId,
    stepRunId: input.stepRunId,
    requiredConversationVersion: input.requiredConversationVersion
  });
}

async function refreshWaitingMetadata(input: {
  supabase: SupabaseAdmin;
  stepRunId: string;
  runId: string;
  nowIso: string;
  waitingReason: "waiting_for_audio_transcript" | "waiting_for_conversation_insights";
  errorText: string;
  requiredConversationVersion: number;
  currentTranscriptVersion: number | null;
  currentInsightsVersion: number | null;
}) {
  await updateStep(input.supabase, input.stepRunId, {
    status: input.waitingReason,
    error_text: input.errorText,
    error_code: input.waitingReason,
    waiting_reason: input.waitingReason,
    required_conversation_version: input.requiredConversationVersion,
    current_transcript_version: input.currentTranscriptVersion,
    current_insights_version: input.currentInsightsVersion,
    updated_at: input.nowIso
  });
  await updateRun(input.supabase, input.runId, { status: input.waitingReason, updated_at: input.nowIso });
}

async function markTimedOut(input: {
  supabase: SupabaseAdmin;
  stepRunId: string;
  runId: string;
  nowIso: string;
  errorCode: "timed_out_waiting_for_audio_transcript" | "timed_out_waiting_for_insights";
  errorText: string;
}) {
  await updateStep(input.supabase, input.stepRunId, {
    status: "failed",
    completed_at: input.nowIso,
    error_text: input.errorText,
    error_code: input.errorCode,
    updated_at: input.nowIso
  });
  await updateRun(input.supabase, input.runId, {
    status: "failed",
    completed_at: input.nowIso,
    updated_at: input.nowIso
  });
  console.warn("[workflows/runner] timed out waiting workflow step", {
    runId: input.runId,
    stepRunId: input.stepRunId,
    errorCode: input.errorCode
  });
}

async function updateStep(supabase: SupabaseAdmin, stepRunId: string, patch: Record<string, unknown>) {
  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_step_runs")
    .update(patch)
    .eq("id", stepRunId);
  if (error) {
    throw new Error(error.message ?? "Failed updating waiting workflow step.");
  }
}

async function updateRun(supabase: SupabaseAdmin, runId: string, patch: Record<string, unknown>) {
  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_runs")
    .update(patch)
    .eq("id", runId);
  if (error) {
    throw new Error(error.message ?? "Failed updating waiting workflow run.");
  }
}
