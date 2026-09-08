import type { BriefingApprovalStatus, BriefingDetailView } from "@/lib/import-wizard/briefing-detail-model";
import type { BriefingStoredContent } from "@/lib/import-wizard/briefing-content-json";

/** Lead columns needed to render briefing view (subset of `leads`). */
export type LeadFields = {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  company_text: string | null;
  enriched_job_title: string | null;
  enriched_company_size: string | null;
  enriched_industry: string | null;
  enriched_linkedin_url: string | null;
  enriched_company_domain: string | null;
  enriched_seniority: string | null;
};

function nonEmpty(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length > 0 ? t : null;
}

function dash(s: string | null | undefined): string {
  const v = nonEmpty(s);
  return v ?? "—";
}

/**
 * Merge stored JSON (if any) with lead + enrichment columns. No fabricated marketing copy —
 * missing narrative fields use honest empty/default strings.
 */
export function buildBriefingDetailView(
  briefingRecordId: string,
  lead: LeadFields,
  stored: BriefingStoredContent,
  approvalStatus: BriefingApprovalStatus = "pending"
): BriefingDetailView {
  const companyName = nonEmpty(stored.companySnapshot?.name) ?? nonEmpty(lead.company_text) ?? "Company";
  const titleLine = nonEmpty(lead.enriched_job_title) ?? nonEmpty(lead.job_title);
  const headline =
    nonEmpty(stored.headline) ??
    `Briefing for ${lead.full_name}${titleLine ? ` — ${titleLine}` : ""} at ${companyName}.`;

  const companySnapshot = {
    name: dash(stored.companySnapshot?.name ?? lead.company_text),
    tagline: dash(stored.companySnapshot?.tagline),
    quote: dash(stored.companySnapshot?.quote),
    headcount: dash(stored.companySnapshot?.headcount ?? lead.enriched_company_size),
    techSophistication: dash(stored.companySnapshot?.techSophistication ?? lead.enriched_seniority),
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

  return {
    batchRowId: null,
    leadId: lead.id,
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
      email: lead.email ?? null,
      linkedinUrl: nonEmpty(lead.enriched_linkedin_url),
    },
    enrichment: {
      companySize: nonEmpty(lead.enriched_company_size),
      industry: nonEmpty(lead.enriched_industry),
      seniority: nonEmpty(lead.enriched_seniority),
      domain: nonEmpty(lead.enriched_company_domain),
      linkedinUrl: nonEmpty(lead.enriched_linkedin_url),
      jobTitleEnriched: nonEmpty(lead.enriched_job_title),
    },
  };
}
