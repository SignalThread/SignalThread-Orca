import type { BriefingApprovalStatus, BriefingDetailView, BriefingEnrichmentOverlay } from "@/lib/import-wizard/briefing-detail-model";
import type { BriefingStoredContent } from "@/lib/import-wizard/briefing-content-json";
import { canonicalValueForRow } from "@/lib/import-wizard/import-batch-validation-derive";
import type { BriefingLeadEnrichmentRow } from "@/lib/import-wizard/briefing-batch-lead-match";

/** When exactly one `public.leads` row matches the batch row email (company-scoped); see `match_leads_by_company_normalized_email`. */
export type BatchBriefingMatchedLead = Pick<
  BriefingLeadEnrichmentRow,
  | "enriched_job_title"
  | "enriched_company_size"
  | "enriched_industry"
  | "enriched_linkedin_url"
  | "enriched_company_domain"
  | "enriched_seniority"
> & { leadId: string };

function nonEmpty(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length > 0 ? t : null;
}

function dash(s: string | null | undefined): string {
  const v = nonEmpty(s);
  return v ?? "—";
}

function padRow(cells: string[], colCount: number): string[] {
  const padded = [...cells];
  while (padded.length < colCount) padded.push("");
  return padded.slice(0, colCount);
}

function enrichmentOverlayFromMatched(m: BatchBriefingMatchedLead): BriefingEnrichmentOverlay {
  return {
    companySize: nonEmpty(m.enriched_company_size),
    industry: nonEmpty(m.enriched_industry),
    seniority: nonEmpty(m.enriched_seniority),
    domain: nonEmpty(m.enriched_company_domain),
    linkedinUrl: nonEmpty(m.enriched_linkedin_url),
    jobTitleEnriched: nonEmpty(m.enriched_job_title),
  };
}

/**
 * Briefing detail for a staged import row. Optional `matchedLead` hydrates enrichment from `public.leads`
 * when the server found exactly one company-scoped email match (normalized trim + lower).
 */
export function buildBriefingDetailFromBatchRow(
  briefingRecordId: string,
  batchRowId: string,
  rowIndex: number,
  cells: string[],
  csvHeaders: string[],
  selections: Record<string, string>,
  stored: BriefingStoredContent,
  approvalStatus: BriefingApprovalStatus,
  matchedLead: BatchBriefingMatchedLead | null = null
): BriefingDetailView {
  const colCount = csvHeaders.length;
  const row = padRow(cells, colCount);

  const fullName = nonEmpty(canonicalValueForRow(row, selections, "full_name"));
  const email = nonEmpty(canonicalValueForRow(row, selections, "email"));
  const csvTitle = nonEmpty(canonicalValueForRow(row, selections, "job_title"));
  const enrichedTitle = matchedLead ? nonEmpty(matchedLead.enriched_job_title) : null;
  const titleLine = enrichedTitle ?? csvTitle;
  const companyName =
    nonEmpty(stored.companySnapshot?.name) ??
    nonEmpty(canonicalValueForRow(row, selections, "company_text")) ??
    "Company";

  const displayName = fullName ?? email ?? `Row ${rowIndex + 1}`;

  const headline =
    nonEmpty(stored.headline) ??
    `Briefing for ${displayName}${titleLine ? ` — ${titleLine}` : ""} at ${companyName}.`;

  const companySnapshot = {
    name: dash(stored.companySnapshot?.name ?? canonicalValueForRow(row, selections, "company_text")),
    tagline: dash(stored.companySnapshot?.tagline),
    quote: dash(stored.companySnapshot?.quote),
    headcount: dash(stored.companySnapshot?.headcount ?? matchedLead?.enriched_company_size),
    techSophistication: dash(stored.companySnapshot?.techSophistication ?? matchedLead?.enriched_seniority),
    hq: dash(stored.companySnapshot?.hq),
  };

  const whyHere = Array.isArray(stored.whyHere) && stored.whyHere.length > 0 ? stored.whyHere : [];
  const talkingPoints =
    Array.isArray(stored.talkingPoints) && stored.talkingPoints.length > 0 ? stored.talkingPoints : [];
  const questionsToAsk =
    Array.isArray(stored.questionsToAsk) && stored.questionsToAsk.length > 0 ? stored.questionsToAsk : [];
  const competitorContext = nonEmpty(stored.competitorContext) ?? "";
  const signalsToWatch =
    Array.isArray(stored.signalsToWatch) && stored.signalsToWatch.length > 0 ? stored.signalsToWatch : [];

  const linkedinCsv = nonEmpty(canonicalValueForRow(row, selections, "linkedin_url"));
  const linkedinEnriched = matchedLead ? nonEmpty(matchedLead.enriched_linkedin_url) : null;
  const linkedin = linkedinCsv ?? linkedinEnriched;

  return {
    batchRowId,
    leadId: matchedLead?.leadId ?? null,
    briefingRecordId,
    approvalStatus,
    headline,
    companySnapshot,
    whyHere,
    talkingPoints,
    questionsToAsk,
    competitorContext,
    signalsToWatch,
    manualContext: stored.manualContext ?? null,
    polished: stored.polished ?? null,
    hasManualBriefEdits: Boolean(stored.briefingEdits?.manuallyEditedAt),
    identityExtras: {
      email: email ?? null,
      linkedinUrl: linkedin ?? null,
    },
    enrichment: matchedLead ? enrichmentOverlayFromMatched(matchedLead) : null,
  };
}
