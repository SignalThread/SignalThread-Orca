/**
 * View model for batch-row briefing records — populated from DB + optional stored content JSON.
 */

import type { ImportBriefingManualContextV1 } from "@/lib/import-wizard/briefing-content-json";
import type { BriefingPolishedBundle } from "@/lib/import-wizard/briefing-polished-types";

export type BriefingApprovalStatus = "pending" | "approved" | "needs_review" | "failed";

export type BriefingCompanySnapshot = {
  name: string;
  tagline: string;
  quote: string;
  headcount: string;
  techSophistication: string;
  hq: string;
};

/** Contact fields from import row or lead record — safe to show in “Who they are”. */
export type BriefingIdentityExtras = {
  email: string | null;
  linkedinUrl: string | null;
};

/**
 * Enrichment from `public.leads` when `buildBriefingDetailView` is used (catalog lead path), or when
 * `buildBriefingDetailFromBatchRow` found exactly one company-scoped email match for the staged row.
 */
export type BriefingEnrichmentOverlay = {
  companySize: string | null;
  industry: string | null;
  seniority: string | null;
  domain: string | null;
  linkedinUrl: string | null;
  jobTitleEnriched: string | null;
};

export type BriefingDetailView = {
  /** Staged CSV row (`import_batch_rows.id`) when reviewing the draft batch. */
  batchRowId: string | null;
  /** Catalog lead id when reviewing a persisted lead (legacy / other flows). */
  leadId: string | null;
  briefingRecordId: string;
  /** From `import_batch_row_briefings.approval_status` for draft batch rows. */
  approvalStatus: BriefingApprovalStatus;
  headline: string;
  companySnapshot: BriefingCompanySnapshot;
  whyHere: string[];
  talkingPoints: { title: string; detail: string }[];
  questionsToAsk: string[];
  competitorContext: string;
  signalsToWatch: string[];
  /** From `content.manualContext` when present. */
  manualContext: ImportBriefingManualContextV1 | null;
  /** Persisted AI-polished or user-edited review draft. */
  polished: BriefingPolishedBundle | null;
  /** True when a reviewer has manually edited persisted brief wording. */
  hasManualBriefEdits: boolean;
  /** Email + LinkedIn from mapped source or lead columns. */
  identityExtras?: BriefingIdentityExtras;
  /** Populated only when briefing is built from a catalog lead with enrichment columns. */
  enrichment?: BriefingEnrichmentOverlay | null;
};

export type BriefingQueueItemView = {
  briefingRecordId: string;
  /** Stable queue key: `import_batch_rows.id`. */
  batchRowId: string;
  personName: string;
  title: string | null;
  company: string | null;
  approvalStatus: BriefingApprovalStatus;
  /** From `rowHasUsableIdentityPath` — same identity rules as Validation / publish-readiness. */
  identityComplete: boolean;
  /** True when any `manualContext` field is non-empty in stored JSON. */
  hasManualContext: boolean;
};
