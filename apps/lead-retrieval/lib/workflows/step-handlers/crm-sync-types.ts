/**
 * Workflow CRM sync steps — shared constants + param helpers (no server-only imports).
 *
 * Handlers call existing {@link syncLeadToHubSpot} / {@link syncLeadToSalesforce} integrations.
 */

export const CRM_SYNC_HUBSPOT_STEP_TYPE = "crm_sync_hubspot";
export const CRM_SYNC_SALESFORCE_STEP_TYPE = "crm_sync_salesforce";

export type WorkflowCrmProviderKey = "hubspot" | "salesforce";

/** Operations backed by current integration helpers (extend as APIs grow). */
export type WorkflowCrmOperationId = "hubspot_upsert_contact" | "salesforce_upsert_lead";

export type WorkflowCrmSyncContentOptions = {
  includeLeadDetails: boolean;
  includeAiNotes: boolean;
  includeCampaignContextInCrmNote: boolean;
  includeRecommendedFollowUpInCrmNote: boolean;
  includeSuggestedEmailDraftInCrmNote: boolean;
  suggestedEmailInstructions: string | null;
};

export const DEFAULT_WORKFLOW_CRM_SYNC_CONTENT_OPTIONS: WorkflowCrmSyncContentOptions = {
  includeLeadDetails: true,
  includeAiNotes: false,
  includeCampaignContextInCrmNote: false,
  includeRecommendedFollowUpInCrmNote: false,
  includeSuggestedEmailDraftInCrmNote: false,
  suggestedEmailInstructions: null
};

export type SalesforceWorkflowSyncNoteOptions = WorkflowCrmSyncContentOptions;

export function isWorkflowCrmProviderKey(v: string): v is WorkflowCrmProviderKey {
  const s = v.trim().toLowerCase();
  return s === "hubspot" || s === "salesforce";
}

export function defaultCrmOperationForProvider(provider: WorkflowCrmProviderKey): WorkflowCrmOperationId {
  return provider === "hubspot" ? "hubspot_upsert_contact" : "salesforce_upsert_lead";
}

export function normalizeCrmOperation(raw: unknown, provider: WorkflowCrmProviderKey): WorkflowCrmOperationId {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (provider === "hubspot" && s === "hubspot_upsert_contact") return "hubspot_upsert_contact";
  if (provider === "salesforce" && s === "salesforce_upsert_lead") return "salesforce_upsert_lead";
  return defaultCrmOperationForProvider(provider);
}

export function inferCrmProviderFromOperation(raw: unknown): WorkflowCrmProviderKey | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "hubspot_upsert_contact") return "hubspot";
  if (s === "salesforce_upsert_lead") return "salesforce";
  return null;
}

export function parseWorkflowCrmSyncContentOptions(
  raw: Record<string, unknown> | null | undefined
): WorkflowCrmSyncContentOptions {
  const legacyAiNotes =
    raw?.includeAiSummary === true ||
    raw?.include_ai_summary === true ||
    raw?.includeObjections === true ||
    raw?.include_objections === true ||
    raw?.includeNextSteps === true ||
    raw?.include_next_steps === true ||
    raw?.includeFollowUpEmailDraft === true ||
    raw?.include_follow_up_email_draft === true;
  const includeAiNotes = raw?.includeAiNotes === true || raw?.include_ai_notes === true || legacyAiNotes;
  const explicitlyDisabledRecommended =
    raw?.includeRecommendedFollowUpInCrmNote === false ||
    raw?.include_recommended_follow_up_in_crm_note === false;
  const explicitlyDisabledSuggested =
    raw?.includeSuggestedEmailDraftInCrmNote === false ||
    raw?.include_suggested_email_draft_in_crm_note === false;
  const legacySuggestedDraft =
    raw?.includeFollowUpEmailDraft === true ||
    raw?.include_follow_up_email_draft === true;
  const suggestedEmailInstructions =
    typeof raw?.suggestedEmailInstructions === "string"
      ? raw.suggestedEmailInstructions.trim()
      : typeof raw?.suggested_email_instructions === "string"
        ? raw.suggested_email_instructions.trim()
        : "";

  return {
    includeLeadDetails: raw?.includeLeadDetails === false ? false : raw?.include_lead_details === false ? false : true,
    includeAiNotes,
    includeCampaignContextInCrmNote:
      raw?.includeCampaignContextInCrmNote === true ||
      raw?.include_campaign_context_in_crm_note === true,
    includeRecommendedFollowUpInCrmNote:
      raw?.includeRecommendedFollowUpInCrmNote === true ||
      raw?.include_recommended_follow_up_in_crm_note === true ||
      (includeAiNotes && !explicitlyDisabledRecommended),
    includeSuggestedEmailDraftInCrmNote:
      raw?.includeSuggestedEmailDraftInCrmNote === true ||
      raw?.include_suggested_email_draft_in_crm_note === true ||
      legacySuggestedDraft ||
      (includeAiNotes && !explicitlyDisabledSuggested),
    suggestedEmailInstructions: suggestedEmailInstructions || null
  };
}

export function parseSalesforceWorkflowSyncNoteOptions(
  raw: Record<string, unknown> | null | undefined
): SalesforceWorkflowSyncNoteOptions {
  return parseWorkflowCrmSyncContentOptions(raw);
}

export function hasWorkflowCrmNotesEnabled(input: WorkflowCrmSyncContentOptions): boolean {
  return (
    input.includeAiNotes ||
    input.includeCampaignContextInCrmNote ||
    input.includeRecommendedFollowUpInCrmNote ||
    input.includeSuggestedEmailDraftInCrmNote
  );
}

export function hasSalesforceWorkflowSyncNotesEnabled(input: SalesforceWorkflowSyncNoteOptions): boolean {
  return hasWorkflowCrmNotesEnabled(input);
}
