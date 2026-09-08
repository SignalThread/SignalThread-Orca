import { INTEGRATION_CATALOG } from "@/lib/config/integration-catalog";
import type { IntegrationStatus, IntegrationStatusRow } from "@/lib/integrations/integration-status";
import type { WorkflowBuilderCrmProviderOption } from "./workflow-builder-crm-types";
import type { WorkflowCrmProviderKey } from "@/lib/workflows/step-handlers/crm-sync-types";
import {
  defaultCrmSyncConfigForProvider,
  normalizeCrmSyncMatchBehavior,
  normalizeCrmSyncRecordType,
  type WorkflowCrmSyncConfig
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";

const CRM_BUILDER_PROVIDERS: WorkflowCrmProviderKey[] = ["hubspot", "salesforce"];

function catalogMeta(provider: WorkflowCrmProviderKey): { label: string; logoSrc: string; manageHref: string } {
  const item = INTEGRATION_CATALOG.find((i) => i.provider === provider && i.category === "CRMs");
  return {
    label: item?.name ?? (provider === "hubspot" ? "HubSpot" : "Salesforce"),
    logoSrc: item?.logoSrc ?? (provider === "hubspot" ? "/integrations/hubspot-logo.svg" : "/integrations/salesforce-logo.svg"),
    manageHref: item?.manageRoute ?? (provider === "hubspot" ? "/exhibitor/integrations/hubspot" : "/exhibitor/integrations")
  };
}

export function workflowBuilderCrmProvidersInCatalogOrder(): readonly WorkflowCrmProviderKey[] {
  return CRM_BUILDER_PROVIDERS;
}

export function buildWorkflowBuilderCrmProviders(input: {
  statuses: ReadonlyArray<Pick<IntegrationStatus, "provider" | "connected">>;
  syncConfigs?: Partial<Record<WorkflowCrmProviderKey, Partial<WorkflowCrmSyncConfig> | null>>;
}): WorkflowBuilderCrmProviderOption[] {
  const connected = new Set(
    input.statuses
      .filter((status) => status.connected)
      .map((status) => String(status.provider ?? "").trim().toLowerCase())
  );

  const providers: WorkflowBuilderCrmProviderOption[] = [];
  for (const key of CRM_BUILDER_PROVIDERS) {
    if (!connected.has(key)) continue;
    const meta = catalogMeta(key);
    const fallback = defaultCrmSyncConfigForProvider(key);
    const rawSyncConfig = input.syncConfigs?.[key] ?? {};
    providers.push({
      id: key,
      label: meta.label,
      logoSrc: meta.logoSrc,
      manageHref: meta.manageHref,
      defaultSyncConfig: {
        recordType: normalizeCrmSyncRecordType(rawSyncConfig.recordType) ?? fallback.recordType,
        matchBehavior: normalizeCrmSyncMatchBehavior(rawSyncConfig.matchBehavior) ?? fallback.matchBehavior,
        sourceLabel:
          typeof rawSyncConfig.sourceLabel === "string" && rawSyncConfig.sourceLabel.trim()
            ? rawSyncConfig.sourceLabel.trim()
            : fallback.sourceLabel
      }
    });
  }

  return providers;
}

export type WorkflowBuilderCrmIntegrationRows = IntegrationStatusRow[];
