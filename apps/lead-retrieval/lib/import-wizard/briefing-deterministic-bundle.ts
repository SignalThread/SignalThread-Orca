/**
 * Serializable deterministic brief content — same compositors as {@link ImportBriefingViewSections}.
 * Used as the grounded input for the AI polish pass (server + client stay aligned).
 */

import type { BatchBriefingContextV1 } from "@/lib/import-wizard/batch-briefing-context";
import type { BriefingDetailView } from "@/lib/import-wizard/briefing-detail-model";
import {
  composeIdentityBlock,
  composeStrategicQuestions,
  composeStrategicTalkingPoints,
  composeWhyTheyMatterHere,
  deriveCompetitorContext,
  deriveSignalsToWatch,
  deriveStrategicGaps,
} from "@/lib/import-wizard/briefing-enrich-from-context";

export type DeterministicBriefBundle = {
  headline: string;
  identity: ReturnType<typeof composeIdentityBlock>;
  whyHere: string[];
  talkingPoints: { title: string; detail: string }[];
  questions: string[];
  competitorLines: string[];
  signals: string[];
  gaps: ReturnType<typeof deriveStrategicGaps>;
};

export function buildDeterministicBriefBundle(
  detail: BriefingDetailView,
  batchContext: BatchBriefingContextV1
): DeterministicBriefBundle {
  const ctx = batchContext ?? {};
  return {
    headline: detail.headline,
    identity: composeIdentityBlock(detail, ctx),
    whyHere: composeWhyTheyMatterHere(detail, ctx),
    talkingPoints: composeStrategicTalkingPoints(detail, ctx),
    questions: composeStrategicQuestions(detail, ctx),
    competitorLines: deriveCompetitorContext(detail, ctx),
    signals: deriveSignalsToWatch(detail, ctx),
    gaps: deriveStrategicGaps(detail, ctx),
  };
}
