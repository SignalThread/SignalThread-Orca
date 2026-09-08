import type { NormalizedEnrichmentInput } from "@/lib/enrichment/providers/normalize-input";
import {
  type NormalizedEnrichmentFields,
  type ProviderEnrichmentResult,
} from "@/lib/enrichment/providers/pdl";
import {
  hasMeaningfulZoomInfoNormalized,
  mapZoomInfoContactEnrichItemToNormalized,
  zoomInfoMatchStatusIsNoMatch,
} from "@/lib/integrations/zoominfo/normalize-enrichment";
import {
  DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS,
  type ZoomInfoEnrichmentDomains,
} from "@/lib/integrations/zoominfo/enrichment-domain-settings";
import { enrichContacts, searchCompanies, searchContacts } from "@/lib/integrations/zoominfo/operations";

const OUTPUT_FIELDS = [
  "jobTitle",
  "managementLevel",
  "companyEmployeeRange",
  "companyPrimaryIndustry",
  "companyWebsite",
  "companyIndustries",
  "externalUrls",
  "contactAccuracyScore",
  "companyName",
  "companyEmployeeCount",
  "firstName",
  "lastName",
  "id",
] as const;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readDataArray(payload: unknown): Record<string, unknown>[] {
  const rec = asRecord(payload);
  const data = rec?.data;
  if (!Array.isArray(data)) return [];
  return data.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
}

function splitFullName(fullName: string | undefined): { first: string; last: string } | null {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function emptyNormalized(): NormalizedEnrichmentFields {
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

function pickBestContactPersonId(rows: Record<string, unknown>[]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const row of rows) {
    const idRaw = row.id;
    if (idRaw == null) continue;
    const id = String(idRaw).trim();
    if (!id) continue;
    const attrs = asRecord(row.attributes);
    const score =
      typeof attrs?.contactAccuracyScore === "number" && Number.isFinite(attrs.contactAccuracyScore)
        ? attrs.contactAccuracyScore
        : 0;
    if (!best || score > best.score) {
      best = { id, score };
    }
  }
  return best?.id ?? null;
}

async function resolveCompanyIdFromDomain(
  token: string,
  companyDomain: string | undefined | null
): Promise<number | null> {
  if (!companyDomain) return null;
  const domain = companyDomain.trim().toLowerCase();
  if (!domain) return null;

  const res = await searchCompanies(token, {
    website: domain.includes("http") ? domain : `https://${domain}`,
  });
  if (!res.ok) {
    return null;
  }
  const rows = readDataArray(res.data);
  if (rows.length === 0) return null;
  const first = rows[0];
  const idRaw = first?.id;
  if (idRaw == null) return null;
  const n = Number(idRaw);
  return Number.isFinite(n) ? n : null;
}

function buildContactSearchAttributes(input: NormalizedEnrichmentInput, companyId: number | null): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (input.email) attrs.emailAddress = input.email;
  if (input.linkedinUrl) attrs.webReferences = [input.linkedinUrl];
  if (input.company) attrs.companyName = input.company;
  if (companyId != null) attrs.companyId = companyId;

  const split = splitFullName(input.fullName);
  if (split) {
    attrs.firstName = split.first;
    attrs.lastName = split.last;
  } else if (input.fullName) {
    attrs.fullName = input.fullName;
  }

  return attrs;
}

function buildDirectMatchCriteria(
  input: NormalizedEnrichmentInput,
  companyId: number | null
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (input.email) attrs.emailAddress = input.email;
  if (input.linkedinUrl) attrs.externalURL = input.linkedinUrl;
  if (input.company) attrs.companyName = input.company;
  if (companyId != null) attrs.companyId = companyId;

  const split = splitFullName(input.fullName);
  if (split) {
    attrs.firstName = split.first;
    attrs.lastName = split.last;
  } else if (input.fullName) {
    attrs.fullName = input.fullName;
  }

  return attrs;
}

function rawPayloadFromResults(
  parts: Array<{ step: string; ok: boolean; status?: number; body?: unknown; reason?: string }>,
  enrichmentDomainFlags: ZoomInfoEnrichmentDomains
): Record<string, unknown> {
  return {
    provider: "zoominfo",
    enrichmentDomainFlags,
    steps: parts,
  };
}

export async function enrichWithZoomInfo(
  input: NormalizedEnrichmentInput,
  options?: { apiKey?: string | null; enrichmentDomains?: ZoomInfoEnrichmentDomains }
): Promise<ProviderEnrichmentResult> {
  const apiKey = asString(options?.apiKey) ?? asString(process.env["ZOOMINFO_API_KEY"]);
  if (!apiKey) {
    throw new Error(
      "ZoomInfo API key is missing. Set ZOOMINFO_API_KEY or save a ZoomInfo bearer token under Integrations."
    );
  }

  const domains = options?.enrichmentDomains ?? DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS;
  const steps: Array<{ step: string; ok: boolean; status?: number; body?: unknown; reason?: string }> = [];

  if (!domains.contact) {
    return {
      provider: "zoominfo",
      rawResponse: rawPayloadFromResults(
        [{ step: "skipped", ok: true, reason: "contact_domain_disabled" }],
        domains
      ) as Record<string, unknown>,
      normalized: emptyNormalized(),
      shouldUpdateNormalized: false,
      noMatch: true,
    };
  }

  const companyId = domains.company
    ? await resolveCompanyIdFromDomain(apiKey, input.companyDomain ?? null)
    : null;

  const searchAttrs = buildContactSearchAttributes(input, companyId);
  const searchRes = await searchContacts(apiKey, searchAttrs);
  steps.push({
    step: "contacts_search",
    ok: searchRes.ok,
    status: searchRes.ok ? searchRes.status : searchRes.status,
    body: searchRes.ok ? searchRes.data : searchRes.body,
  });

  if (!searchRes.ok) {
    return {
      provider: "zoominfo",
      rawResponse: rawPayloadFromResults(steps, domains) as Record<string, unknown>,
      normalized: emptyNormalized(),
      shouldUpdateNormalized: false,
      noMatch: false,
      errorMessage: searchRes.message,
    };
  }

  let personId: string | null = pickBestContactPersonId(readDataArray(searchRes.data));

  const matchInputs: Record<string, unknown>[] = [];
  if (personId) {
    const pid = Number(personId);
    if (Number.isFinite(pid)) {
      matchInputs.push({ personId: pid });
    }
  }
  if (matchInputs.length === 0) {
    matchInputs.push(buildDirectMatchCriteria(input, companyId));
  }

  const enrichRes = await enrichContacts(apiKey, matchInputs, [...OUTPUT_FIELDS]);
  steps.push({
    step: "contacts_enrich",
    ok: enrichRes.ok,
    status: enrichRes.ok ? enrichRes.status : enrichRes.status,
    body: enrichRes.ok ? enrichRes.data : enrichRes.body,
  });

  if (!enrichRes.ok) {
    return {
      provider: "zoominfo",
      rawResponse: rawPayloadFromResults(steps, domains) as Record<string, unknown>,
      normalized: emptyNormalized(),
      shouldUpdateNormalized: false,
      noMatch: false,
      errorMessage: enrichRes.message,
    };
  }

  const items = readDataArray(enrichRes.data);
  if (items.length === 0) {
    return {
      provider: "zoominfo",
      rawResponse: rawPayloadFromResults(steps, domains) as Record<string, unknown>,
      normalized: emptyNormalized(),
      shouldUpdateNormalized: false,
      noMatch: true,
    };
  }

  const first = items[0]!;
  const meta = asRecord(first.meta);
  const matchStatus = asString(meta?.matchStatus);

  if (zoomInfoMatchStatusIsNoMatch(matchStatus)) {
    return {
      provider: "zoominfo",
      rawResponse: rawPayloadFromResults(steps, domains) as Record<string, unknown>,
      normalized: emptyNormalized(),
      shouldUpdateNormalized: false,
      noMatch: true,
    };
  }

  const normalized = mapZoomInfoContactEnrichItemToNormalized(first);
  if (!hasMeaningfulZoomInfoNormalized(normalized)) {
    return {
      provider: "zoominfo",
      rawResponse: rawPayloadFromResults(steps, domains) as Record<string, unknown>,
      normalized: emptyNormalized(),
      shouldUpdateNormalized: false,
      noMatch: true,
    };
  }

  return {
    provider: "zoominfo",
    rawResponse: rawPayloadFromResults(steps, domains) as Record<string, unknown>,
    normalized,
    shouldUpdateNormalized: true,
    noMatch: false,
  };
}
