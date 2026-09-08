export type RawEnrichmentLead = {
  email?: string | null;
  linkedinUrl?: string | null;
  fullName?: string | null;
  company?: string | null;
  location?: string | null;
  /** Company web domain (e.g. apollo.io), no protocol */
  companyDomain?: string | null;
};

export type NormalizedEnrichmentInput = {
  email?: string;
  linkedinUrl?: string;
  fullName?: string;
  company?: string;
  location?: string;
  companyDomain?: string;
};

const LINKEDIN_PROFILE_REGEX = /^https?:\/\/(www\.)?linkedin\.com\/(in|pub)\//i;

function sanitizeText(value: string | null | undefined) {
  if (!value) return undefined;
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

function sanitizeEmail(value: string | null | undefined) {
  const next = sanitizeText(value);
  if (!next) return undefined;
  return next.toLowerCase();
}

function sanitizeLinkedinUrl(value: string | null | undefined) {
  const next = sanitizeText(value);
  if (!next) return undefined;

  if (!LINKEDIN_PROFILE_REGEX.test(next)) {
    return undefined;
  }

  const lower = next.toLowerCase();
  if (lower.includes("/search/")) {
    return undefined;
  }

  if (next.includes("?")) {
    return undefined;
  }

  return next;
}

function hasFallbackNameCompany(input: NormalizedEnrichmentInput) {
  return Boolean(input.fullName && input.company);
}

function sanitizeDomain(value: string | null | undefined) {
  const next = sanitizeText(value);
  if (!next) return undefined;
  return next.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.trim() || undefined;
}

export function normalizeEnrichmentInput(lead: RawEnrichmentLead): NormalizedEnrichmentInput {
  const normalized: NormalizedEnrichmentInput = {
    email: sanitizeEmail(lead.email),
    linkedinUrl: sanitizeLinkedinUrl(lead.linkedinUrl),
    fullName: sanitizeText(lead.fullName),
    company: sanitizeText(lead.company),
    location: sanitizeText(lead.location),
    companyDomain: sanitizeDomain(lead.companyDomain)
  };

  const hasUsableInput = Boolean(
    normalized.email ||
      normalized.linkedinUrl ||
      hasFallbackNameCompany(normalized) ||
      (normalized.fullName && normalized.companyDomain)
  );
  if (!hasUsableInput) {
    throw new Error("No valid enrichment identifiers available");
  }

  return normalized;
}
