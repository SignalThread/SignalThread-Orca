import type { createAdminClient } from "@/lib/supabase/admin";
import {
  reconcileRecentLeadCapturedWorkflows,
  type LeadWorkflowReconcilerResult
} from "./lead-workflow-reconciler";

const DEFAULT_DRY_RUN_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_DRY_RUN_LIMIT = 10;
const MAX_CRON_SAFE_CREATE_LIMIT = 10;
const MAX_CRON_WINDOW_MINUTES = 60;

export type LeadWorkflowCronReconcilerResult = {
  mode: "dry-run" | "safe-create" | "safe-create-blocked";
  safeCreateEnabled: boolean;
  safeCreateReason: string | null;
  companyId: string | null;
  eventId: string | null;
  sinceIso: string;
  untilIso: string | null;
  limit: number;
  maxCreateCount: number | null;
  scannedLeadCount: number;
  decisionCount: number;
  wouldCreateCount: number;
  createdRunCount: number;
  skippedCount: number;
  skipReasons: Record<string, number>;
  alert: string | null;
  decisions: LeadWorkflowReconcilerResult["decisions"];
  preflight?: LeadWorkflowReconcilerResult;
};

export async function runLeadWorkflowReconcilerForCron(input: {
  supabase: ReturnType<typeof createAdminClient>;
  requestUrl: string;
  env?: Record<string, string | undefined>;
  nowIso?: string;
}): Promise<LeadWorkflowCronReconcilerResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const config = resolveCronReconcilerConfig({
    requestUrl: input.requestUrl,
    env: input.env ?? process.env,
    nowIso
  });

  if (config.mode === "dry-run") {
    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: input.supabase,
      dryRun: true,
      sinceIso: config.sinceIso,
      untilIso: config.untilIso,
      limit: config.limit,
      companyId: config.companyId,
      eventId: config.eventId,
      nowIso
    });
    return logAndShapeResult({
      mode: "dry-run",
      safeCreateEnabled: config.safeCreateEnabled,
      safeCreateReason: config.reason,
      maxCreateCount: config.maxCreateCount,
      result
    });
  }

  const preflight = await reconcileRecentLeadCapturedWorkflows({
    supabase: input.supabase,
    dryRun: true,
    sinceIso: config.sinceIso,
    untilIso: config.untilIso,
    limit: config.limit,
    companyId: config.companyId,
    eventId: config.eventId,
    nowIso
  });

  if (preflight.error) {
    return logAndShapeResult({
      mode: "safe-create-blocked",
      safeCreateEnabled: true,
      safeCreateReason: preflight.error,
      maxCreateCount: config.maxCreateCount,
      result: preflight,
      preflight,
      alert: "safe_create_preflight_failed"
    });
  }

  if (preflight.wouldCreateCount > config.maxCreateCount) {
    return logAndShapeResult({
      mode: "safe-create-blocked",
      safeCreateEnabled: true,
      safeCreateReason: "spike_guard_exceeded",
      maxCreateCount: config.maxCreateCount,
      result: preflight,
      preflight,
      alert: "workflow_reconciler_spike_guard_exceeded"
    });
  }

  const created = await reconcileRecentLeadCapturedWorkflows({
    supabase: input.supabase,
    safeCreate: true,
    sinceIso: config.sinceIso,
    untilIso: config.untilIso,
    limit: config.limit,
    companyId: config.companyId,
    eventId: config.eventId,
    nowIso
  });

  return logAndShapeResult({
    mode: created.createdRunCount > config.maxCreateCount ? "safe-create-blocked" : "safe-create",
    safeCreateEnabled: true,
    safeCreateReason:
      created.createdRunCount > config.maxCreateCount ? "created_count_exceeded_max" : null,
    maxCreateCount: config.maxCreateCount,
    result: created,
    preflight,
    alert:
      created.createdRunCount > config.maxCreateCount
        ? "workflow_reconciler_created_count_exceeded_max"
        : null
  });
}

export function resolveCronReconcilerConfig(input: {
  requestUrl: string;
  env: Record<string, string | undefined>;
  nowIso: string;
}):
  | {
      mode: "dry-run";
      safeCreateEnabled: boolean;
      reason: string | null;
      companyId: string | null;
      eventId: string | null;
      sinceIso: string;
      untilIso: string | null;
      limit: number;
      maxCreateCount: number | null;
    }
  | {
      mode: "safe-create";
      safeCreateEnabled: true;
      reason: null;
      companyId: string;
      eventId: string;
      sinceIso: string;
      untilIso: string;
      limit: number;
      maxCreateCount: number;
    } {
  const url = new URL(input.requestUrl);
  const queryCompanyId = cleanString(url.searchParams.get("companyId"));
  const queryEventId = cleanString(url.searchParams.get("eventId"));
  const querySinceIso = cleanString(url.searchParams.get("since"));
  const queryUntilIso = cleanString(url.searchParams.get("until"));
  const queryLimit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_DRY_RUN_LIMIT);

  const safeCreateEnabled =
    String(input.env.WORKFLOW_RECONCILER_CRON_SAFE_CREATE_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true";

  if (!safeCreateEnabled) {
    return {
      mode: "dry-run",
      safeCreateEnabled: false,
      reason: "safe_create_env_disabled",
      companyId: queryCompanyId,
      eventId: queryEventId,
      sinceIso: querySinceIso ?? new Date(Date.parse(input.nowIso) - DEFAULT_DRY_RUN_WINDOW_MS).toISOString(),
      untilIso: queryUntilIso,
      limit: Math.max(1, Math.min(50, queryLimit)),
      maxCreateCount: null
    };
  }

  const companyId = cleanString(input.env.WORKFLOW_RECONCILER_CRON_COMPANY_ID);
  const eventId = cleanString(input.env.WORKFLOW_RECONCILER_CRON_EVENT_ID);
  const companyAllowlist = parseAllowlist(input.env.WORKFLOW_RECONCILER_CRON_COMPANY_ALLOWLIST);
  const eventAllowlist = parseAllowlist(input.env.WORKFLOW_RECONCILER_CRON_EVENT_ALLOWLIST);
  const windowMinutes = parsePositiveInt(input.env.WORKFLOW_RECONCILER_CRON_WINDOW_MINUTES, NaN);
  const limit = parsePositiveInt(input.env.WORKFLOW_RECONCILER_CRON_LIMIT, NaN);
  const maxCreateCount = parsePositiveInt(input.env.WORKFLOW_RECONCILER_CRON_MAX_CREATE, NaN);

  const failClosed = (reason: string) => ({
    mode: "dry-run" as const,
    safeCreateEnabled: true,
    reason,
    companyId: queryCompanyId,
    eventId: queryEventId,
    sinceIso: querySinceIso ?? new Date(Date.parse(input.nowIso) - DEFAULT_DRY_RUN_WINDOW_MS).toISOString(),
    untilIso: queryUntilIso,
    limit: Math.max(1, Math.min(50, queryLimit)),
    maxCreateCount: Number.isFinite(maxCreateCount) ? maxCreateCount : null
  });

  if (!companyId || !eventId) return failClosed("missing_cron_company_or_event");
  if (companyAllowlist.size === 0 || eventAllowlist.size === 0) {
    return failClosed("missing_allowlist");
  }
  if (!companyAllowlist.has(companyId)) return failClosed("company_not_allowlisted");
  if (!eventAllowlist.has(eventId)) return failClosed("event_not_allowlisted");
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > MAX_CRON_WINDOW_MINUTES) {
    return failClosed("invalid_window_minutes");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CRON_SAFE_CREATE_LIMIT) {
    return failClosed("invalid_safe_create_limit");
  }
  if (!Number.isInteger(maxCreateCount) || maxCreateCount < 1 || maxCreateCount > limit) {
    return failClosed("invalid_max_create");
  }

  const untilIso = input.nowIso;
  const sinceIso = new Date(Date.parse(input.nowIso) - windowMinutes * 60 * 1000).toISOString();

  return {
    mode: "safe-create",
    safeCreateEnabled: true,
    reason: null,
    companyId,
    eventId,
    sinceIso,
    untilIso,
    limit,
    maxCreateCount
  };
}

function logAndShapeResult(input: {
  mode: LeadWorkflowCronReconcilerResult["mode"];
  safeCreateEnabled: boolean;
  safeCreateReason: string | null;
  maxCreateCount: number | null;
  result: LeadWorkflowReconcilerResult;
  preflight?: LeadWorkflowReconcilerResult;
  alert?: string | null;
}): LeadWorkflowCronReconcilerResult {
  const skipReasons = summarizeSkipReasons(input.result);
  const output: LeadWorkflowCronReconcilerResult = {
    mode: input.mode,
    safeCreateEnabled: input.safeCreateEnabled,
    safeCreateReason: input.safeCreateReason,
    companyId: input.result.companyId,
    eventId: input.result.eventId,
    sinceIso: input.result.sinceIso,
    untilIso: input.result.untilIso,
    limit: input.result.limit,
    maxCreateCount: input.maxCreateCount,
    scannedLeadCount: input.result.scannedLeadCount,
    decisionCount: input.result.decisionCount,
    wouldCreateCount: input.result.wouldCreateCount,
    createdRunCount: input.result.createdRunCount,
    skippedCount: input.result.skippedCount,
    skipReasons,
    alert: input.alert ?? null,
    decisions: input.result.decisions.slice(0, 10),
    preflight: input.preflight
  };

  console.info("[workflows/reconciler/cron] lead_captured reconcile result", {
    mode: output.mode,
    safeCreateEnabled: output.safeCreateEnabled,
    safeCreateReason: output.safeCreateReason,
    companyId: output.companyId,
    eventId: output.eventId,
    sinceIso: output.sinceIso,
    untilIso: output.untilIso,
    limit: output.limit,
    maxCreateCount: output.maxCreateCount,
    scannedLeadCount: output.scannedLeadCount,
    wouldCreateCount: output.wouldCreateCount,
    createdRunCount: output.createdRunCount,
    skippedCount: output.skippedCount,
    skipReasons: output.skipReasons,
    alert: output.alert
  });

  return output;
}

function summarizeSkipReasons(result: LeadWorkflowReconcilerResult) {
  const counts: Record<string, number> = {};
  for (const decision of result.decisions) {
    if (!decision.reasonSkipped) continue;
    counts[decision.reasonSkipped] = (counts[decision.reasonSkipped] ?? 0) + 1;
  }
  return counts;
}

function parseAllowlist(value: string | undefined) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

function parsePositiveInt(value: string | null | undefined, fallback: number) {
  const n = Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

function cleanString(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}
