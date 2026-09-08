/**
 * Placeholder "brief quality" metrics — kept for legacy/demo callers only; import batch briefings no longer use this.
 */

export type PlaceholderBriefingIntegrity = {
  label: string;
  profilePct: number;
  historyPct: number;
};

/** Stable pseudo-random percentages per id (deterministic, not real scores). */
export function placeholderBriefingIntegrity(leadId: string): PlaceholderBriefingIntegrity {
  let h = 0;
  for (let i = 0; i < leadId.length; i++) {
    h = (h * 31 + leadId.charCodeAt(i)) >>> 0;
  }
  const profilePct = 60 + (h % 40);
  const historyPct = 50 + ((h >> 8) % 45);
  return {
    label: "Preview — not scored yet",
    profilePct,
    historyPct,
  };
}
