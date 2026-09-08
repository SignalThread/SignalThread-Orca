/**
 * Client-safe enrichment types for the exhibitor workflow builder.
 * Matches adapter keys from `lib/enrichment/resolve-adapter-for-company` without importing `server-only`.
 */

import type { ZoomInfoEnrichmentDomains } from "@/lib/integrations/zoominfo/enrichment-domain-settings";

export type WorkflowBuilderEnrichmentAdapterKey = "apollo" | "pdl" | "zoominfo";

export type WorkflowBuilderEnrichmentCategoryId = keyof ZoomInfoEnrichmentDomains;

export type WorkflowBuilderEnrichmentCategoryOption = {
  id: WorkflowBuilderEnrichmentCategoryId;
  label: string;
  description: string;
};

export type WorkflowBuilderEnrichmentProviderOption = {
  id: WorkflowBuilderEnrichmentAdapterKey;
  label: string;
  categories: WorkflowBuilderEnrichmentCategoryOption[];
};
