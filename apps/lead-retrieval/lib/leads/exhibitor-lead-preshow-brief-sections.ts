import type { BriefingStoredContent } from "@/lib/import-wizard/briefing-content-json";
import {
  exhibitorLeadAiBriefToGaps,
  exhibitorLeadAiBriefToStringList,
  exhibitorLeadAiBriefToTalkingPoints
} from "@/lib/leads/exhibitorLeadAiBriefRenderable";

export type BriefSectionListItem = { label?: string; body: string };

export type BriefSectionCardItem = { title: string; body: string };

export type BriefSectionQuestionItem =
  | { variant: "prompt"; text: string }
  | { variant: "open"; title: string; quote: string };

export type BriefSectionSignalItem = { text: string };

export type BriefSection =
  | { id: string; title: string; type: "list"; items: BriefSectionListItem[] }
  | { id: string; title: string; type: "cards"; items: BriefSectionCardItem[] }
  | { id: string; title: string; type: "questions"; items: BriefSectionQuestionItem[] }
  | { id: string; title: string; type: "signals"; items: BriefSectionSignalItem[] };

const KEY_CONTEXT_LABELS = [
  "Decision authority",
  "Pain captured",
  "Psychographic profile",
  "Buying context",
  "Stakeholder lens",
  "Momentum"
] as const;

function pushSection(sections: BriefSection[], section: BriefSection | null): void {
  if (section && section.items.length > 0) sections.push(section);
}

/**
 * Turns stored briefing JSON into ordered, non-empty sections only.
 * Add or reorder mappings here as the persisted shape evolves — the UI iterates this array only.
 */
export function buildPreShowBriefSections(stored: BriefingStoredContent): BriefSection[] {
  const sections: BriefSection[] = [];

  const headline = String(stored.headline ?? "").trim();
  if (headline) {
    pushSection(sections, {
      id: "headline",
      title: "Summary",
      type: "list",
      items: [{ body: headline }]
    });
  }

  const whyHere = exhibitorLeadAiBriefToStringList(stored.whyHere);
  if (whyHere.length > 0) {
    pushSection(sections, {
      id: "key-context",
      title: "Key context",
      type: "list",
      items: whyHere.map((body, i) => ({
        label: KEY_CONTEXT_LABELS[i] ?? `Context ${i + 1}`,
        body
      }))
    });
  }

  const questions = exhibitorLeadAiBriefToStringList(stored.questionsToAsk);
  if (questions.length > 0) {
    pushSection(sections, {
      id: "questions",
      title: "Questions to ask",
      type: "questions",
      items: questions.map((text) => ({ variant: "prompt" as const, text }))
    });
  }

  const talkingPoints = exhibitorLeadAiBriefToTalkingPoints(stored.talkingPoints);
  if (talkingPoints.length > 0) {
    pushSection(sections, {
      id: "positioning",
      title: "Strategic positioning",
      type: "cards",
      items: talkingPoints.map((tp) => ({ title: tp.title, body: tp.detail }))
    });
  }

  const signals = exhibitorLeadAiBriefToStringList(stored.signalsToWatch);
  if (signals.length > 0) {
    pushSection(sections, {
      id: "signals",
      title: "Signals to watch",
      type: "signals",
      items: signals.map((text) => ({ text }))
    });
  }

  const gaps = exhibitorLeadAiBriefToGaps(stored.gaps);
  if (gaps.length > 0) {
    pushSection(sections, {
      id: "open-questions",
      title: "Open questions",
      type: "questions",
      items: gaps.map((g) => ({
        variant: "open" as const,
        title: g.gap,
        quote: g.probe.trim() || g.whyItMatters.trim() || ""
      }))
    });
  }

  const competitor = String(stored.competitorContext ?? "").trim();
  if (competitor) {
    pushSection(sections, {
      id: "competitor",
      title: "Competitive context",
      type: "list",
      items: [{ body: competitor }]
    });
  }

  return sections;
}
