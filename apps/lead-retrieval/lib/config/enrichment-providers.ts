/**
 * Canonical enrichment provider ids stored in companies.default_enrichment_provider
 * and used by lib/enrichment. Extend as additional adapters ship.
 */
export const ENRICHMENT_PROVIDER_IDS = ["people_data_labs", "apollo", "zoominfo"] as const;

export type EnrichmentProviderId = (typeof ENRICHMENT_PROVIDER_IDS)[number];

export function isEnrichmentProviderId(value: string): value is EnrichmentProviderId {
  return (ENRICHMENT_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Display names for Settings / Integrations copy; extend when new providers ship. */
export const ENRICHMENT_PROVIDER_LABELS: Partial<Record<string, string>> = {
  people_data_labs: "People Data Labs",
  apollo: "Apollo",
  zoominfo: "ZoomInfo",
};

export function labelForEnrichmentProviderId(id: string | null | undefined): string | null {
  if (!id) return null;
  return ENRICHMENT_PROVIDER_LABELS[id] ?? id.replace(/_/g, " ");
}
