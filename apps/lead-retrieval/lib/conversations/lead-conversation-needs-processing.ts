/**
 * Pure gate: should we run (or re-run) `processConversationUpload` for this row?
 *
 * Idempotent: safe to call processing again when this returns true.
 */
export type LeadConversationProcessingSnapshot = {
  transcription_status: string | null;
  synthesis_status: string | null;
  transcript: string | null;
  summary: string | null;
};

export function leadConversationNeedsProcessing(row: LeadConversationProcessingSnapshot): boolean {
  const ts = String(row.transcription_status ?? "").trim().toLowerCase();
  const ss = String(row.synthesis_status ?? "").trim().toLowerCase();
  const hasTranscript = Boolean(String(row.transcript ?? "").trim());
  const hasSummary = Boolean(String(row.summary ?? "").trim());

  if (ts === "failed" || ss === "failed") return true;

  if (ts !== "completed") return true;

  // Transcription marked complete but no text — terminal for auto-synthesis; do not retry-loop in complete/finalize.
  if (!hasTranscript) return false;

  if (ss !== "completed") return true;

  if (!hasSummary) return true;

  return false;
}
