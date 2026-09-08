/**
 * Pure validation + row-shape helpers for creating workflow_templates / workflow_steps
 * from the exhibitor builder. Keeps POST handlers thin and testable without HTTP.
 */

import type { EventContainerKind } from "@/lib/events/event-container-kind";
import type { WorkflowScope } from "@/lib/workflows/contracts/workflow-types";
import {
  COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE,
  parseComposeCampaignDraftParams
} from "@/lib/workflows/step-handlers/compose-campaign-draft-pure";
import { ENRICH_LEAD_STEP_TYPE } from "@/lib/workflows/step-handlers/enrich-lead-pure";
import {
  CRM_SYNC_HUBSPOT_STEP_TYPE,
  CRM_SYNC_SALESFORCE_STEP_TYPE,
  DEFAULT_WORKFLOW_CRM_SYNC_CONTENT_OPTIONS,
  defaultCrmOperationForProvider,
  inferCrmProviderFromOperation,
  isWorkflowCrmProviderKey,
  parseWorkflowCrmSyncContentOptions,
  normalizeCrmOperation,
  type WorkflowCrmSyncContentOptions,
  type WorkflowCrmOperationId,
  type WorkflowCrmProviderKey
} from "@/lib/workflows/step-handlers/crm-sync-types";
import {
  parseWorkflowCrmSyncConfigOverride,
  resolveWorkflowCrmSyncConfig,
  validateResolvedWorkflowCrmSyncConfig,
  workflowCrmSyncConfigParams,
  type WorkflowCrmSyncConfig,
  type WorkflowCrmSyncConfigMode
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";

import type {
  WorkflowBuilderEnrichmentAdapterKey,
  WorkflowBuilderEnrichmentCategoryId
} from "./workflow-builder-enrichment-types";
import { normalizeAuthoringToneHint } from "./draft-tone-presets";
import { parseEnrichmentFocusAreaIdsFromBody } from "./enrichment-focus-options";
import { filterSupportedFocusAreaIdsForProvider } from "./enrichment-provider-capabilities";
import {
  DEFAULT_WORKFLOW_COMPOSE_OUTPUT_ACTION_KIND,
  type WorkflowComposeOutputActionKind,
  composeTerminalSupportsAutomaticDraft,
  normalizeComposeOutputActionKind,
  workflowComposeOutputActionIsAvailable,
  workflowComposeOutputActionUnavailableMessage
} from "./workflow-compose-output-action";

const NAME_MIN = 1;
const NAME_MAX = 200;
const DEFAULT_SUBJECT = "Hi {{first_name}}, quick follow-up";

function isWorkflowEnrichmentAdapterKey(v: string): v is WorkflowBuilderEnrichmentAdapterKey {
  return v === "apollo" || v === "pdl" || v === "zoominfo";
}

export type WorkflowBuilderFocusAreaIdsByProvider = Partial<
  Record<WorkflowBuilderEnrichmentAdapterKey, readonly WorkflowBuilderEnrichmentCategoryId[]>
>;

function validEnrichmentFocusAreaIdsForInput(
  input: CreateWorkflowInput,
  focusAreaIdsByProvider?: WorkflowBuilderFocusAreaIdsByProvider
): readonly string[] | null {
  if (!input.enrichLead || !input.enrichmentAdapterKey || input.enrichmentFocusAreaIds === null) {
    return input.enrichmentFocusAreaIds;
  }

  return filterSupportedFocusAreaIdsForProvider(
    input.enrichmentAdapterKey,
    input.enrichmentFocusAreaIds,
    focusAreaIdsByProvider?.[input.enrichmentAdapterKey]
  );
}

export type CreateWorkflowInput = {
  name: string;
  /** Resolved server-side from session + accessible events — never trust client company id. */
  enrichLead: boolean;
  /** When enrich step is enabled — persisted on the enrich step row for authoring (runtime resolver unchanged). */
  enrichmentAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null;
  /**
   * When non-null, persisted as `focusAreas` on enrich params. Null means the client omitted the field (legacy / defaults).
   */
  enrichmentFocusAreaIds: readonly string[] | null;
  composeCampaignDraft: boolean;
  /** Ordered signal UUIDs when compose step is enabled. */
  orderedSignalIds: string[];
  subjectTemplate: string;
  templateName: string | undefined;
  isEnabled: boolean;
  /** Stored on compose step params for UX / future routing — same runner today. */
  outputActionKind: WorkflowComposeOutputActionKind;
  /** Terminal CRM push using live HubSpot / Salesforce integrations. */
  crmPushEnabled: boolean;
  crmProvider: WorkflowCrmProviderKey | null;
  crmOperation: WorkflowCrmOperationId;
  crmContentOptions: WorkflowCrmSyncContentOptions;
  crmSyncConfigMode: WorkflowCrmSyncConfigMode;
  crmSyncConfigOverride: Partial<WorkflowCrmSyncConfig> | null;
  /** Authoring-only tone preset id on compose params — runner ignores today. */
  authoringToneHint: string | null;
  /** When false, builder omits the Campaign Agents node; stored on compose / CRM step params JSON only (no migration). */
  signalsStageEnabled: boolean;
  /**
   * Terminal step only (compose xor CRM). Compose defaults to approval pause; CRM defaults to automatic.
   * Persisted as `workflow_steps.requires_approval`.
   */
  terminalRequiresApproval: boolean;
  /**
   * Pre-validated trigger_conditions_jsonb from the UI. Null means "any lead" (no filtering).
   * Must match the format expected by evaluateLeadCapturedTriggerRules().
   */
  triggerConditionsJsonb: Record<string, unknown> | null;
};

export type WorkflowTemplateInsertRow = {
  company_id: string;
  name: string;
  description: string | null;
  trigger_event: "lead_captured";
  scope: WorkflowScope;
  event_id: string | null;
  is_enabled: boolean;
  version: number;
  created_by: string | null;
  trigger_conditions_jsonb?: Record<string, unknown> | null;
};

export type WorkflowStepInsertRow = {
  template_id: string;
  step_index: number;
  step_type: string;
  step_key: string;
  params_jsonb: Record<string, unknown>;
  requires_approval: boolean;
};

export type CreateWorkflowValidationError = {
  field?: string;
  message: string;
};

/** Pick DB scope + event pin from resolved active event (server computes container_kind). */
export function resolveWorkflowPinFromActiveEvent(input: {
  activeEventId: string | null;
  containerKind: EventContainerKind | null;
}): { scope: WorkflowScope; event_id: string | null } {
  if (!input.activeEventId || !input.containerKind) {
    return { scope: "any", event_id: null };
  }
  return {
    scope: input.containerKind,
    event_id: input.activeEventId
  };
}

export function normalizeCreateWorkflowBody(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

export function parseCreateWorkflowInput(body: Record<string, unknown>): CreateWorkflowInput {
  const nameRaw = body.name;
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";

  const enrichLead = body.enrich_lead === true;
  const composeCampaignDraft = body.compose_campaign_draft === true;

  const enrichKeyRaw = body.enrichment_adapter_key;
  let enrichmentAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null = null;
  if (typeof enrichKeyRaw === "string") {
    const t = enrichKeyRaw.trim().toLowerCase();
    if (isWorkflowEnrichmentAdapterKey(t)) {
      enrichmentAdapterKey = t;
    }
  }

  const hasFocusKey = Object.prototype.hasOwnProperty.call(body, "enrichment_focus_areas");
  let enrichmentFocusAreaIds: readonly string[] | null = null;
  if (hasFocusKey) {
    const parsed = parseEnrichmentFocusAreaIdsFromBody(body.enrichment_focus_areas);
    enrichmentFocusAreaIds = parsed ?? [];
  }

  const idsRaw = body.selected_signal_ids;
  const orderedSignalIds: string[] = [];
  if (Array.isArray(idsRaw)) {
    for (const entry of idsRaw) {
      const trimmed = typeof entry === "string" ? entry.trim() : "";
      if (trimmed) orderedSignalIds.push(trimmed);
    }
  }

  const subjectRaw = body.subject_template;
  const subjectTemplate =
    typeof subjectRaw === "string" && subjectRaw.trim().length > 0
      ? subjectRaw.trim()
      : DEFAULT_SUBJECT;

  const templateRaw = body.template_name;
  const templateName =
    typeof templateRaw === "string" && templateRaw.trim().length > 0 ? templateRaw.trim() : undefined;

  const isEnabled = body.is_enabled === true;

  const outputActionKind = normalizeComposeOutputActionKind(body.output_action_kind);

  const crmPushEnabled = body.crm_push_enabled === true;
  const crmProviderRaw = body.crm_provider;
  let crmProvider: WorkflowCrmProviderKey | null = null;
  if (crmPushEnabled && typeof crmProviderRaw === "string") {
    const p = crmProviderRaw.trim().toLowerCase();
    if (isWorkflowCrmProviderKey(p)) {
      crmProvider = p;
    }
  }
  /** Authoring default — OAuth is enforced when the step runs, not when the template is saved. */
  if (crmPushEnabled && !crmProvider) {
    crmProvider = inferCrmProviderFromOperation(body.crm_operation);
  }
  if (crmPushEnabled && !crmProvider) {
    crmProvider = "hubspot";
  }
  const crmOperation = crmProvider
    ? normalizeCrmOperation(body.crm_operation, crmProvider)
    : defaultCrmOperationForProvider("hubspot");
  const crmContentOptions = parseWorkflowCrmSyncContentOptions(body);
  const crmSyncConfig = crmProvider
    ? parseWorkflowCrmSyncConfigOverride(body, crmProvider)
    : { mode: "integration_default" as const, override: null };

  const authoringToneHint = normalizeAuthoringToneHint(body.authoring_tone_hint);

  const signalsStageEnabled = body.signals_stage_enabled === false ? false : true;

  const rawConditions = body.trigger_conditions_jsonb;
  const triggerConditionsJsonb: Record<string, unknown> | null =
    rawConditions !== null &&
    typeof rawConditions === "object" &&
    !Array.isArray(rawConditions)
      ? (rawConditions as Record<string, unknown>)
      : null;

  let terminalRequiresApproval = false;
  if (composeCampaignDraft) {
    terminalRequiresApproval = body.terminal_requires_approval !== false;
  } else if (crmPushEnabled) {
    terminalRequiresApproval = body.terminal_requires_approval === true;
  }

  return {
    name,
    enrichLead,
    enrichmentAdapterKey,
    enrichmentFocusAreaIds,
    composeCampaignDraft,
    orderedSignalIds,
    subjectTemplate,
    templateName,
    isEnabled,
    outputActionKind: composeCampaignDraft ? outputActionKind : DEFAULT_WORKFLOW_COMPOSE_OUTPUT_ACTION_KIND,
    crmPushEnabled,
    crmProvider,
    crmOperation,
    crmContentOptions,
    crmSyncConfigMode: crmSyncConfig.mode,
    crmSyncConfigOverride: crmSyncConfig.override,
    authoringToneHint,
    signalsStageEnabled,
    terminalRequiresApproval,
    triggerConditionsJsonb
  };
}

export function validateCreateWorkflowInput(
  input: CreateWorkflowInput,
  focusAreaIdsByProvider?: WorkflowBuilderFocusAreaIdsByProvider
): CreateWorkflowValidationError | null {
  if (input.name.length < NAME_MIN || input.name.length > NAME_MAX) {
    return {
      field: "name",
      message: `Workflow name must be between ${NAME_MIN} and ${NAME_MAX} characters.`
    };
  }

  if (input.enrichLead && !input.enrichmentAdapterKey) {
    return {
      field: "enrichment_adapter_key",
      message:
        "Choose an enrichment provider for this workflow, or turn off enrichment until a provider is connected in Integrations."
    };
  }

  const validFocusAreaIds = validEnrichmentFocusAreaIdsForInput(input, focusAreaIdsByProvider);
  if (input.enrichLead && validFocusAreaIds !== null && validFocusAreaIds.length === 0) {
    return {
      field: "enrichment_focus_areas",
      message:
        "Pick at least one enrichment category for this provider, or omit enrichment_focus_areas to rely on provider defaults."
    };
  }

  if (input.composeCampaignDraft) {
    if (!workflowComposeOutputActionIsAvailable(input.outputActionKind)) {
      return {
        field: "output_action_kind",
        message:
          workflowComposeOutputActionUnavailableMessage(input.outputActionKind) ??
          "This output action is not available yet."
      };
    }
    const parsed = parseComposeCampaignDraftParams({
      selectedSignalIds: input.orderedSignalIds,
      subjectTemplate: input.subjectTemplate,
      templateName: input.templateName ?? "Lead Intel"
    });
    if (!parsed.ok) {
      return { field: "selected_signal_ids", message: parsed.error.errorText };
    }
  }

  if (
    input.composeCampaignDraft &&
    !input.terminalRequiresApproval &&
    !composeTerminalSupportsAutomaticDraft(input.outputActionKind)
  ) {
    return {
      field: "terminal_requires_approval",
      message: "This output action requires human approval."
    };
  }

  if (input.crmPushEnabled && input.crmProvider) {
    const resolvedCrmConfig = resolveWorkflowCrmSyncConfig({
      provider: input.crmProvider,
      workflowMode: input.crmSyncConfigMode,
      workflowOverride: input.crmSyncConfigOverride
    });
    const crmConfigValidation = validateResolvedWorkflowCrmSyncConfig(resolvedCrmConfig);
    if (!crmConfigValidation.ok) {
      return {
        field: "crm_record_type",
        message: crmConfigValidation.error
      };
    }
  }

  return null;
}

export function buildWorkflowStepInsertRows(input: {
  enrichLead: boolean;
  enrichParams: Record<string, unknown> | null;
  composeCampaignDraft: boolean;
  composeParams: Record<string, unknown> | null;
  crmPushEnabled?: boolean;
  crmProvider?: WorkflowCrmProviderKey | null;
  crmOperation?: WorkflowCrmOperationId | null;
  crmContentOptions?: WorkflowCrmSyncContentOptions | null;
  crmSyncConfigMode?: WorkflowCrmSyncConfigMode | null;
  crmSyncConfigOverride?: Partial<WorkflowCrmSyncConfig> | null;
  /** Default true when omitted — persisted on CRM params only when false. */
  signalsStageEnabled?: boolean;
  /** Terminal compose/CRM row only — enrich-only workflows pass false. */
  terminalRequiresApproval: boolean;
}): Omit<WorkflowStepInsertRow, "template_id">[] {
  const rows: Omit<WorkflowStepInsertRow, "template_id">[] = [];
  let idx = 0;

  const crmOn = Boolean(input.crmPushEnabled && input.crmProvider);
  const crmProvider = input.crmProvider ?? null;
  const crmOperation = crmProvider
    ? normalizeCrmOperation(input.crmOperation ?? null, crmProvider)
    : defaultCrmOperationForProvider("hubspot");

  const signalsStageEnabled = input.signalsStageEnabled !== false;
  const crmParamsExtras: Record<string, unknown> =
    !signalsStageEnabled && crmOn ? { signalsStageEnabled: false } : {};
  const crmContentOptions = input.crmContentOptions ?? DEFAULT_WORKFLOW_CRM_SYNC_CONTENT_OPTIONS;
  const crmSyncConfig = crmProvider
    ? workflowCrmSyncConfigParams({
        mode: input.crmSyncConfigMode ?? "integration_default",
        override: input.crmSyncConfigOverride ?? null
      })
    : {};

  if (input.enrichLead) {
    rows.push({
      step_index: idx++,
      step_type: ENRICH_LEAD_STEP_TYPE,
      step_key: "enrich",
      params_jsonb: input.enrichParams ?? {},
      requires_approval: false
    });
  }

  if (input.composeCampaignDraft && input.composeParams) {
    rows.push({
      step_index: idx++,
      step_type: COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE,
      step_key: "compose_draft",
      params_jsonb: input.composeParams,
      requires_approval: crmOn ? false : input.terminalRequiresApproval
    });
  }

  if (crmOn && crmProvider === "hubspot") {
    rows.push({
      step_index: idx++,
      step_type: CRM_SYNC_HUBSPOT_STEP_TYPE,
      step_key: "crm_hubspot_sync",
      params_jsonb: { provider: "hubspot", operation: crmOperation, ...crmContentOptions, ...crmSyncConfig, ...crmParamsExtras },
      requires_approval: input.terminalRequiresApproval
    });
  } else if (crmOn && crmProvider === "salesforce") {
    rows.push({
      step_index: idx++,
      step_type: CRM_SYNC_SALESFORCE_STEP_TYPE,
      step_key: "crm_salesforce_sync",
      params_jsonb: { provider: "salesforce", operation: crmOperation, ...crmContentOptions, ...crmSyncConfig, ...crmParamsExtras },
      requires_approval: input.terminalRequiresApproval
    });
  }

  return rows;
}

/** Builds params_jsonb for compose step after validation succeeded. */
export function buildComposeParams(input: CreateWorkflowInput): Record<string, unknown> | null {
  if (!input.composeCampaignDraft) return null;
  const parsed = parseComposeCampaignDraftParams({
    selectedSignalIds: input.orderedSignalIds,
    subjectTemplate: input.subjectTemplate,
    templateName: input.templateName ?? "Lead Intel"
  });
  if (!parsed.ok) return null;
  const params: Record<string, unknown> = {
    selectedSignalIds: parsed.value.selectedSignalIds,
    subjectTemplate: parsed.value.subjectTemplate,
    templateName: parsed.value.templateName,
    outputActionKind: input.outputActionKind
  };
  if (input.authoringToneHint) {
    params.authoringToneHint = input.authoringToneHint;
  }
  if (input.signalsStageEnabled === false) {
    params.signalsStageEnabled = false;
  }
  return params;
}

/** Params persisted on the enrich step row — execution continues to use company-level enrichment resolution. */
export function buildEnrichParams(
  input: CreateWorkflowInput,
  focusAreaIdsByProvider?: WorkflowBuilderFocusAreaIdsByProvider
): Record<string, unknown> | null {
  if (!input.enrichLead) return null;
  if (!input.enrichmentAdapterKey) return null;
  const row: Record<string, unknown> = { enrichmentAdapterKey: input.enrichmentAdapterKey };
  const validFocusAreaIds = validEnrichmentFocusAreaIdsForInput(input, focusAreaIdsByProvider);
  if (validFocusAreaIds !== null && validFocusAreaIds.length > 0) {
    row.focusAreas = [...validFocusAreaIds];
  }
  return row;
}
