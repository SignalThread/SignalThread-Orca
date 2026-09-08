import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegrationStatus, type IntegrationStatusRow } from "@/lib/integrations/integration-status";
import type { WorkflowBuilderCrmProviderOption } from "./workflow-builder-crm-types";
import type { WorkflowCrmProviderKey } from "@/lib/workflows/step-handlers/crm-sync-types";
import {
  buildWorkflowBuilderCrmProviders,
  workflowBuilderCrmProvidersInCatalogOrder
} from "./workflow-builder-crm-resolver";
import {
  normalizeCrmSyncMatchBehavior,
  normalizeCrmSyncRecordType
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";

export type WorkflowBuilderCrmBundle = {
  providers: WorkflowBuilderCrmProviderOption[];
};

export async function resolveWorkflowBuilderCrmProviders(input: {
  accountId: string;
  integrationRows: IntegrationStatusRow[];
  syncConfigs?: Parameters<typeof buildWorkflowBuilderCrmProviders>[0]["syncConfigs"];
}): Promise<WorkflowBuilderCrmProviderOption[]> {
  const supabase = createAdminClient();
  const statuses: Array<{ provider: string; connected: boolean }> = [];

  for (const key of workflowBuilderCrmProvidersInCatalogOrder()) {
    const { status } = await getIntegrationStatus(input.accountId, key, {
      supabase,
      integrationRows: input.integrationRows
    });
    statuses.push({ provider: status.provider, connected: status.connected });
  }

  return buildWorkflowBuilderCrmProviders({ statuses, syncConfigs: input.syncConfigs });
}

/**
 * Connected CRM OAuth integrations for the workflow builder (real `integrations` rows).
 */
export async function loadWorkflowBuilderCrmBundle(companyId: string): Promise<WorkflowBuilderCrmBundle> {
  const id = String(companyId ?? "").trim();
  if (!id) {
    return { providers: [] };
  }

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("integrations")
    .select("provider, account_id, access_token, provider_account_id, refresh_token, scope")
    .eq("account_id", id)
    .in(
      "provider",
      workflowBuilderCrmProvidersInCatalogOrder() as unknown as string[]
    );

  if (error) {
    console.warn("[loadWorkflowBuilderCrmBundle] integrations query failed", error.message);
    return { providers: [] };
  }

  const rows = (data ?? []) as IntegrationStatusRow[];

  const { data: syncConfigRows, error: syncConfigError } = await (supabase as any)
    .from("integration_sync_configs")
    .select("provider, sync_target_object, sync_behavior, campaign_name")
    .eq("account_id", id)
    .in("provider", workflowBuilderCrmProvidersInCatalogOrder() as unknown as string[]);

  if (syncConfigError) {
    console.warn("[loadWorkflowBuilderCrmBundle] integration sync config query failed", syncConfigError.message);
  }

  const syncConfigs: Parameters<typeof buildWorkflowBuilderCrmProviders>[0]["syncConfigs"] = {};
  for (const row of (syncConfigRows ?? []) as Array<{
    provider?: string | null;
    sync_target_object?: string | null;
    sync_behavior?: string | null;
    campaign_name?: string | null;
  }>) {
    const provider = String(row.provider ?? "").trim().toLowerCase() as WorkflowCrmProviderKey;
    if (provider !== "hubspot" && provider !== "salesforce") continue;
    syncConfigs[provider] = {
      recordType: normalizeCrmSyncRecordType(row.sync_target_object) ?? undefined,
      matchBehavior: normalizeCrmSyncMatchBehavior(row.sync_behavior) ?? undefined,
      sourceLabel: row.campaign_name ?? null
    };
  }

  return {
    providers: await resolveWorkflowBuilderCrmProviders({
      accountId: id,
      integrationRows: rows,
      syncConfigs
    })
  };
}
