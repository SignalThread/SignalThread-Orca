import type { Json } from "@/types/database";

/** Provider-normalized shape mapped onto `public.leads` canonical columns. */
export type CanonicalLeadEnrichmentFields = {
  job_title: string | null;
  seniority: string | null;
  company_size: string | null;
  industry: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  match_score: number | null;
};

export type LeadIntentSignal = { type: string; value: string };

export function emptyCanonicalEnrichmentFields(): CanonicalLeadEnrichmentFields {
  return {
    job_title: null,
    seniority: null,
    company_size: null,
    industry: null,
    linkedin_url: null,
    company_domain: null,
    match_score: null,
  };
}

function strLead(lead: Record<string, unknown>, key: string): string | null {
  const v = lead[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Read identity fields for enrichment input (canonical first, legacy fallback). */
export function readLeadLinkedinUrlForEnrichment(lead: Record<string, unknown>): string | null {
  return strLead(lead, "linkedin_url") ?? strLead(lead, "enriched_linkedin_url");
}

export function readLeadCompanyDomainForEnrichment(lead: Record<string, unknown>): string | null {
  return strLead(lead, "company_domain") ?? strLead(lead, "enriched_company_domain");
}

/**
 * Merge provider results into a leads UPDATE payload.
 * Manual data wins: only fills canonical columns that are empty on the lead.
 */
export function buildEnrichmentPatchForLead(
  lead: Record<string, unknown>,
  normalized: CanonicalLeadEnrichmentFields,
  providerKey: string,
  rawResponse: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const empty = (key: string) => strLead(lead, key) == null;

  if (normalized.job_title && empty("job_title")) {
    patch.job_title = normalized.job_title;
  }
  if (normalized.seniority && empty("seniority")) {
    patch.seniority = normalized.seniority;
  }
  if (normalized.company_size && empty("company_size")) {
    patch.company_size = normalized.company_size;
  }
  if (normalized.industry && empty("industry")) {
    patch.industry = normalized.industry;
  }
  if (normalized.linkedin_url && empty("linkedin_url")) {
    patch.linkedin_url = normalized.linkedin_url;
  }
  if (normalized.company_domain && empty("company_domain")) {
    patch.company_domain = normalized.company_domain;
  }

  const existingMeta =
    lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
      ? { ...(lead.metadata as Record<string, unknown>) }
      : {};
  existingMeta[providerKey] = {
    raw_response: rawResponse,
    last_match_at: new Date().toISOString(),
    ...(typeof normalized.match_score === "number" && Number.isFinite(normalized.match_score)
      ? { last_match_score: normalized.match_score }
      : {}),
  };
  patch.metadata = existingMeta as Json;

  return patch;
}

export function hasMeaningfulCanonicalEnrichmentPatch(patch: Record<string, unknown>): boolean {
  const keys = [
    "job_title",
    "seniority",
    "company_size",
    "industry",
    "linkedin_url",
    "company_domain",
  ] as const;
  for (const k of keys) {
    const v = patch[k];
    if (v != null && String(v).trim() !== "") {
      return true;
    }
  }
  return false;
}

export function parseIntentSignalsFromPatch(payload: unknown): LeadIntentSignal[] | null {
  if (payload == null) return [];
  if (!Array.isArray(payload)) return null;
  const out: LeadIntentSignal[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const type = String(o.type ?? "").trim().slice(0, 64);
    const value = String(o.value ?? "").trim().slice(0, 512);
    if (!type || !value) continue;
    out.push({ type, value });
  }
  return out;
}
