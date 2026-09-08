/** App-side ZoomInfo enrichment data domains (stored in zoominfo_company_connections.metadata). */

export const ZOOMINFO_ENRICHMENT_DOMAINS_METADATA_KEY = "enrichment_domains" as const;

export type ZoomInfoEnrichmentDomains = {
  company: boolean;
  contact: boolean;
  intent: boolean;
};

export type ZoomInfoEnrichmentDomainOption = {
  id: keyof ZoomInfoEnrichmentDomains;
  label: string;
  description: string;
};

export const ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS: readonly ZoomInfoEnrichmentDomainOption[] = [
  { id: "company", label: "Company", description: "Company profile and firmographic enrichment" },
  { id: "contact", label: "Contact", description: "Person/profile enrichment" },
  { id: "intent", label: "Intent", description: "Buying/research intent signals" }
] as const;

export const DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS: ZoomInfoEnrichmentDomains = {
  company: true,
  contact: true,
  intent: true,
};

function readBool(
  obj: Record<string, unknown>,
  key: keyof ZoomInfoEnrichmentDomains,
  fallback: boolean
): boolean {
  if (!(key in obj)) return fallback;
  const v = obj[key];
  return typeof v === "boolean" ? v : fallback;
}

export function parseZoomInfoEnrichmentDomainsFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): ZoomInfoEnrichmentDomains {
  const raw = metadata?.[ZOOMINFO_ENRICHMENT_DOMAINS_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS };
  }
  const o = raw as Record<string, unknown>;
  return {
    company: readBool(o, "company", DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS.company),
    contact: readBool(o, "contact", DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS.contact),
    intent: readBool(o, "intent", DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS.intent),
  };
}

/** API body: each present key must be boolean; omitted keys keep defaults. */
export function coerceZoomInfoEnrichmentDomainsFromApiBody(body: unknown): ZoomInfoEnrichmentDomains | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const o = body as Record<string, unknown>;
  const keys: (keyof ZoomInfoEnrichmentDomains)[] = ["company", "contact", "intent"];
  const out: ZoomInfoEnrichmentDomains = { ...DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS };
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
    if (typeof o[k] !== "boolean") return null;
    out[k] = o[k] as boolean;
  }
  return out;
}
