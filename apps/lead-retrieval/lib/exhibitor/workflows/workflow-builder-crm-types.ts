import type { WorkflowCrmProviderKey } from "@/lib/workflows/step-handlers/crm-sync-types";
import type { WorkflowCrmSyncConfig } from "@/lib/workflows/step-handlers/crm-sync-effective-config";

export type WorkflowBuilderCrmProviderOption = {
  id: WorkflowCrmProviderKey;
  label: string;
  logoSrc: string;
  /** Deep-link for “manage connection” from the builder inspector. */
  manageHref: string;
  /** Integration-level defaults inherited by workflow CRM steps unless a step override is saved. */
  defaultSyncConfig: WorkflowCrmSyncConfig;
};
