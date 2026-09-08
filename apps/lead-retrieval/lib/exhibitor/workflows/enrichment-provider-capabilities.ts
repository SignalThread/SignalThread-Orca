/**
 * Provider-aware enrichment categories for workflow authoring.
 *
 * `focusAreas` are persisted for workflow UX / audits only. Runtime enrichment behavior is
 * unchanged, so these categories must stay grounded in provider capabilities that already
 * exist elsewhere in the app:
 * - ZoomInfo reuses the same Company / Contact / Intent toggles from its integration settings.
 * - Apollo / PDL expose only coarse Company / Contact buckets backed by current runtime fields.
 */

import {
  ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS,
  type ZoomInfoEnrichmentDomains
} from "@/lib/integrations/zoominfo/enrichment-domain-settings";
import type {
  WorkflowBuilderEnrichmentAdapterKey,
  WorkflowBuilderEnrichmentCategoryId,
  WorkflowBuilderEnrichmentCategoryOption,
  WorkflowBuilderEnrichmentProviderOption
} from "./workflow-builder-enrichment-types";
import {
  WORKFLOW_ENRICHMENT_FOCUS_AREAS,
  type WorkflowEnrichmentFocusArea
} from "./enrichment-focus-options";

const WORKFLOW_ENRICHMENT_PROVIDER_KEYS: readonly WorkflowBuilderEnrichmentAdapterKey[] = [
  "apollo",
  "pdl",
  "zoominfo"
] as const;

export const ENRICHMENT_PROVIDER_CATEGORY_IDS: Record<
  WorkflowBuilderEnrichmentAdapterKey,
  readonly WorkflowBuilderEnrichmentCategoryId[]
> = {
  apollo: ["company", "contact"],
  pdl: ["company", "contact"],
  zoominfo: ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS.map((option) => option.id)
};

function categoryOptionsFromIds(
  ids: readonly WorkflowBuilderEnrichmentCategoryId[]
): WorkflowBuilderEnrichmentCategoryOption[] {
  const allowed = new Set(ids);
  return ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS.filter(
    (option): option is WorkflowBuilderEnrichmentCategoryOption => allowed.has(option.id)
  );
}

function workflowFocusAreasFromIds(
  ids: readonly WorkflowBuilderEnrichmentCategoryId[]
): readonly WorkflowEnrichmentFocusArea[] {
  const allowed = new Set(ids);
  return WORKFLOW_ENRICHMENT_FOCUS_AREAS.filter((area) => allowed.has(area.id));
}

function uniqueSupportedIds(
  ids: readonly string[],
  allowed: ReadonlySet<string>
): WorkflowBuilderEnrichmentCategoryId[] {
  const out: WorkflowBuilderEnrichmentCategoryId[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as WorkflowBuilderEnrichmentCategoryId);
  }

  return out;
}

export function supportedFocusAreaIdsForProvider(
  provider: WorkflowBuilderEnrichmentAdapterKey
): readonly WorkflowBuilderEnrichmentCategoryId[] {
  return ENRICHMENT_PROVIDER_CATEGORY_IDS[provider];
}

export function workflowProviderCategoriesForAdapter(input: {
  provider: WorkflowBuilderEnrichmentAdapterKey;
  zoominfoDomains?: ZoomInfoEnrichmentDomains | null;
}): WorkflowBuilderEnrichmentCategoryOption[] {
  if (input.provider === "zoominfo") {
    const domains = input.zoominfoDomains;
    if (!domains) {
      return categoryOptionsFromIds(supportedFocusAreaIdsForProvider("zoominfo"));
    }
    return ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS.filter((option) => domains[option.id]);
  }

  return categoryOptionsFromIds(supportedFocusAreaIdsForProvider(input.provider));
}

export function workflowFocusAreasForProvider(
  provider: WorkflowBuilderEnrichmentAdapterKey,
  enabledIds?: readonly WorkflowBuilderEnrichmentCategoryId[]
): readonly WorkflowEnrichmentFocusArea[] {
  return workflowFocusAreasFromIds(
    enabledIds && enabledIds.length > 0 ? enabledIds : supportedFocusAreaIdsForProvider(provider)
  );
}

export function availableFocusAreaIdsForProviderOption(
  provider: WorkflowBuilderEnrichmentProviderOption
): readonly WorkflowBuilderEnrichmentCategoryId[] {
  return provider.categories.map((category) => category.id);
}

export function providerFocusAreaIdsByAdapter(
  providers: readonly WorkflowBuilderEnrichmentProviderOption[]
): Partial<Record<WorkflowBuilderEnrichmentAdapterKey, readonly WorkflowBuilderEnrichmentCategoryId[]>> {
  return Object.fromEntries(
    providers.map((provider) => [provider.id, availableFocusAreaIdsForProviderOption(provider)])
  ) as Partial<Record<WorkflowBuilderEnrichmentAdapterKey, readonly WorkflowBuilderEnrichmentCategoryId[]>>;
}

export function filterSupportedFocusAreaIdsForProvider(
  provider: WorkflowBuilderEnrichmentAdapterKey,
  areaIds: readonly string[],
  enabledIds?: readonly WorkflowBuilderEnrichmentCategoryId[]
): WorkflowBuilderEnrichmentCategoryId[] {
  const allowed = new Set<string>(enabledIds ?? supportedFocusAreaIdsForProvider(provider));
  return uniqueSupportedIds(areaIds, allowed);
}

export function filterAvailableFocusAreaIdsForProviderOption(
  provider: WorkflowBuilderEnrichmentProviderOption,
  areaIds: readonly string[]
): WorkflowBuilderEnrichmentCategoryId[] {
  return filterSupportedFocusAreaIdsForProvider(
    provider.id,
    areaIds,
    availableFocusAreaIdsForProviderOption(provider)
  );
}

export function workflowAdapterKeysSupportingFocusArea(
  areaId: WorkflowBuilderEnrichmentCategoryId
): WorkflowBuilderEnrichmentAdapterKey[] {
  return WORKFLOW_ENRICHMENT_PROVIDER_KEYS.filter((key) =>
    supportedFocusAreaIdsForProvider(key).includes(areaId)
  );
}
