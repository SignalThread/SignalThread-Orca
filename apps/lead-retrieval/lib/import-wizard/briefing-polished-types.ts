/**
 * AI-polished brief sections — same section shapes as deterministic output where applicable.
 * Optional fields fall back to deterministic rendering in the UI.
 */
export type BriefingPolishedStrategicGap = {
  gap: string;
  whyItMatters: string;
  probe: string;
};

export type BriefingPolishedBundle = {
  headline?: string;
  whyHere: string[];
  talkingPoints: { title: string; detail: string }[];
  questions: string[];
  competitorLines: string[];
  signals: string[];
  gaps?: BriefingPolishedStrategicGap[];
  /** Short framing lines — optional polish on identity subcopy */
  personaFitLine?: string | null;
  teamContextLine?: string | null;
};
