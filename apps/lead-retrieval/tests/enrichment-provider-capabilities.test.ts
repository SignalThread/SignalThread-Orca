import assert from "node:assert/strict";
import test from "node:test";
import {
  ENRICHMENT_PROVIDER_CATEGORY_IDS,
  filterAvailableFocusAreaIdsForProviderOption,
  filterSupportedFocusAreaIdsForProvider,
  providerFocusAreaIdsByAdapter,
  workflowAdapterKeysSupportingFocusArea,
  workflowFocusAreasForProvider,
  workflowProviderCategoriesForAdapter
} from "../lib/exhibitor/workflows/enrichment-provider-capabilities";
import type { WorkflowBuilderEnrichmentProviderOption } from "../lib/exhibitor/workflows/workflow-builder-enrichment-types";
import { WORKFLOW_ENRICHMENT_FOCUS_AREAS } from "../lib/exhibitor/workflows/enrichment-focus-options";
import {
  ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS,
  type ZoomInfoEnrichmentDomains
} from "../lib/integrations/zoominfo/enrichment-domain-settings";

test("workflow categories reuse the ZoomInfo integration settings model", () => {
  assert.deepEqual(
    WORKFLOW_ENRICHMENT_FOCUS_AREAS.map((area) => ({
      id: area.id,
      label: area.label,
      description: area.hint
    })),
    ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS
  );
});

test("PDL selected shows only PDL-backed categories", () => {
  assert.deepEqual(workflowFocusAreasForProvider("pdl").map((area) => area.id), ["company", "contact"]);
});

test("ZoomInfo selected shows only Company, Contact, Intent from actual capability config", () => {
  const domains: ZoomInfoEnrichmentDomains = {
    company: true,
    contact: true,
    intent: true
  };
  assert.deepEqual(
    workflowProviderCategoriesForAdapter({ provider: "zoominfo", zoominfoDomains: domains }).map((category) => category.label),
    ["Company", "Contact", "Intent"]
  );
});

test("ZoomInfo enabled settings control which categories appear", () => {
  const domains: ZoomInfoEnrichmentDomains = {
    company: true,
    contact: false,
    intent: true
  };
  assert.deepEqual(
    workflowProviderCategoriesForAdapter({ provider: "zoominfo", zoominfoDomains: domains }).map((category) => category.id),
    ["company", "intent"]
  );
});

test("Apollo and PDL stay limited to company/contact categories", () => {
  assert.deepEqual(ENRICHMENT_PROVIDER_CATEGORY_IDS.apollo, ["company", "contact"]);
  assert.deepEqual(ENRICHMENT_PROVIDER_CATEGORY_IDS.pdl, ["company", "contact"]);
});

test("provider switch removes invalid category selections", () => {
  const zoominfoProvider: WorkflowBuilderEnrichmentProviderOption = {
    id: "zoominfo",
    label: "ZoomInfo",
    categories: workflowProviderCategoriesForAdapter({
      provider: "zoominfo",
      zoominfoDomains: { company: true, contact: true, intent: true }
    })
  };
  const pdlProvider: WorkflowBuilderEnrichmentProviderOption = {
    id: "pdl",
    label: "PDL",
    categories: workflowProviderCategoriesForAdapter({ provider: "pdl" })
  };

  assert.deepEqual(
    filterAvailableFocusAreaIdsForProviderOption(zoominfoProvider, ["company", "intent", "contact"]),
    ["company", "intent", "contact"]
  );
  assert.deepEqual(
    filterAvailableFocusAreaIdsForProviderOption(pdlProvider, ["company", "intent", "contact"]),
    ["company", "contact"]
  );
});

test("providerFocusAreaIdsByAdapter returns actual enabled ids for create-time validation", () => {
  const providers: WorkflowBuilderEnrichmentProviderOption[] = [
    {
      id: "zoominfo",
      label: "ZoomInfo",
      categories: workflowProviderCategoriesForAdapter({
        provider: "zoominfo",
        zoominfoDomains: { company: true, contact: false, intent: true }
      })
    },
    {
      id: "pdl",
      label: "PDL",
      categories: workflowProviderCategoriesForAdapter({ provider: "pdl" })
    }
  ];

  assert.deepEqual(providerFocusAreaIdsByAdapter(providers), {
    zoominfo: ["company", "intent"],
    pdl: ["company", "contact"]
  });
});

test("workflowAdapterKeysSupportingFocusArea: intent is ZoomInfo-only", () => {
  assert.deepEqual(workflowAdapterKeysSupportingFocusArea("intent"), ["zoominfo"]);
});

test("filterSupportedFocusAreaIdsForProvider uses actual provider-backed coarse categories", () => {
  assert.deepEqual(
    filterSupportedFocusAreaIdsForProvider("pdl", ["company", "intent", "contact"]),
    ["company", "contact"]
  );
});
