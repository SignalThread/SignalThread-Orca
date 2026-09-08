/** Canonical system signal name (default starting point in the Signal Library). */
export const AI_VOICE_SUMMARY_SIGNAL_NAME = "AI Voice Summary";

/** Canonical Campaign Agent display name. */
export const CONVERSATION_BRIEF_AGENT_NAME = "Conversation Brief Agent";

/** Legacy DB / fixture name — still treated as the same system signal. */
export const AI_SUMMARY_SIGNAL_NAME = "AI Summary";

export function isAiSummarySignalName(name: string | null | undefined) {
  const n = String(name ?? "").trim().toLowerCase();
  return (
    n === CONVERSATION_BRIEF_AGENT_NAME.toLowerCase() ||
    n === AI_VOICE_SUMMARY_SIGNAL_NAME.toLowerCase() ||
    n === AI_SUMMARY_SIGNAL_NAME.toLowerCase()
  );
}

export function normalizeConversationSummary(value: unknown) {
  const summary = String(value ?? "").trim();
  return summary.length > 0 ? summary : null;
}

export function combineConversationSummaries(summaries: string[]) {
  const normalized = [...new Set(summaries.map((summary) => summary.trim()).filter(Boolean))];
  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length === 1) {
    return normalized[0];
  }

  return `Combined conversation summary across selected leads:\n${normalized
    .map((summary, index) => `${index + 1}. ${summary}`)
    .join("\n")}`;
}
