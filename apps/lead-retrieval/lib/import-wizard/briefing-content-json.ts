import type { Json } from "@/types/database";
import type { BriefingPolishedBundle } from "@/lib/import-wizard/briefing-polished-types";

/**
 * Versioned metadata for draft import batch briefings (`import_batch_row_briefings.content`).
 * `sourceFingerprint` is SHA-256 hex of (csvHeaders + cells + sorted selections).
 */
export type BriefingContentMeta = {
  sourceFingerprint: string;
  blocksVersion: 1;
};

export type BriefingContentLinkage = {
  /** Durable published lead linkage written during materialization. */
  published_lead_id?: string;
};

/**
 * Optional structured fields stored in `import_batch_row_briefings.content` or `lead_briefings.content` (jsonb).
 *
 * Step 4 real blocks (batch draft): `companySnapshot`, `whyHere`, `talkingPoints` + `meta`.
 * Other keys remain optional / placeholders until later steps.
 */
/** Persisted per-row booth notes under `import_batch_row_briefings.content.manualContext` (v1). */
export type ImportBriefingManualContextV1 = {
  whyMatters?: string;
  whatWeKnow?: string;
  suspectedPain?: string;
  conversationStarter?: string;
  competitorMentioned?: string;
  /** Default `auto` means no explicit override saved. */
  priorityOverride?: "auto" | "high" | "normal" | "low";
  internalNotes?: string;
};

export function hasManualContextInStored(stored: BriefingStoredContent): boolean {
  const m = stored.manualContext;
  if (!m || typeof m !== "object") return false;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (str(m.whyMatters)) return true;
  if (str(m.whatWeKnow)) return true;
  if (str(m.suspectedPain)) return true;
  if (str(m.conversationStarter)) return true;
  if (str(m.competitorMentioned)) return true;
  if (str(m.internalNotes)) return true;
  if (m.priorityOverride != null && m.priorityOverride !== "auto") return true;
  return false;
}

export type BriefingStoredContent = {
  headline?: string;
  meta?: BriefingContentMeta;
  linkage?: BriefingContentLinkage;
  /** AI-polished or user-edited review draft. Deterministic fields above remain the raw grounded source. */
  polished?: BriefingPolishedBundle;
  briefingEdits?: {
    aiPolishedAt?: string;
    manuallyEditedAt?: string;
  };
  /** Booth staff notes — merged on save; never overwritten by deterministic block refresh. */
  manualContext?: ImportBriefingManualContextV1;
  companySnapshot?: Partial<{
    name: string;
    tagline: string;
    quote: string;
    headcount: string;
    techSophistication: string;
    hq: string;
  }>;
  whyHere?: string[];
  talkingPoints?: { title: string; detail: string }[];
  questionsToAsk?: string[];
  competitorContext?: string;
  signalsToWatch?: string[];
  gaps?: Array<{
    gap: string;
    whyItMatters: string;
    probe: string;
  }>;
};

export function parseBriefingContent(raw: Json | null | undefined): BriefingStoredContent {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as BriefingStoredContent;
}
