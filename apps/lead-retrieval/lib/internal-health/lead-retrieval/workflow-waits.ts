/**
 * P0 Workflow Waits health.
 *
 * Answers: "Are automations blocked after capture?"
 *
 * Aggregates `workflow_step_runs` rows in a waiting state. Two families are tracked
 * separately because they mean different things:
 *  - automation waits (audio transcript / conversation insights / generic waiting) block
 *    the post-capture automation handoff and can escalate to critical when stuck.
 *  - approval waits (`awaiting_approval`) are intentional human-in-the-loop pauses and are
 *    never treated as an outage; they only warn when extremely old.
 *
 * Read-only and aggregate-only. No row IDs, step keys, lead IDs, or customer content are
 * returned — only counts, reason labels, and ages.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  ageMinutes,
  buildHealthResponse,
  loadAllHealthRows,
  minIso,
  minutesBeforeIso,
  normalizeText,
  type LeadRetrievalHealthResponse,
  type ProductHealthIssue,
} from "@/lib/internal-health/shared";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const WORKFLOW_WAITS_SOURCE = "workflow-waits";

export const WORKFLOW_WAIT_STALE_MINUTES = 15;
export const CRITICAL_STUCK_AUTOMATION_WAIT_COUNT = 5;
export const WARNING_STUCK_AUTOMATION_WAIT_COUNT = 1;
export const APPROVAL_WAIT_STALE_MINUTES = 24 * 60;
export const RECENT_WINDOW_MINUTES = 60;

const ACTIVE_WAIT_STATUSES = [
  "waiting",
  "waiting_for_audio_transcript",
  "waiting_for_conversation_insights",
  "waiting_for_insights",
  "awaiting_approval",
] as const;

const RESOLVED_STATUSES = ["completed", "failed"] as const;

type WaitRow = {
  status: string | null;
  waiting_reason: string | null;
  wait_started_at: string | null;
  created_at: string | null;
};

type ResolvedWaitRow = {
  status: string | null;
  wait_started_at: string | null;
  completed_at: string | null;
};

export type WorkflowWaitCategory = "automation" | "approval";

/** Canonical classifier: maps a row's status/reason to a stable reason label + family. */
export function classifyWorkflowWait(row: { status: string | null; waiting_reason: string | null }): {
  reason: string;
  category: WorkflowWaitCategory;
} {
  const status = normalizeText(row.status);
  const reasonRaw = normalizeText(row.waiting_reason);

  if (status === "awaiting_approval") {
    return { reason: "awaiting_approval", category: "approval" };
  }

  const reason =
    reasonRaw && reasonRaw.startsWith("waiting_for_")
      ? reasonRaw
      : status.startsWith("waiting_for_")
        ? status
        : "waiting";

  return { reason, category: "automation" };
}

export async function getLeadRetrievalWorkflowWaitsHealth(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
}): Promise<LeadRetrievalHealthResponse> {
  const checkedAt = input.nowIso ?? new Date().toISOString();
  const staleCutoff = minutesBeforeIso(checkedAt, WORKFLOW_WAIT_STALE_MINUTES);
  const approvalStaleCutoff = minutesBeforeIso(checkedAt, APPROVAL_WAIT_STALE_MINUTES);
  const recentCutoff = minutesBeforeIso(checkedAt, RECENT_WINDOW_MINUTES);

  const [activeWaits, resolvedWaits] = await Promise.all([
    loadAllHealthRows<WaitRow>({
      supabase: input.supabase,
      table: "workflow_step_runs",
      select: "status, waiting_reason, wait_started_at, created_at",
      configure: (query) => query.in("status", [...ACTIVE_WAIT_STATUSES]),
      errorMessage: "Failed to load active workflow wait source.",
    }),
    // Best-effort resolution signal: steps that had waited and resolved within the window.
    loadAllHealthRows<ResolvedWaitRow>({
      supabase: input.supabase,
      table: "workflow_step_runs",
      select: "status, wait_started_at, completed_at",
      configure: (query) =>
        query.in("status", [...RESOLVED_STATUSES]).not("wait_started_at", "is", null).gte("completed_at", recentCutoff),
      errorMessage: "Failed to load resolved workflow wait source.",
    }),
  ]);

  const byReason = new Map<string, { count: number; category: WorkflowWaitCategory; oldestAt: string | null }>();
  let automationWaitCount = 0;
  let approvalWaitCount = 0;
  let stuckAutomationWaitCount = 0;
  let stuckApprovalWaitCount = 0;
  let recentAutomationWaitsStarted = 0;
  const automationWaitStartedAts: Array<string | null> = [];
  const approvalWaitStartedAts: Array<string | null> = [];

  for (const row of activeWaits) {
    const { reason, category } = classifyWorkflowWait(row);
    const waitStartedAt = row.wait_started_at ?? row.created_at;
    const existing = byReason.get(reason) ?? { count: 0, category, oldestAt: null };
    byReason.set(reason, {
      count: existing.count + 1,
      category,
      oldestAt: minIso([existing.oldestAt, waitStartedAt]),
    });

    if (category === "automation") {
      automationWaitCount += 1;
      automationWaitStartedAts.push(waitStartedAt);
      if (isAtOrBeforeCutoff(waitStartedAt, staleCutoff)) stuckAutomationWaitCount += 1;
      if (isAtOrAfterCutoff(waitStartedAt, recentCutoff)) recentAutomationWaitsStarted += 1;
    } else {
      approvalWaitCount += 1;
      approvalWaitStartedAts.push(waitStartedAt);
      if (isAtOrBeforeCutoff(waitStartedAt, approvalStaleCutoff)) stuckApprovalWaitCount += 1;
    }
  }

  const totalActiveWaits = automationWaitCount + approvalWaitCount;
  const oldestAutomationWaitAt = minIso(automationWaitStartedAts);
  const oldestApprovalWaitAt = minIso(approvalWaitStartedAts);
  const oldestActiveWaitAt = minIso([oldestAutomationWaitAt, oldestApprovalWaitAt]);
  const recentlyResolvedWaitsLast60m = resolvedWaits.length;

  const waitsByReason = [...byReason.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, value]) => ({
      reason,
      count: value.count,
      category: value.category,
      oldestWaitAgeMinutes: roundOrNull(ageMinutes(value.oldestAt, checkedAt)),
    }));

  const issues: ProductHealthIssue[] = [];

  // Automation waits that are stuck block the post-capture handoff. Critical only when they
  // are accumulating AND nothing is resolving (per plan), otherwise warning.
  if (stuckAutomationWaitCount > 0) {
    const accumulatingWithoutResolution =
      stuckAutomationWaitCount >= CRITICAL_STUCK_AUTOMATION_WAIT_COUNT && recentlyResolvedWaitsLast60m === 0;
    issues.push({
      code: "stuck_automation_workflow_waits",
      severity: accumulatingWithoutResolution ? "critical" : "warning",
      message: accumulatingWithoutResolution
        ? "Workflow automation waits are accumulating beyond the health threshold with no recent resolutions."
        : "Workflow automation steps are waiting on capture readiness beyond the health threshold.",
      count: stuckAutomationWaitCount,
      threshold: CRITICAL_STUCK_AUTOMATION_WAIT_COUNT,
      oldestAgeMinutes: roundOrZero(ageMinutes(oldestAutomationWaitAt, checkedAt)),
    });
  }

  // Approval waits are intentional; only warn when extremely old.
  if (stuckApprovalWaitCount > 0) {
    issues.push({
      code: "stale_approval_workflow_waits",
      severity: "warning",
      message: "Workflow approval steps have been awaiting human approval for an extended period.",
      count: stuckApprovalWaitCount,
      threshold: 1,
      oldestAgeMinutes: roundOrZero(ageMinutes(oldestApprovalWaitAt, checkedAt)),
    });
  }

  const metrics: LeadRetrievalHealthResponse["metrics"] = {
    totalActiveWaits,
    automationWaitCount,
    approvalWaitCount,
    audioTranscriptWaitCount: reasonCount(byReason, "waiting_for_audio_transcript"),
    conversationInsightsWaitCount:
      reasonCount(byReason, "waiting_for_conversation_insights") + reasonCount(byReason, "waiting_for_insights"),
    genericWaitCount: reasonCount(byReason, "waiting"),
    stuckAutomationWaitCount,
    stuckApprovalWaitCount,
    oldestActiveWaitAgeMinutes: roundOrNull(ageMinutes(oldestActiveWaitAt, checkedAt)),
    oldestAutomationWaitAgeMinutes: roundOrNull(ageMinutes(oldestAutomationWaitAt, checkedAt)),
    recentAutomationWaitsStartedLast60m: recentAutomationWaitsStarted,
    recentlyResolvedWaitsLast60m,
  };

  return buildHealthResponse({
    source: WORKFLOW_WAITS_SOURCE,
    checkedAt,
    summary: buildSummary({ stuckAutomationWaitCount, automationWaitCount, recentlyResolvedWaitsLast60m }),
    metrics,
    issues,
    window: { recentMinutes: RECENT_WINDOW_MINUTES, staleAfterMinutes: WORKFLOW_WAIT_STALE_MINUTES },
  });
}

function buildSummary(input: {
  stuckAutomationWaitCount: number;
  automationWaitCount: number;
  recentlyResolvedWaitsLast60m: number;
}): string {
  if (input.stuckAutomationWaitCount > 0) {
    return `Workflow automation degraded: ${input.stuckAutomationWaitCount} stuck waits, ${input.recentlyResolvedWaitsLast60m} resolved in the last ${RECENT_WINDOW_MINUTES}m.`;
  }
  return `Workflow automation healthy: ${input.automationWaitCount} active automation waits, none stuck.`;
}

function reasonCount(
  byReason: Map<string, { count: number }>,
  reason: string
): number {
  return byReason.get(reason)?.count ?? 0;
}

function isAtOrBeforeCutoff(value: string | null | undefined, cutoffIso: string): boolean {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString() <= cutoffIso;
}

function isAtOrAfterCutoff(value: string | null | undefined, cutoffIso: string): boolean {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString() >= cutoffIso;
}

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}

function roundOrZero(value: number | null): number {
  return value == null ? 0 : Math.round(value);
}
