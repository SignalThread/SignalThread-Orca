import type { Json } from "@/types/database";

/** Columns on public.leads populated from wizard batch enrichment (canonical). */
export const WIZARD_ENRICHMENT_LEAD_COLUMNS = [
  "job_title",
  "seniority",
  "company_size",
  "industry",
  "linkedin_url",
  "company_domain",
  "match_score",
] as const;

export type WizardEnrichmentLeadColumn = (typeof WIZARD_ENRICHMENT_LEAD_COLUMNS)[number];

const LEGACY_ENRICHED_TO_CANONICAL: Record<string, WizardEnrichmentLeadColumn | "match_score"> = {
  enriched_job_title: "job_title",
  enriched_seniority: "seniority",
  enriched_company_size: "company_size",
  enriched_industry: "industry",
  enriched_linkedin_url: "linkedin_url",
  enriched_company_domain: "company_domain",
  enriched_score: "match_score",
};

/**
 * Parses JSON stored on import_batch_rows.wizard_enrichment_normalized into a patch for public.leads.
 * Accepts canonical keys and legacy enriched_* keys (backward compatible).
 */
export function parseWizardEnrichmentNormalizedJson(
  raw: Json | null | undefined
): Partial<Record<WizardEnrichmentLeadColumn, string | number>> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Partial<Record<WizardEnrichmentLeadColumn, string | number>> = {};

  for (const key of WIZARD_ENRICHMENT_LEAD_COLUMNS) {
    if (key === "match_score") {
      const v = o[key] ?? o.enriched_score;
      if (typeof v === "number" && Number.isFinite(v)) {
        out.match_score = v;
      } else if (typeof v === "string" && v.trim()) {
        const n = Number(v);
        if (Number.isFinite(n)) out.match_score = n;
      }
      continue;
    }
    let v = o[key];
    if (v == null) {
      const legacyKey = Object.entries(LEGACY_ENRICHED_TO_CANONICAL).find(([, c]) => c === key)?.[0];
      if (legacyKey) v = o[legacyKey];
    }
    if (typeof v === "string" && v.trim() !== "") {
      out[key] = v.trim();
    }
  }

  if (out.company_domain == null || out.company_domain === "") {
    delete out.company_domain;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** Merges wizard enrichment patch onto a leads insert/update payload (provider fields win when present). */
export function mergeWizardEnrichmentIntoLeadInsert(
  base: Record<string, unknown>,
  wizardRaw: Json | null | undefined
): Record<string, unknown> {
  const patch = parseWizardEnrichmentNormalizedJson(wizardRaw);
  if (!patch) return base;
  const { match_score: _score, ...leadColumns } = patch;
  return { ...base, ...leadColumns };
}
