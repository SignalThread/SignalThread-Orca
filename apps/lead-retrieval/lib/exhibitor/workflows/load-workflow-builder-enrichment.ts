import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConfiguredAdapterKeysForCompany } from "@/lib/enrichment/resolve-adapter-for-company";
import { dbDefaultEnrichmentToWizardId } from "@/lib/import-wizard/wizard-enrichment-bridge";
import { getZoomInfoEnrichmentDomainsForCompany } from "@/lib/server/integrations/zoominfo";
import type {
  WorkflowBuilderEnrichmentAdapterKey,
  WorkflowBuilderEnrichmentProviderOption
} from "./workflow-builder-enrichment-types";
import { workflowProviderCategoriesForAdapter } from "./enrichment-provider-capabilities";

const LABELS: Record<WorkflowBuilderEnrichmentAdapterKey, string> = {
  apollo: "Apollo",
  zoominfo: "ZoomInfo",
  pdl: "PDL"
};

export type WorkflowBuilderEnrichmentBundle = {
  providers: WorkflowBuilderEnrichmentProviderOption[];
  /** Adapter key when company default is configured and credentials exist for it. */
  workspaceDefaultAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null;
};

export async function loadWorkflowBuilderEnrichmentBundle(companyId: string): Promise<WorkflowBuilderEnrichmentBundle> {
  const id = String(companyId ?? "").trim();
  if (!id) {
    return { providers: [], workspaceDefaultAdapterKey: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data: companyRow } = (await supabase
    .from("companies")
    .select("default_enrichment_provider")
    .eq("id", id)
    .maybeSingle()) as {
    data: { default_enrichment_provider?: string | null } | null;
  };

  const dbDefault = companyRow?.default_enrichment_provider ?? null;
  const wizardDefault = dbDefaultEnrichmentToWizardId(dbDefault);

  const configured = await getConfiguredAdapterKeysForCompany(id);
  const zoominfoDomains = configured.includes("zoominfo")
    ? await getZoomInfoEnrichmentDomainsForCompany(id)
    : null;

  const providers: WorkflowBuilderEnrichmentProviderOption[] = configured.map((key) => ({
    id: key,
    label: LABELS[key],
    categories: workflowProviderCategoriesForAdapter({
      provider: key,
      zoominfoDomains: key === "zoominfo" ? zoominfoDomains : null
    })
  }));

  let workspaceDefaultAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null = null;
  if (wizardDefault && configured.includes(wizardDefault)) {
    workspaceDefaultAdapterKey = wizardDefault;
  }

  return { providers, workspaceDefaultAdapterKey };
}
