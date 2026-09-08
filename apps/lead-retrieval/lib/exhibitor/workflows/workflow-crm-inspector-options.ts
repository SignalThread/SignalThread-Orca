import type { WorkflowCrmOperationId, WorkflowCrmProviderKey } from "@/lib/workflows/step-handlers/crm-sync-types";

export type WorkflowCrmOperationUiOption = {
  id: WorkflowCrmOperationId;
  label: string;
  description: string;
};

export function workflowCrmOperationOptions(provider: WorkflowCrmProviderKey): WorkflowCrmOperationUiOption[] {
  if (provider === "hubspot") {
    return [
      {
        id: "hubspot_upsert_contact",
        label: "Create / update contact",
        description: "Upserts a HubSpot contact matched on email."
      }
    ];
  }
  return [
    {
      id: "salesforce_upsert_lead",
      label: "Create / update Lead",
      description: "Creates or updates a Salesforce Lead matched on email."
    }
  ];
}

export function labelForCrmOperation(provider: WorkflowCrmProviderKey, op: WorkflowCrmOperationId): string {
  const found = workflowCrmOperationOptions(provider).find((x) => x.id === op);
  return found?.label ?? op;
}
