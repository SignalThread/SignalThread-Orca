import { parseBriefingContent, type BriefingStoredContent } from "@/lib/import-wizard/briefing-content-json";
import type { Json } from "@/types/database";

/** Shared with exhibitor lead detail page for briefing sections and compatible list fields. */
export function exhibitorLeadAiBriefToStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0);
      }
    } catch {
      return [trimmed];
    }
  }

  return [];
}

export function exhibitorLeadAiBriefToTalkingPoints(value: unknown): Array<{ title: string; detail: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const title = String((entry as { title?: unknown }).title ?? "").trim();
      const detail = String((entry as { detail?: unknown }).detail ?? "").trim();
      if (!title || !detail) return null;
      return { title, detail };
    })
    .filter((entry): entry is { title: string; detail: string } => entry !== null);
}

export function exhibitorLeadAiBriefToGaps(value: unknown): Array<{
  gap: string;
  whyItMatters: string;
  probe: string;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const gap = String((entry as { gap?: unknown }).gap ?? "").trim();
      const whyItMatters = String((entry as { whyItMatters?: unknown }).whyItMatters ?? "").trim();
      const probe = String((entry as { probe?: unknown }).probe ?? "").trim();
      if (!gap || !whyItMatters || !probe) return null;
      return { gap, whyItMatters, probe };
    })
    .filter((entry): entry is { gap: string; whyItMatters: string; probe: string } => entry !== null);
}

/**
 * Same rule as `app/(app)/exhibitor/leads/[leadId]/page.tsx` AI Brief tab:
 * show populated sections only when at least one canonical block has renderable payload.
 */
export function exhibitorLeadBriefStoredContentHasRenderableAiBriefSections(stored: BriefingStoredContent): boolean {
  const briefingWhyHere = exhibitorLeadAiBriefToStringList(stored.whyHere);
  const briefingTalkingPoints = exhibitorLeadAiBriefToTalkingPoints(stored.talkingPoints);
  const briefingQuestions = exhibitorLeadAiBriefToStringList(stored.questionsToAsk);
  const briefingSignalsToWatch = exhibitorLeadAiBriefToStringList(stored.signalsToWatch);
  const briefingCompetitorContext = String(stored.competitorContext ?? "").trim();
  const briefingGaps = exhibitorLeadAiBriefToGaps(stored.gaps);
  return (
    briefingWhyHere.length > 0 ||
    briefingTalkingPoints.length > 0 ||
    briefingQuestions.length > 0 ||
    briefingSignalsToWatch.length > 0 ||
    briefingCompetitorContext.length > 0 ||
    briefingGaps.length > 0
  );
}

/** `lead_briefings.content` jsonb from the database — invalid/empty objects do not count as available. */
export function exhibitorLeadBriefingJsonHasRenderableAiBrief(content: Json | null | undefined): boolean {
  return exhibitorLeadBriefStoredContentHasRenderableAiBriefSections(parseBriefingContent(content));
}
