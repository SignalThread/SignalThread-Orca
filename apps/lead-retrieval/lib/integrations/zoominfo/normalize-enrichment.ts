import type { NormalizedEnrichmentFields } from "@/lib/enrichment/providers/pdl";
import { normalizeCompanyDomain } from "@/lib/urls";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function inferSeniority(title: string | null, managementLevel: string | null) {
  const ml = (managementLevel ?? "").toLowerCase();
  if (ml.includes("c-level") || ml.includes("board") || ml.includes("vp") || ml.includes("director")) {
    return "Executive";
  }
  const value = (title ?? "").toLowerCase();
  if (!value) return "Unknown";
  if (value.includes("chief") || value.includes("vp") || value.includes("head") || value.includes("director")) {
    return "Executive";
  }
  if (value.includes("manager") || value.includes("lead")) return "Manager";
  if (value.includes("senior") || value.includes("principal")) return "Senior IC";
  return "Individual Contributor";
}

function pickLinkedinUrl(attrs: Record<string, unknown>): string | null {
  const urls = attrs.externalUrls;
  if (!Array.isArray(urls)) return null;
  for (const item of urls) {
    const r = asRecord(item);
    if (!r) continue;
    if (String(r.type ?? "").toUpperCase().includes("LINKED")) {
      const u = asString(r.url);
      if (u) return u;
    }
  }
  return null;
}

function firstIndustry(company: Record<string, unknown> | null): string | null {
  if (!company) return null;
  const primary = company.companyPrimaryIndustry ?? company.primaryIndustry;
  if (Array.isArray(primary) && primary.length > 0) {
    return asString(primary[0]);
  }
  const industries = company.industries;
  if (Array.isArray(industries) && industries.length > 0) {
    const first = industries[0];
    if (typeof first === "string") return first;
    const rec = asRecord(first);
    if (rec) return asString(rec.name) ?? asString(rec.id);
  }
  return asString(primary);
}

/**
 * Match statuses that should not produce a confident enrichment result.
 */
export function zoomInfoMatchStatusIsNoMatch(matchStatus: string | undefined | null): boolean {
  if (!matchStatus) return true;
  const block = new Set([
    "NO_MATCH",
    "OPT_OUT",
    "INVALID_INPUT",
    "LIMIT_EXCEEDED",
    "NON_MATCH_BY_LAST_UPDATED_DATE",
    "NON_MATCH_BY_VALID_DATE",
    "NON_MATCH_BY_REQUIRED_FIELDS",
    "NON_MATCH_BY_CONTACT_ACCURACY_MIN",
  ]);
  return block.has(matchStatus);
}

export function mapZoomInfoContactEnrichItemToNormalized(item: Record<string, unknown>): NormalizedEnrichmentFields {
  const attrs = asRecord(item.attributes) ?? {};
  const meta = asRecord(item.meta) ?? {};
  const company = asRecord(attrs.company);

  const jobTitle = asString(attrs.jobTitle);
  const managementLevel = asString(attrs.managementLevel);
  const seniority = jobTitle ? inferSeniority(jobTitle, managementLevel) : null;

  const employeeRange =
    asString(attrs.companyEmployeeRange) ??
    asString(company?.employeeRange) ??
    asString(company?.companyEmployeeRange);

  const industry = firstIndustry(company) ?? asString(attrs.companyPrimaryIndustry);

  const linkedinUrl = pickLinkedinUrl(attrs) ?? null;

  const websiteRaw = asString(attrs.companyWebsite) ?? asString(company?.website);
  const companyDomain = normalizeCompanyDomain(websiteRaw);

  const accuracyRaw = attrs.contactAccuracyScore ?? meta.contactAccuracyScore;
  let score: number | null = null;
  if (typeof accuracyRaw === "number" && Number.isFinite(accuracyRaw)) {
    score = Math.min(100, Math.max(0, Math.round(accuracyRaw)));
  } else if (typeof accuracyRaw === "string" && accuracyRaw.trim()) {
    const n = Number(accuracyRaw);
    if (Number.isFinite(n)) score = Math.min(100, Math.max(0, Math.round(n)));
  }
  if (score === null) {
    score = jobTitle || industry || companyDomain ? 72 : 50;
  }

  return {
    job_title: jobTitle,
    seniority,
    company_size: employeeRange,
    industry,
    linkedin_url: linkedinUrl,
    company_domain: companyDomain,
    match_score: score,
  };
}

export function hasMeaningfulZoomInfoNormalized(n: NormalizedEnrichmentFields): boolean {
  const keys = [
    "job_title",
    "company_size",
    "industry",
    "linkedin_url",
    "company_domain",
  ] as const;
  for (const k of keys) {
    const v = n[k];
    if (v != null && String(v).trim() !== "") return true;
  }
  const s = n.seniority;
  if (s != null && String(s).trim() !== "" && s !== "Unknown") return true;
  return false;
}
