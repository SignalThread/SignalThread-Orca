import { type NormalizedEnrichmentInput } from "@/lib/enrichment/providers/normalize-input";
import {
  type NormalizedEnrichmentFields,
  type ProviderEnrichmentResult,
} from "@/lib/enrichment/providers/pdl";
import {
  apolloJsonRequestHeaders,
  fingerprintApolloKey,
  normalizeApolloApiKey,
  shouldLogApolloEnrichmentAuth,
} from "@/lib/integrations/apollo/api-key";
import { normalizeCompanyDomain } from "@/lib/urls";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function inferSeniority(title: string | null) {
  const value = (title ?? "").toLowerCase();
  if (!value) return "Unknown";
  if (
    value.includes("chief") ||
    value.includes("cxo") ||
    value.includes("vp") ||
    value.includes("head") ||
    value.includes("director")
  ) {
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

function splitName(fullName: string): { first: string; last: string } | null {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

/**
 * Match inputs in priority order: email → LinkedIn → name+company → name+domain.
 */
function buildMatchParams(input: NormalizedEnrichmentInput): URLSearchParams {
  const params = new URLSearchParams();

  if (input.email) {
    params.set("email", input.email);
    return params;
  }

  if (input.linkedinUrl) {
    params.set("linkedin_url", input.linkedinUrl);
    return params;
  }

  const org = input.company?.trim();
  const domain = input.companyDomain?.trim();

  if (input.fullName && org) {
    const split = splitName(input.fullName);
    if (split) {
      params.set("first_name", split.first);
      params.set("last_name", split.last);
    } else {
      params.set("name", input.fullName.trim());
    }
    params.set("organization_name", org);
    return params;
  }

  if (input.fullName && domain) {
    const split = splitName(input.fullName);
    if (split) {
      params.set("first_name", split.first);
      params.set("last_name", split.last);
    } else {
      params.set("name", input.fullName.trim());
    }
    params.set("domain", domain);
    return params;
  }

  throw new Error("No valid enrichment identifiers available");
}

function hasMeaningfulNormalized(n: NormalizedEnrichmentFields): boolean {
  const keys = [
    "job_title",
    "company_size",
    "industry",
    "linkedin_url",
    "company_domain",
  ] as const;
  for (const k of keys) {
    const v = n[k];
    if (v != null && String(v).trim() !== "") {
      return true;
    }
  }
  const s = n.seniority;
  if (s != null && String(s).trim() !== "" && s !== "Unknown") {
    return true;
  }
  return false;
}

function mapApolloToNormalized(person: Record<string, unknown>): NormalizedEnrichmentFields {
  const org = asRecord(person.organization);
  const jobTitle = asString(person.title) ?? null;
  const seniority = jobTitle ? inferSeniority(jobTitle) : null;
  const industry = asString(org?.industry) ?? null;
  const linkedinUrl = asString(person.linkedin_url) ?? null;
  const domain =
    normalizeCompanyDomain(asString(org?.primary_domain)) ??
    normalizeCompanyDomain(asString(person.organization_domain));
  const empCount = asNumber(org?.estimated_num_employees);
  const companySize = employeeRangeFromCount(empCount);

  let score = 55;
  if (asString(person.id)) score += 25;
  if (jobTitle) score += 10;
  if (domain) score += 10;
  score = Math.min(100, score);

  return {
    job_title: jobTitle,
    seniority,
    company_size: companySize,
    industry,
    linkedin_url: linkedinUrl,
    company_domain: domain,
    match_score: score,
  };
}

export async function enrichWithApollo(
  input: NormalizedEnrichmentInput,
  options?: { apiKey?: string | null }
): Promise<ProviderEnrichmentResult> {
  const fromIntegration = asString(options?.apiKey);
  const fromEnv = asString(process.env["APOLLO_API_KEY"]);
  const keySource: "integrations" | "env" = fromIntegration ? "integrations" : "env";
  const rawKey = fromIntegration ?? fromEnv;
  const apiKey = rawKey ? normalizeApolloApiKey(rawKey) : null;

  if (!apiKey) {
    throw new Error(
      "Apollo API key is missing. Add APOLLO_API_KEY to the server environment or connect Apollo in Integrations."
    );
  }

  if (shouldLogApolloEnrichmentAuth()) {
    const fp = fingerprintApolloKey(apiKey);
    console.log(
      "[apollo enrichment]",
      `keySource=${keySource}`,
      "keyPresent=true",
      `length=${fp.length}`,
      `fingerprint=${fp.preview}`,
      "auth=x-api-key"
    );
  }

  const params = buildMatchParams(input);
  const url = `${APOLLO_BASE}/people/match?${params.toString()}`;

  const response = await fetch(url, {
    method: "POST",
    headers: apolloJsonRequestHeaders(apiKey),
    body: "{}",
    cache: "no-store",
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = { parse_error: true };
  }

  const rawResponse = {
    status: response.status,
    request: { params: Object.fromEntries(params) },
    payload,
  } as Record<string, unknown>;

  const emptyNormalized: NormalizedEnrichmentFields = {
    job_title: null,
    seniority: null,
    company_size: null,
    industry: null,
    linkedin_url: null,
    company_domain: null,
    match_score: null,
  };

  if (!response.ok) {
    return {
      provider: "apollo",
      rawResponse,
      normalized: emptyNormalized,
      shouldUpdateNormalized: false,
      noMatch: false,
      errorMessage: `Apollo enrichment request failed with status ${response.status}`,
    };
  }

  const person = asRecord(payload.person);
  if (!person) {
    return {
      provider: "apollo",
      rawResponse,
      normalized: emptyNormalized,
      shouldUpdateNormalized: false,
      noMatch: true,
    };
  }

  const normalized = mapApolloToNormalized(person);
  if (!hasMeaningfulNormalized(normalized)) {
    return {
      provider: "apollo",
      rawResponse,
      normalized: emptyNormalized,
      shouldUpdateNormalized: false,
      noMatch: true,
    };
  }

  return {
    provider: "apollo",
    rawResponse,
    normalized,
    shouldUpdateNormalized: true,
    noMatch: false,
  };
}
