/**
 * Step handler registry.
 *
 * Registered handlers:
 *   - `enrich_lead` — enrichment pipeline wrapper.
 *   - `compose_campaign_draft` — `generated_drafts` row + pause at `awaiting_approval` (no auto-send).
 *   - `crm_sync_hubspot` — HubSpot contact upsert via OAuth integration.
 *   - `crm_sync_salesforce` — Salesforce Lead upsert via OAuth + sync settings.
 *
 * Future: outbound_webhook, CRM tasks/notes, post-approval sends.
 *
 * Unregistered step types fail with `error_code='unknown_step_type'`.
 */

import type { WorkflowHandler, WorkflowHandlerRegistry } from "../contracts/step-handler";
import { enrichLeadStepHandler } from "./enrich-lead";
import { composeCampaignDraftStepHandler } from "./compose-campaign-draft";
import { crmSyncHubspotStepHandler } from "./crm-sync-hubspot";
import { crmSyncSalesforceStepHandler } from "./crm-sync-salesforce";

export const WORKFLOW_HANDLER_REGISTRY: WorkflowHandlerRegistry = new Map<string, WorkflowHandler>([
  [enrichLeadStepHandler.stepType, enrichLeadStepHandler],
  [composeCampaignDraftStepHandler.stepType, composeCampaignDraftStepHandler],
  [crmSyncHubspotStepHandler.stepType, crmSyncHubspotStepHandler],
  [crmSyncSalesforceStepHandler.stepType, crmSyncSalesforceStepHandler]
]);

export {
  enrichLeadStepHandler,
  composeCampaignDraftStepHandler,
  crmSyncHubspotStepHandler,
  crmSyncSalesforceStepHandler
};
export { buildWorkflowHandlerRegistry } from "../contracts/step-handler";
