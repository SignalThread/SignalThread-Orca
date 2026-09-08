/**
 * P0 Capture + Recording Ingestion health.
 *
 * Answers: "Can exhibitors capture leads and submit recordings during an event?"
 *
 * Canonical capture path (verified from `app/api/conversations/upload/route.ts`):
 *   recording upload → insert `lead_conversations` row (storage_path, transcription_status='pending')
 *   → transcription processing advances status pending → processing → completed|failed.
 *
 * Aggregate-only and row-count safe. `storage_path` is never selected into memory or the
 * response — presence/absence is evaluated with server-side `is`/`not` filters so no audio
 * paths can leak.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  ageMinutes,
  buildHealthResponse,
  countWithinWindow,
  loadAllHealthRows,
  minIso,
  minutesBeforeIso,
  normalizeId,
  pushCountIssue,
  type LeadRetrievalHealthResponse,
  type ProductHealthIssue,
} from "@/lib/internal-health/shared";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const CAPTURE_RECORDING_SOURCE = "capture-recording-ingestion";

export const RECENT_WINDOW_SHORT_MINUTES = 15;
export const RECENT_WINDOW_MEDIUM_MINUTES = 30;
export const RECENT_WINDOW_LONG_MINUTES = 60;

/** A recording row that still has not begun transcription after this long is "stuck". */
export const STUCK_PENDING_TRANSCRIPTION_MINUTES = 15;
export const CRITICAL_STUCK_PENDING_COUNT = 5;
export const WARNING_STUCK_PENDING_COUNT = 1;

/** A non-terminal conversation row that never received an audio object is an ingestion gap. */
export const CRITICAL_MISSING_STORAGE_COUNT = 5;
export const WARNING_MISSING_STORAGE_COUNT = 1;

const NON_TERMINAL_TRANSCRIPTION_STATUSES = ["pending", "processing"] as const;
const ENTERING_TRANSCRIPTION_STATUSES = ["pending", "processing", "completed", "failed"] as const;

type LeadActivityRow = { created_at: string | null; company_id: string | null; event_id: string | null };
type ConversationActivityRow = { created_at: string | null; transcription_status: string | null };
type StuckRow = { created_at: string | null };

export async function getLeadRetrievalCaptureRecordingIngestionHealth(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
}): Promise<LeadRetrievalHealthResponse> {
  const checkedAt = input.nowIso ?? new Date().toISOString();
  const recentCutoff = minutesBeforeIso(checkedAt, RECENT_WINDOW_LONG_MINUTES);
  const stuckCutoff = minutesBeforeIso(checkedAt, STUCK_PENDING_TRANSCRIPTION_MINUTES);

  const [recentLeads, recentConversations, stuckPendingRows, missingStorageRows] = await Promise.all([
    // Recent lead inserts, bounded to the long event-floor window for performance.
    loadAllHealthRows<LeadActivityRow>({
      supabase: input.supabase,
      table: "leads",
      select: "created_at, company_id, event_id",
      configure: (query) => query.gte("created_at", recentCutoff),
      errorMessage: "Failed to load recent lead capture activity.",
    }),
    // Recent recording/conversation rows, bounded to the long window.
    loadAllHealthRows<ConversationActivityRow>({
      supabase: input.supabase,
      table: "lead_conversations",
      select: "created_at, transcription_status",
      configure: (query) => query.gte("created_at", recentCutoff),
      errorMessage: "Failed to load recent recording ingestion activity.",
    }),
    // Recordings that arrived (storage present) but never began transcription past the threshold.
    loadAllHealthRows<StuckRow>({
      supabase: input.supabase,
      table: "lead_conversations",
      select: "created_at",
      configure: (query) =>
        query
          .eq("transcription_status", "pending")
          .not("storage_path", "is", null)
          .lte("created_at", stuckCutoff),
      errorMessage: "Failed to load stuck recording ingestion source.",
    }),
    // Non-terminal conversation rows missing an audio object entirely (ingestion gap).
    loadAllHealthRows<StuckRow>({
      supabase: input.supabase,
      table: "lead_conversations",
      select: "created_at",
      configure: (query) =>
        query.in("transcription_status", [...NON_TERMINAL_TRANSCRIPTION_STATUSES]).is("storage_path", null),
      errorMessage: "Failed to load missing-storage ingestion source.",
    }),
  ]);

  const leadCreatedAts = recentLeads.map((row) => row.created_at);
  const conversationCreatedAts = recentConversations.map((row) => row.created_at);

  const leadInsertsLast15m = countWithinWindow(leadCreatedAts, checkedAt, RECENT_WINDOW_SHORT_MINUTES);
  const leadInsertsLast30m = countWithinWindow(leadCreatedAts, checkedAt, RECENT_WINDOW_MEDIUM_MINUTES);
  const leadInsertsLast60m = countWithinWindow(leadCreatedAts, checkedAt, RECENT_WINDOW_LONG_MINUTES);

  const recordingRowsLast15m = countWithinWindow(conversationCreatedAts, checkedAt, RECENT_WINDOW_SHORT_MINUTES);
  const recordingRowsLast30m = countWithinWindow(conversationCreatedAts, checkedAt, RECENT_WINDOW_MEDIUM_MINUTES);
  const recordingRowsLast60m = countWithinWindow(conversationCreatedAts, checkedAt, RECENT_WINDOW_LONG_MINUTES);

  const recordingsEnteringTranscriptionLast60m = recentConversations.filter((row) =>
    (ENTERING_TRANSCRIPTION_STATUSES as readonly string[]).includes(String(row.transcription_status ?? "").trim().toLowerCase())
  ).length;

  const distinctCompaniesActiveLast60m = countDistinct(recentLeads.map((row) => normalizeId(row.company_id)));
  const distinctEventsActiveLast60m = countDistinct(recentLeads.map((row) => normalizeId(row.event_id)));

  const stuckPendingTranscriptionCount = stuckPendingRows.length;
  const oldestStuckPendingAt = minIso(stuckPendingRows.map((row) => row.created_at));
  const oldestStuckPendingAgeMinutes = oldestStuckPendingAt
    ? roundOrNull(ageMinutes(oldestStuckPendingAt, checkedAt))
    : null;

  const missingStorageNonTerminalCount = missingStorageRows.length;
  const oldestMissingStorageAt = minIso(missingStorageRows.map((row) => row.created_at));
  const oldestMissingStorageAgeMinutes = oldestMissingStorageAt
    ? roundOrNull(ageMinutes(oldestMissingStorageAt, checkedAt))
    : null;

  const issues: ProductHealthIssue[] = [];
  pushCountIssue(issues, {
    code: "recordings_stuck_before_transcription",
    count: stuckPendingTranscriptionCount,
    warningAt: WARNING_STUCK_PENDING_COUNT,
    criticalAt: CRITICAL_STUCK_PENDING_COUNT,
    warningMessage: "Some recordings arrived but have not begun transcription beyond the health threshold.",
    criticalMessage: "Multiple recordings arrived but are stuck before transcription begins.",
    oldestAgeMinutes: oldestStuckPendingAgeMinutes,
  });
  pushCountIssue(issues, {
    code: "recordings_missing_storage_path",
    count: missingStorageNonTerminalCount,
    warningAt: WARNING_MISSING_STORAGE_COUNT,
    criticalAt: CRITICAL_MISSING_STORAGE_COUNT,
    warningMessage: "Some conversation rows are missing their uploaded audio object.",
    criticalMessage: "Multiple conversation rows are missing their uploaded audio object (upload-to-conversation gap).",
    oldestAgeMinutes: oldestMissingStorageAgeMinutes,
  });

  const metrics: LeadRetrievalHealthResponse["metrics"] = {
    leadInsertsLast15m,
    leadInsertsLast30m,
    leadInsertsLast60m,
    recordingRowsLast15m,
    recordingRowsLast30m,
    recordingRowsLast60m,
    recordingsEnteringTranscriptionLast60m,
    distinctCompaniesActiveLast60m,
    distinctEventsActiveLast60m,
    stuckPendingTranscriptionCount,
    oldestStuckPendingAgeMinutes,
    missingStorageNonTerminalCount,
    oldestMissingStorageAgeMinutes,
  };

  const response = buildHealthResponse({
    source: CAPTURE_RECORDING_SOURCE,
    checkedAt,
    summary: buildSummary({
      stuckPendingTranscriptionCount,
      missingStorageNonTerminalCount,
      recordingRowsLast60m,
      leadInsertsLast60m,
    }),
    metrics,
    issues,
    window: {
      recentMinutes: RECENT_WINDOW_LONG_MINUTES,
      staleAfterMinutes: STUCK_PENDING_TRANSCRIPTION_MINUTES,
    },
  });

  return response;
}

function buildSummary(input: {
  stuckPendingTranscriptionCount: number;
  missingStorageNonTerminalCount: number;
  recordingRowsLast60m: number;
  leadInsertsLast60m: number;
}): string {
  if (input.stuckPendingTranscriptionCount > 0 || input.missingStorageNonTerminalCount > 0) {
    return `Capture/recording ingestion degraded: ${input.stuckPendingTranscriptionCount} recordings stuck before transcription, ${input.missingStorageNonTerminalCount} missing audio.`;
  }
  return `Capture/recording ingestion healthy: ${input.recordingRowsLast60m} recordings and ${input.leadInsertsLast60m} leads in the last ${RECENT_WINDOW_LONG_MINUTES}m, none stuck.`;
}

function countDistinct(values: ReadonlyArray<string | null>): number {
  const set = new Set<string>();
  for (const value of values) {
    if (value) set.add(value);
  }
  return set.size;
}

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}
