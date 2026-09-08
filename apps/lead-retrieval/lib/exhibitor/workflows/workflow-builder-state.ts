import type { WorkflowDetailStepRow, WorkflowDetailTemplate } from "./workflow-detail-types";
import {
  DEFAULT_TRIGGER_RULE_CONFIG,
  triggerRuleConfigFromJson,
  type LeadCapturedTriggerRuleConfig
} from "./lead-captured-trigger-rule-config";
import {
  DEFAULT_WORKFLOW_COMPOSE_OUTPUT_ACTION_KIND,
  normalizeComposeOutputActionKind,
  type WorkflowComposeOutputActionKind
} from "./workflow-compose-output-action";
import type {
  WorkflowBuilderEnrichmentAdapterKey
} from "./workflow-builder-enrichment-types";
import { normalizeAuthoringToneHint } from "./draft-tone-presets";
import { COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE } from "@/lib/workflows/step-handlers/compose-campaign-draft-pure";
import { ENRICH_LEAD_STEP_TYPE } from "@/lib/workflows/step-handlers/enrich-lead-pure";
import {
  CRM_SYNC_HUBSPOT_STEP_TYPE,
  CRM_SYNC_SALESFORCE_STEP_TYPE,
  DEFAULT_WORKFLOW_CRM_SYNC_CONTENT_OPTIONS,
  defaultCrmOperationForProvider,
  inferCrmProviderFromOperation,
  parseSalesforceWorkflowSyncNoteOptions,
  type WorkflowCrmSyncContentOptions,
  normalizeCrmOperation,
  type WorkflowCrmOperationId,
  type WorkflowCrmProviderKey
} from "@/lib/workflows/step-handlers/crm-sync-types";
import {
  parseWorkflowCrmSyncConfigOverride,
  type WorkflowCrmSyncConfig,
  type WorkflowCrmSyncConfigMode
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";

export type WorkflowOrchestrationBuilderInitialState = {
  name: string;
  isEnabled: boolean;
  enrichLead: boolean;
  enrichmentAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null;
  enrichmentFocusIds: string[];
  composeDraft: boolean;
  outputActionKind: WorkflowComposeOutputActionKind;
  orderedSignalIds: string[];
  signalsStageEnabled: boolean;
  subjectTemplate: string;
  authoringToneHint: string | null;
  crmPushEnabled: boolean;
  crmProvider: WorkflowCrmProviderKey | null;
  crmOperation: WorkflowCrmOperationId;
  crmContentOptions: WorkflowCrmSyncContentOptions;
  crmSyncConfigMode: WorkflowCrmSyncConfigMode;
  crmSyncConfigOverride: Partial<WorkflowCrmSyncConfig> | null;
  terminalApprovalRequired: boolean;
  triggerRuleConfig: LeadCapturedTriggerRuleConfig;
};

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

function enrichmentAdapterKey(value: unknown): WorkflowBuilderEnrichmentAdapterKey | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "apollo" || normalized === "pdl" || normalized === "zoominfo") {
    return normalized;
  }
  return null;
}

export function workflowBuilderInitialStateFromDetail(input: {
  template: WorkflowDetailTemplate;
  steps: readonly WorkflowDetailStepRow[];
}): WorkflowOrchestrationBuilderInitialState {
  const enrichStep = input.steps.find((step) => step.step_type === ENRICH_LEAD_STEP_TYPE) ?? null;
  const composeStep = input.steps.find((step) => step.step_type === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE) ?? null;
  const hubspotStep = input.steps.find((step) => step.step_type === CRM_SYNC_HUBSPOT_STEP_TYPE) ?? null;
  const salesforceStep = input.steps.find((step) => step.step_type === CRM_SYNC_SALESFORCE_STEP_TYPE) ?? null;
  const crmStep = hubspotStep ?? salesforceStep;
  const crmProvider: WorkflowCrmProviderKey | null =
    (typeof crmStep?.params_jsonb?.provider === "string" &&
    (crmStep.params_jsonb.provider === "hubspot" || crmStep.params_jsonb.provider === "salesforce")
      ? (crmStep.params_jsonb.provider as WorkflowCrmProviderKey)
      : null) ??
    (hubspotStep ? "hubspot" : salesforceStep ? "salesforce" : inferCrmProviderFromOperation(crmStep?.params_jsonb?.operation));

  const composeParams = composeStep?.params_jsonb ?? {};
  const crmParams = crmStep?.params_jsonb ?? {};
  const enrichParams = enrichStep?.params_jsonb ?? {};
  const terminalStep = crmStep ?? composeStep;
  const crmSyncConfig = crmProvider
    ? parseWorkflowCrmSyncConfigOverride(crmParams, crmProvider)
    : { mode: "integration_default" as const, override: null };

  return {
    name: input.template.name,
    isEnabled: input.template.is_enabled,
    enrichLead: Boolean(enrichStep),
    enrichmentAdapterKey: enrichmentAdapterKey(enrichParams.enrichmentAdapterKey),
    enrichmentFocusIds: stringArray(enrichParams.focusAreas),
    composeDraft: Boolean(composeStep),
    outputActionKind: composeStep
      ? normalizeComposeOutputActionKind(composeParams.outputActionKind)
      : DEFAULT_WORKFLOW_COMPOSE_OUTPUT_ACTION_KIND,
    orderedSignalIds: stringArray(composeParams.selectedSignalIds),
    signalsStageEnabled: composeParams.signalsStageEnabled === false || crmParams.signalsStageEnabled === false ? false : true,
    subjectTemplate:
      typeof composeParams.subjectTemplate === "string" && composeParams.subjectTemplate.trim()
        ? composeParams.subjectTemplate.trim()
        : "Hi {{first_name}}, quick follow-up",
    authoringToneHint: normalizeAuthoringToneHint(composeParams.authoringToneHint),
    crmPushEnabled: Boolean(crmStep && crmProvider),
    crmProvider,
    crmOperation: crmProvider
      ? normalizeCrmOperation(crmParams.operation, crmProvider)
      : defaultCrmOperationForProvider("hubspot"),
    crmContentOptions:
      crmStep ? parseSalesforceWorkflowSyncNoteOptions(crmParams) : { ...DEFAULT_WORKFLOW_CRM_SYNC_CONTENT_OPTIONS },
    crmSyncConfigMode: crmSyncConfig.mode,
    crmSyncConfigOverride: crmSyncConfig.override,
    terminalApprovalRequired: terminalStep ? Boolean(terminalStep.requires_approval) : true,
    triggerRuleConfig: input.template.trigger_conditions_jsonb
      ? triggerRuleConfigFromJson(input.template.trigger_conditions_jsonb)
      : { ...DEFAULT_TRIGGER_RULE_CONFIG }
  };
}
