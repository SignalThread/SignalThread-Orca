import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowStepRunRow } from "../contracts/workflow-types";

export type ClaimedStepRun = WorkflowStepRunRow;

/**
 * Claim one queued, due `workflow_step_runs` row for execution.
 *
 * Implementation note: PostgREST does not expose `FOR UPDATE SKIP LOCKED` directly. We use
 * a serializable two-step "select + conditional update with attempt_id and prior status guard"
 * which is *almost* race-safe under the volumes we expect. To get true skip-locked semantics
 * later, we will replace this with a SQL function (Phase 7). For Phase 2 — where there is
 * exactly one cron-driven worker and no concurrent ticks — this is sufficient.
 *
 * Returns null if no queued step is due.
 */
export async function claimNextDueStepRun(input: {
  supabase: ReturnType<typeof createAdminClient>;
  nowIso?: string;
  runId?: string;
}): Promise<ClaimedStepRun | null> {
  const supabase = input.supabase;
  const nowIso = input.nowIso ?? new Date().toISOString();

  // 1. Find the oldest queued, due row.
  let pickQuery = (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => unknown;
      };
    };
  })
    .from("workflow_step_runs")
    .select(
      "id, run_id, step_id, step_index, step_key, status, attempt_count, attempt_id, scheduled_at, started_at, completed_at, input_jsonb, output_jsonb, error_text, error_code, created_at, updated_at"
    )
    .eq("status", "queued") as any;

  if (input.runId) {
    pickQuery = pickQuery.eq("run_id", input.runId);
  }

  const { data: candidate, error: pickError } = await pickQuery
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pickError) {
    console.warn("[workflows/runner] claim pick failed", { message: pickError.message });
    return null;
  }

  if (!candidate) return null;

  // 2. Compare-and-set: only succeed if status is still 'queued' (no other tick has claimed it).
  const newAttemptId = generateAttemptId();
  const newAttemptCount = candidate.attempt_count + 1;

  const { data: claimed, error: updateError } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            select: (cols: string) => {
              maybeSingle: () => Promise<{
                data: WorkflowStepRunRow | null;
                error: { message: string; code?: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from("workflow_step_runs")
    .update({
      status: "running",
      attempt_count: newAttemptCount,
      attempt_id: newAttemptId,
      started_at: nowIso,
      error_text: null,
      error_code: null,
      updated_at: nowIso
    })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select(
      "id, run_id, step_id, step_index, step_key, status, attempt_count, attempt_id, scheduled_at, started_at, completed_at, input_jsonb, output_jsonb, error_text, error_code, created_at, updated_at"
    )
    .maybeSingle();

  if (updateError) {
    console.warn("[workflows/runner] claim update failed", {
      stepRunId: candidate.id,
      message: updateError.message
    });
    return null;
  }

  // Lost the race: another tick already moved this step out of 'queued'. Try next tick.
  if (!claimed) return null;

  return claimed;
}

function generateAttemptId(): string {
  // Reuse Web Crypto when available; fall back to a non-cryptographic id (still unique enough
  // for "did the same tick that wrote this row also do the work?" identity). Worker does not
  // rely on attempt_id for security, only for at-most-one-claim accounting.
  const cryptoObj: Crypto | undefined =
    typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `att_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
}
