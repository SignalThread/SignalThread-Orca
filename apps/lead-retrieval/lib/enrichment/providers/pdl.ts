import { type NormalizedEnrichmentInput } from "@/lib/enrichment/providers/normalize-input";
import type { CanonicalLeadEnrichmentFields } from "@/lib/leads/canonical-lead-fields";
import { normalizeCompanyDomain } from "@/lib/urls";

export type NormalizedEnrichmentFields = CanonicalLeadEnrichmentFields;

export type ProviderEnrichmentResult = {
  provider: "pdl" | "apollo" | "zoominfo";
  rawResponse: Record<string, unknown>;
  normalized: NormalizedEnrichmentFields;
  shouldUpdateNormalized: boolean;
  noMatch: boolean;
  errorMessage?: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inferSeniority(title: string | null) {
  const value = (title ?? "").toLowerCase();
  if (!value) return "Unknown";
  if (value.includes("chief") || value.includes("cxo") || value.includes("vp") || value.includes("head") || value.includes("director")) {
    return "Executive";
  }
  if (value.includes("manager") || value.includes("lead")) {
    return "Manager";
  }
  if (value.includes("senior") || value.includes("staff") || value.includes("principal")) {
    return "Senior IC";
  }
  return "Individual Contributor";
}

function normalizeLinkedin(url: string | null) {
  if (!url) return null;
  return url.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function employeeRangeFromCount(value: number | null) {
  if (value === null) return null;
  if (value < 10) return "1-9";
  if (value < 50) return "10-49";
  if (value < 200) return "50-199";
  if (value < 500) return "200-499";
  if (value < 1000) return "500-999";
  if (value < 5000) return "1000-4999";
  return "5000+";
}

function buildRequestParams(input: NormalizedEnrichmentInput) {
  const params = new URLSearchParams();

  if (input.email) {
    params.set("email", input.email);
    return params;
  }

  if (input.linkedinUrl) {
    params.set("profile", input.linkedinUrl);
    return params;
  }

  if (!input.fullName || !input.company) {
    throw new Error("No valid enrichment identifiers available");
  }

  params.set("name", input.fullName);
  params.set("company", input.company);
  if (input.location) params.set("location", input.location);
  return params;
}

function pickPerson(payload: Record<string, unknown>) {
  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return payload;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function collectDomainCandidates(record: Record<string, unknown> | null): string[] {
  if (!record) return [];

  const candidates = [
    asString(record.domain),
    asString(record.website),
    asString(record.company_domain),
    asString(record.company_website),
    asString(record.job_company_domain),
    asString(record.job_company_website)
  ];

  return candidates.filter((item): item is string => Boolean(item));
}

function extractCompanyDomain(person: Record<string, unknown>) {
  const candidates: string[] = [];

  candidates.push(...collectDomainCandidates(person));
  candidates.push(...collectDomainCandidates(asRecord(person.company)));
  candidates.push(...collectDomainCandidates(asRecord(person.job_company)));

  const experience = person.experience;
  if (Array.isArray(experience)) {
    for (const item of experience) {
      const expRecord = asRecord(item);
      candidates.push(...collectDomainCandidates(expRecord));
      candidates.push(...collectDomainCandidates(asRecord(expRecord?.company)));
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizeCompanyDomain(candidate);
    if (normalized) return normalized;
  }

  return null;
}

function firstExperienceTitle(person: Record<string, unknown>) {
  const experiences = person.experience;
  if (!Array.isArray(experiences) || experiences.length === 0) return null;
  const latest = experiences[0];
  if (!latest || typeof latest !== "object") return null;
  return asString((latest as Record<string, unknown>).title);
}

function extractEmails(person: Record<string, unknown>) {
  const emails: string[] = [];

  const work = asString(person.work_email);
  if (work) emails.push(work.toLowerCase());

  const email = asString(person.email);
  if (email) emails.push(email.toLowerCase());

  const personal = person.personal_emails;
  if (Array.isArray(personal)) {
    for (const item of personal) {
      const value = asString(item);
      if (value) emails.push(value.toLowerCase());
    }
  }

  const generic = person.emails;
  if (Array.isArray(generic)) {
    for (const item of generic) {
      const value = asString(item);
      if (value) emails.push(value.toLowerCase());
    }
  }

  return emails;
}

function computeConfidenceScore(opts: {
  hasStrongId: boolean;
  emailMatched: boolean;
  linkedinMatched: boolean;
}) {
  let score = 50;
  if (opts.hasStrongId) score += 30;
  if (opts.emailMatched) score += 10;
  if (opts.linkedinMatched) score += 10;
  return Math.min(100, score);
}

export async function enrichWithPdl(
  input: NormalizedEnrichmentInput,
  options?: { apiKey?: string | null }
): Promise<ProviderEnrichmentResult> {
  const apiKey = asString(options?.apiKey) ?? asString(process.env.PDL_API_KEY);
  if (!apiKey) {
    throw new Error(
      "People Data Labs API key is missing. Add PDL_API_KEY to the server environment or connect People Data Labs in Integrations."
    );
  }

  const params = buildRequestParams(input);
  const url = `https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = { parse_error: true };
  }

  const rawResponse = {
    status: response.status,
    request: {
      params: Object.fromEntries(params)
    },
    payload
  } as Record<string, unknown>;

  if (response.status === 404 || payload.status === 404) {
    return {
      provider: "pdl",
      rawResponse,
      normalized: {
        job_title: null,
        seniority: null,
        company_size: null,
        industry: null,
        linkedin_url: null,
        company_domain: null,
        match_score: null
      },
      shouldUpdateNormalized: false,
      noMatch: true
    };
  }

  if (!response.ok) {
    return {
      provider: "pdl",
      rawResponse,
      normalized: {
        job_title: null,
        seniority: null,
        company_size: null,
        industry: null,
        linkedin_url: null,
        company_domain: null,
        match_score: null
      },
      shouldUpdateNormalized: false,
      noMatch: false,
      errorMessage: `PDL enrichment request failed with status ${response.status}`
    };
  }

  const person = pickPerson(payload);
  const personId = asString(person.id) ?? asString(person.person_id);
  const likelihood = asNumber(payload.likelihood) ?? asNumber(person.likelihood) ?? asNumber(person.confidence);

  const jobTitle = asString(person.job_title) ?? firstExperienceTitle(person) ?? null;
  const seniority = asString(person.seniority) ?? inferSeniority(jobTitle);

  const companySize =
    asString(person.company_size) ??
    asString(person.job_company_size) ??
    employeeRangeFromCount(asNumber(person.employee_count) ?? asNumber(person.job_company_employee_count));

  const industry = asString(person.industry) ?? asString(person.job_company_industry);
  const linkedinUrl = asString(person.linkedin_url) ?? asString(person.profile) ?? input.linkedinUrl ?? null;
  const companyDomain = extractCompanyDomain(person);

  const emailMatched = Boolean(
    input.email && extractEmails(person).some((email) => email === input.email!.toLowerCase())
  );

  const linkedinMatched = Boolean(
    input.linkedinUrl &&
      linkedinUrl &&
      normalizeLinkedin(linkedinUrl)?.includes(normalizeLinkedin(input.linkedinUrl) ?? "")
  );

  const hasStrongId = Boolean(personId || (likelihood !== null && likelihood > 0));

  const normalized: NormalizedEnrichmentFields = {
    job_title: jobTitle,
    seniority,
    company_size: companySize,
    industry,
    linkedin_url: linkedinUrl,
    company_domain: companyDomain,
    match_score: computeConfidenceScore({ hasStrongId, emailMatched, linkedinMatched })
  };

  return {
    provider: "pdl",
    rawResponse,
    normalized,
    shouldUpdateNormalized: true,
    noMatch: false
  };
}
