/**
 * Pure matching helpers for linking a staged import row to at most one catalog lead
 * when building draft batch Review Brief. No fuzzy name or company-only joins.
 */

import { isLeadImportEmailFormatValid, normalizeEmailForDuplicateKey } from "@/lib/import-wizard/import-batch-validation-derive";

export type BriefingLeadEnrichmentRow = {
  id: string;
  email: string | null;
  enriched_job_title: string | null;
  enriched_company_size: string | null;
  enriched_industry: string | null;
  enriched_linkedin_url: string | null;
  enriched_company_domain: string | null;
  enriched_seniority: string | null;
};

/**
 * When multiple catalog rows share the same normalized email within a company, the match is ambiguous — return null.
 */
export function selectLeadRowByNormalizedEmail(
  rows: BriefingLeadEnrichmentRow[],
  csvEmail: string
): BriefingLeadEnrichmentRow | null {
  if (!isLeadImportEmailFormatValid(csvEmail)) return null;
  const n = normalizeEmailForDuplicateKey(csvEmail);
  const matches = rows.filter(
    (r) => r.email != null && r.email.trim() !== "" && normalizeEmailForDuplicateKey(r.email) === n
  );
  if (matches.length !== 1) return null;
  return matches[0]!;
}
