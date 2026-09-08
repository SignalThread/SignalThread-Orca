/**
 * P1 Provider Failure Spike health.
 *
 * Answers: "Are AI/provider failures spiking even if the core app is online?"
 *
 * Separates *actionable* provider failures (transcription/synthesis failed with content) from
 * legitimate empty/no-speech recordings, mirroring the conversation-lifecycle classification:
 * a no-speech row is a completed transcription with an empty transcript whose synthesis failed.
 * No transcript text, audio URLs, provider payloads, or raw error bodies are read or returned —
 * emptiness is detected with a server-side empty-string filter and only `created_at` is selected.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  buildHealthResponse,
  loadAllHealthRows,
  minutesBeforeIso,
  normalizeText,
  type LeadRetrievalHealthResponse,
  type ProductHealthIssue,
} from "@/lib/internal-health/shared";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const PROVIDER_FAILURE_SPIKES_SOURCE = "provider-failure-spikes";

export const RECENT_WINDOWS_MINUTES = [15, 60, 180] as const;
/** Window used to drive the health status. */
export const PRIMARY_WINDOW_MINUTES = 60;
export const MIN_VOLUME_FOR_RATE = 5;
export const WARNING_FAILURE_RATE = 0.2;
export const CRITICAL_FAILURE_COUNT = 5;

type ConversationStatusRow = {
  transcription_status: string | null;
  synthesis_status: string | null;
  created_at: string | null;
};
type CreatedAtRow = { created_at: string | null };

export async function getLeadRetrievalProviderFailureSpikesHealth(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
}): Promise<LeadRetrievalHealthResponse> {
  const checkedAt = input.nowIso ?? new Date().toISOString();
  const longestWindow = Math.max(...RECENT_WINDOWS_MINUTES);
  const recentCutoff = minutesBeforeIso(checkedAt, longestWindow);

  const [recentConversations, noSpeechRows] = await Promise.all([
    loadAllHealthRows<ConversationStatusRow>({
      supabase: input.supabase,
      table: "lead_conversations",
      select: "transcription_status, synthesis_status, created_at",
      configure: (query) => query.gte("created_at", recentCutoff),
      errorMessage: "Failed to load provider failure aggregate source.",
    }),
    // No-speech: completed transcription + failed synthesis + empty transcript. Only created_at
    // is selected; the empty-string filter never returns transcript text.
    loadAllHealthRows<CreatedAtRow>({
      supabase: input.supabase,
      table: "lead_conversations",
      select: "created_at",
      configure: (query) =>
        query
          .gte("created_at", recentCutoff)
          .eq("transcription_status", "completed")
          .eq("synthesis_status", "failed")
          .eq("transcript", ""),
      errorMessage: "Failed to load no-speech aggregate source.",
    }),
  ]);

  const metrics: LeadRetrievalHealthResponse["metrics"] = {};
  let primary: WindowCounts | null = null;

  for (const minutes of RECENT_WINDOWS_MINUTES) {
    const cutoff = minutesBeforeIso(checkedAt, minutes);
    const counts = computeWindowCounts(recentConversations, noSpeechRows, cutoff, checkedAt);

    metrics[`transcriptionFailures${minutes}m`] = counts.transcriptionFailures;
    metrics[`transcriptionSuccesses${minutes}m`] = counts.transcriptionSuccesses;
    metrics[`transcriptionFailureRate${minutes}m`] = rate(counts.transcriptionFailures, counts.transcriptionSuccesses);
    metrics[`synthesisFailures${minutes}m`] = counts.actionableSynthesisFailures;
    metrics[`synthesisSuccesses${minutes}m`] = counts.synthesisSuccesses;
    metrics[`synthesisFailureRate${minutes}m`] = rate(counts.actionableSynthesisFailures, counts.synthesisSuccesses);
    metrics[`noSpeechCount${minutes}m`] = counts.noSpeech;

    if (minutes === PRIMARY_WINDOW_MINUTES) primary = counts;
  }

  const issues: ProductHealthIssue[] = [];
  if (primary) {
    pushProviderFailureIssue(issues, {
      code: "transcription_provider_failures",
      label: "Transcription",
      failures: primary.transcriptionFailures,
      successes: primary.transcriptionSuccesses,
    });
    pushProviderFailureIssue(issues, {
      code: "synthesis_provider_failures",
      label: "Insight synthesis",
      failures: primary.actionableSynthesisFailures,
      successes: primary.synthesisSuccesses,
    });
  }

  return buildHealthResponse({
    source: PROVIDER_FAILURE_SPIKES_SOURCE,
    checkedAt,
    summary: buildSummary(primary),
    metrics,
    issues,
    window: { recentMinutes: PRIMARY_WINDOW_MINUTES },
  });
}

type WindowCounts = {
  transcriptionFailures: number;
  transcriptionSuccesses: number;
  actionableSynthesisFailures: number;
  synthesisSuccesses: number;
  noSpeech: number;
};

function computeWindowCounts(
  rows: ConversationStatusRow[],
  noSpeechRows: CreatedAtRow[],
  cutoff: string,
  nowIso: string
): WindowCounts {
  let transcriptionFailures = 0;
  let transcriptionSuccesses = 0;
  let synthesisFailures = 0;
  let synthesisSuccesses = 0;

  for (const row of rows) {
    if (!isWithin(row.created_at, cutoff, nowIso)) continue;
    const t = normalizeText(row.transcription_status);
    const s = normalizeText(row.synthesis_status);
    if (t === "failed") transcriptionFailures += 1;
    if (t === "completed") transcriptionSuccesses += 1;
    if (s === "failed") synthesisFailures += 1;
    if (s === "completed") synthesisSuccesses += 1;
  }

  let noSpeech = 0;
  for (const row of noSpeechRows) {
    if (isWithin(row.created_at, cutoff, nowIso)) noSpeech += 1;
  }

  // No-speech synthesis failures are legitimate and excluded from actionable failures.
  const actionableSynthesisFailures = Math.max(0, synthesisFailures - noSpeech);

  return {
    transcriptionFailures,
    transcriptionSuccesses,
    actionableSynthesisFailures,
    synthesisSuccesses,
    noSpeech,
  };
}

function pushProviderFailureIssue(
  issues: ProductHealthIssue[],
  input: { code: string; label: string; failures: number; successes: number }
): void {
  if (input.failures <= 0) return;
  // Critical when failures are spiking AND nothing is succeeding (provider broadly unavailable).
  const broadlyDown = input.failures >= CRITICAL_FAILURE_COUNT && input.successes === 0;
  const failureRate = rate(input.failures, input.successes);
  const elevated = failureRate >= WARNING_FAILURE_RATE && input.failures + input.successes >= MIN_VOLUME_FOR_RATE;

  issues.push({
    code: input.code,
    severity: broadlyDown ? "critical" : "warning",
    message: broadlyDown
      ? `${input.label} provider failures are spiking with no recent successes.`
      : elevated
        ? `${input.label} provider failure rate is elevated.`
        : `Some ${input.label.toLowerCase()} provider failures occurred recently.`,
    count: input.failures,
    threshold: CRITICAL_FAILURE_COUNT,
  });
}

function rate(failures: number, successes: number): number {
  const total = failures + successes;
  if (total <= 0) return 0;
  return Math.round((failures / total) * 100) / 100;
}

function isWithin(value: string | null | undefined, cutoffIso: string, nowIso: string): boolean {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) return false;
  const iso = new Date(ms).toISOString();
  return iso >= cutoffIso && iso <= nowIso;
}

function buildSummary(primary: WindowCounts | null): string {
  if (!primary) return "Provider failure spike check produced no window data.";
  const actionable = primary.transcriptionFailures + primary.actionableSynthesisFailures;
  if (actionable > 0) {
    return `Provider failures in the last ${PRIMARY_WINDOW_MINUTES}m: ${primary.transcriptionFailures} transcription, ${primary.actionableSynthesisFailures} synthesis (no-speech excluded: ${primary.noSpeech}).`;
  }
  return `Provider health nominal: no actionable transcription/synthesis failures in the last ${PRIMARY_WINDOW_MINUTES}m (no-speech: ${primary.noSpeech}).`;
}
