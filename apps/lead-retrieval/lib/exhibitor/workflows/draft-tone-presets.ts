/**
 * Authoring tone presets for AI draft steps — stored as `authoringToneHint` on compose params.
 * The compose runner ignores this key today; it is for operator clarity and future routing.
 */

export type WorkflowDraftTonePreset = {
  id: string;
  label: string;
  description: string;
};

export const WORKFLOW_DRAFT_TONE_PRESETS: readonly WorkflowDraftTonePreset[] = [
  {
    id: "balanced_consultative",
    label: "Balanced · consultative",
    description: "Trusted advisor tone with crisp proof points."
  },
  {
    id: "direct_brevity",
    label: "Direct · executive brief",
    description: "Short, decisive language for busy readers."
  },
  {
    id: "warm_human",
    label: "Warm · human",
    description: "Approachable voice while staying professional."
  },
  {
    id: "technical_precise",
    label: "Technical · precise",
    description: "Specific vocabulary for practitioner audiences."
  }
] as const;

const TONE_IDS = new Set(WORKFLOW_DRAFT_TONE_PRESETS.map((p) => p.id));

export function normalizeAuthoringToneHint(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t || !TONE_IDS.has(t)) return null;
  return t;
}
