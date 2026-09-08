/**
 * Maps wizard UI provider ids ↔ enrichment adapter keys and DB `companies.default_enrichment_provider`.
 */

import type { EnrichmentAdapterKey } from "@/lib/enrichment/resolve-adapter-for-company";

export type WizardEnrichmentProviderId = "apollo" | "zoominfo" | "pdl";

export function wizardProviderIdToAdapterKey(id: string): EnrichmentAdapterKey | null {
  if (id === "apollo" || id === "zoominfo" || id === "pdl") {
    return id;
  }
  return null;
}

/** DB value from companies.default_enrichment_provider → wizard select id */
export function dbDefaultEnrichmentToWizardId(db: string | null | undefined): WizardEnrichmentProviderId | null {
  if (!db) return null;
  if (db === "people_data_labs") return "pdl";
  if (db === "apollo") return "apollo";
  if (db === "zoominfo") return "zoominfo";
  return null;
}
