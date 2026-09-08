/**
 * Mock workspace enrichment provider catalog for the import wizard.
 * Replace with API-driven availability + workspace default when backend exists.
 */

export type EnrichmentProviderId = "apollo" | "zoominfo" | "pdl";

export type EnrichmentProviderOption = {
  id: EnrichmentProviderId;
  /** Short display name — minimal branding */
  label: string;
};

/** Workspace-level default (mock). Not mutated by batch overrides in the wizard. */
export const WORKSPACE_DEFAULT_ENRICHMENT_PROVIDER_ID: EnrichmentProviderId = "apollo";

/**
 * Providers currently available for this workspace / integration setup (mock).
 * If this array has length 1, the UI shows a locked single choice (no dropdown).
 */
export const AVAILABLE_ENRICHMENT_PROVIDERS_FOR_BATCH: readonly EnrichmentProviderOption[] = [
  { id: "apollo", label: "Apollo" },
  { id: "zoominfo", label: "ZoomInfo" },
  { id: "pdl", label: "PDL" },
];

export function getEnrichmentProviderLabel(id: EnrichmentProviderId): string {
  return AVAILABLE_ENRICHMENT_PROVIDERS_FOR_BATCH.find((p) => p.id === id)?.label ?? id;
}

/**
 * Initial batch selection: workspace default when it is available; otherwise first configured provider.
 */
export function resolveInitialBatchEnrichmentProvider(
  available: readonly EnrichmentProviderOption[] = AVAILABLE_ENRICHMENT_PROVIDERS_FOR_BATCH
): EnrichmentProviderId {
  if (available.length === 0) {
    return WORKSPACE_DEFAULT_ENRICHMENT_PROVIDER_ID;
  }
  const defaultOk = available.some((p) => p.id === WORKSPACE_DEFAULT_ENRICHMENT_PROVIDER_ID);
  if (defaultOk) {
    return WORKSPACE_DEFAULT_ENRICHMENT_PROVIDER_ID;
  }
  return available[0]!.id;
}
