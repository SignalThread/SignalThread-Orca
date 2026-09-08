/**
 * Workflow builder entry — AI-native orchestration canvas (create flow).
 * Persisted shape unchanged: POST `/api/exhibitor/workflows/create`.
 */

import type {
  WorkflowBuilderEnrichmentAdapterKey,
  WorkflowBuilderEnrichmentProviderOption
} from "@/lib/exhibitor/workflows/workflow-builder-enrichment-types";
import type { WorkflowBuilderCrmProviderOption } from "@/lib/exhibitor/workflows/workflow-builder-crm-types";

import type { WorkflowBuilderSignalOption } from "@/lib/exhibitor/workflows/workflow-builder-signal-types";

import { WorkflowOrchestrationBuilder } from "./workflow-orchestration-builder";

export type { WorkflowBuilderSignalOption };

export function WorkflowBuilderForm({
  signals,
  enrichmentProviders,
  workspaceDefaultAdapterKey,
  crmProviders,
  eventId,
  scopeMode = "event"
}: {
  signals: readonly WorkflowBuilderSignalOption[];
  enrichmentProviders: readonly WorkflowBuilderEnrichmentProviderOption[];
  workspaceDefaultAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null;
  crmProviders: readonly WorkflowBuilderCrmProviderOption[];
  eventId?: string | null;
  scopeMode?: "event" | "company";
}) {
  return (
    <WorkflowOrchestrationBuilder
      signals={signals}
      enrichmentProviders={enrichmentProviders}
      workspaceDefaultAdapterKey={workspaceDefaultAdapterKey}
      crmProviders={crmProviders}
      eventId={eventId}
      scopeMode={scopeMode}
    />
  );
}
