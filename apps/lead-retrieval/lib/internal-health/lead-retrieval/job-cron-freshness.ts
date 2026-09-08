/**
 * P1 Job / Cron Freshness health.
 *
 * Answers: "Are LR's own internal jobs actually running?"
 *
 * LR has a single Vercel cron — `/api/internal/workflow-tick` (every minute) — which executes
 * workflow runs and reconciles stale conversation processing. There is no heartbeat/job-log
 * table, so freshness is inferred from *work state* rather than a synthetic heartbeat (no new
 * scheduler/migration added):
 *   - overdue queued workflow steps (claimable in the past but still queued) ⇒ the tick is behind
 *   - stale conversation processing past the reconciler threshold ⇒ the reconciler is behind
 *   - recent workflow step activity ⇒ the tick is alive
 *
 * Staleness is only escalated when there is actually pending work to do (idle is healthy).
 * Read-only and aggregate-only; no row IDs or customer content.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  ageMinutes,
  buildHealthResponse,
  loadAllHealthRows,
  maxIso,
  minIso,
  minutesBeforeIso,
  normalizeText,
  type LeadRetrievalHealthResponse,
  type ProductHealthIssue,
} from "@/lib/internal-health/shared";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const JOB_CRON_FRESHNESS_SOURCE = "job-cron-freshness";

/** A queued step claimable this long in the past implies the tick is behind. */
export const WORKFLOW_TICK_OVERDUE_MINUTES = 10;
/** Conversation pending/processing past this implies the reconciler is behind. */
export const RECONCILER_STALE_MINUTES = 15;
/** No workflow step activity within this window (while work is pending) implies a stalled tick. */
export const TICK_ACTIVITY_WINDOW_MINUTES = 60;

export const CRITICAL_OVERDUE_STEP_COUNT = 5;
export const CRITICAL_STALE_PROCESSING_COUNT = 5;

const NON_TERMINAL_TRANSCRIPTION_STATUSES = ["pending", "processing"] as const;

type ScheduledRow = { scheduled_at: string | null };
type UpdatedRow = { updated_at: string | null };
type CreatedRow = { created_at: string | null };

export async function getLeadRetrievalJobCronFreshnessHealth(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
}): Promise<LeadRetrievalHealthResponse> {
  const checkedAt = input.nowIso ?? new Date().toISOString();
  const overdueCutoff = minutesBeforeIso(checkedAt, WORKFLOW_TICK_OVERDUE_MINUTES);
  const reconcilerStaleCutoff = minutesBeforeIso(checkedAt, RECONCILER_STALE_MINUTES);
  const activityCutoff = minutesBeforeIso(checkedAt, TICK_ACTIVITY_WINDOW_MINUTES);

  const [queuedSteps, recentActivity, staleProcessing] = await Promise.all([
    loadAllHealthRows<ScheduledRow>({
      supabase: input.supabase,
      table: "workflow_step_runs",
      select: "scheduled_at",
      configure: (query) => query.eq("status", "queued"),
      errorMessage: "Failed to load queued workflow step source.",
    }),
    loadAllHealthRows<UpdatedRow>({
      supabase: input.supabase,
      table: "workflow_step_runs",
      select: "updated_at",
      configure: (query) => query.gte("updated_at", activityCutoff),
      errorMessage: "Failed to load workflow tick activity source.",
    }),
    loadAllHealthRows<CreatedRow>({
      supabase: input.supabase,
      table: "lead_conversations",
      select: "created_at",
      configure: (query) =>
        query.in("transcription_status", [...NON_TERMINAL_TRANSCRIPTION_STATUSES]).lte("created_at", reconcilerStaleCutoff),
      errorMessage: "Failed to load stale conversation processing source.",
    }),
  ]);

  // Claimable-now and overdue queued steps. 'infinity'-scheduled future steps sort after any ISO
  // timestamp, so they are naturally excluded by the cutoff comparisons.
  let pendingQueuedSteps = 0;
  let overdueQueuedSteps = 0;
  const overdueScheduledAts: Array<string | null> = [];
  for (const row of queuedSteps) {
    const scheduledAt = normalizeScheduled(row.scheduled_at);
    if (!scheduledAt) continue;
    if (scheduledAt <= checkedAt) pendingQueuedSteps += 1;
    if (scheduledAt <= overdueCutoff) {
      overdueQueuedSteps += 1;
      overdueScheduledAts.push(scheduledAt);
    }
  }

  const recentWorkflowStepUpdates = recentActivity.length;
  const lastWorkflowStepActivityAt = maxIso(recentActivity.map((row) => row.updated_at));
  const workflowStepActivityAgeMinutes = roundOrNull(ageMinutes(lastWorkflowStepActivityAt, checkedAt));

  const staleConversationProcessing = staleProcessing.length;
  const oldestStaleProcessingAt = minIso(staleProcessing.map((row) => row.created_at));
  const oldestStaleProcessingAgeMinutes = roundOrNull(ageMinutes(oldestStaleProcessingAt, checkedAt));
  const oldestOverdueAt = minIso(overdueScheduledAts);
  const oldestOverdueAgeMinutes = roundOrNull(ageMinutes(oldestOverdueAt, checkedAt));

  const pendingWorkExists = pendingQueuedSteps > 0 || staleConversationProcessing > 0;
  const tickAppearsStalled = pendingWorkExists && recentWorkflowStepUpdates === 0;

  const issues: ProductHealthIssue[] = [];

  // Overdue queued steps: the tick should have claimed these. Critical when many remain.
  if (overdueQueuedSteps > 0) {
    issues.push({
      code: "workflow_tick_overdue_steps",
      severity: overdueQueuedSteps >= CRITICAL_OVERDUE_STEP_COUNT ? "critical" : "warning",
      message:
        overdueQueuedSteps >= CRITICAL_OVERDUE_STEP_COUNT
          ? "Many workflow steps are overdue for claiming; the workflow tick appears to be behind."
          : "Some workflow steps are overdue for claiming by the workflow tick.",
      count: overdueQueuedSteps,
      threshold: CRITICAL_OVERDUE_STEP_COUNT,
      oldestAgeMinutes: oldestOverdueAgeMinutes ?? undefined,
    });
  }

  // Stale conversation processing: the reconciler (inside the tick) should have requeued these.
  if (staleConversationProcessing > 0) {
    issues.push({
      code: "reconciler_stale_conversation_processing",
      severity: staleConversationProcessing >= CRITICAL_STALE_PROCESSING_COUNT ? "critical" : "warning",
      message:
        staleConversationProcessing >= CRITICAL_STALE_PROCESSING_COUNT
          ? "Many conversations are stale in processing; the reconciler appears to be behind."
          : "Some conversations are stale in processing past the reconciler threshold.",
      count: staleConversationProcessing,
      threshold: CRITICAL_STALE_PROCESSING_COUNT,
      oldestAgeMinutes: oldestStaleProcessingAgeMinutes ?? undefined,
    });
  }

  // Backstop: pending work exists but the tick has shown no activity at all in the window.
  if (tickAppearsStalled) {
    issues.push({
      code: "workflow_tick_no_recent_activity",
      severity: "critical",
      message: "Pending workflow/conversation work exists but the workflow tick has shown no recent activity.",
      count: pendingQueuedSteps + staleConversationProcessing,
    });
  }

  const metrics: LeadRetrievalHealthResponse["metrics"] = {
    pendingQueuedSteps,
    overdueQueuedSteps,
    oldestOverdueStepAgeMinutes: oldestOverdueAgeMinutes,
    recentWorkflowStepUpdates,
    workflowStepActivityAgeMinutes,
    staleConversationProcessing,
    oldestStaleProcessingAgeMinutes,
    pendingWorkExists,
  };

  return buildHealthResponse({
    source: JOB_CRON_FRESHNESS_SOURCE,
    checkedAt,
    summary: buildSummary({ overdueQueuedSteps, staleConversationProcessing, tickAppearsStalled }),
    metrics,
    issues,
    window: {
      recentMinutes: TICK_ACTIVITY_WINDOW_MINUTES,
      staleAfterMinutes: WORKFLOW_TICK_OVERDUE_MINUTES,
    },
  });
}

function normalizeScheduled(value: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "infinity") return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function buildSummary(input: {
  overdueQueuedSteps: number;
  staleConversationProcessing: number;
  tickAppearsStalled: boolean;
}): string {
  if (input.tickAppearsStalled) {
    return "Background jobs degraded: pending work exists but the workflow tick shows no recent activity.";
  }
  if (input.overdueQueuedSteps > 0 || input.staleConversationProcessing > 0) {
    return `Background jobs behind: ${input.overdueQueuedSteps} overdue workflow steps, ${input.staleConversationProcessing} stale conversations.`;
  }
  return "Background jobs fresh: no overdue workflow steps or stale conversation processing.";
}

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}
