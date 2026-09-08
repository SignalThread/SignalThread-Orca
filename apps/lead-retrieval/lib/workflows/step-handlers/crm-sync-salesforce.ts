/**
 * `crm_sync_salesforce` workflow step — pushes the captured lead into Salesforce as a Lead
 * using the existing integration helper (respects integration_sync_configs), then optionally
 * appends AI follow-up notes as a Salesforce Task on that Lead.
 */

import type {
  WorkflowHandler,
  WorkflowHandlerContext,
  WorkflowHandlerResult
} from "../contracts/step-handler";
import {
  createSalesforceLeadTask,
  syncLeadToSalesforce
} from "@/lib/integrations/salesforce/syncLeadToSalesforce";
import {
  getSalesforceIntegration,
  SalesforceIntegrationError
} from "@/lib/integrations/salesforce/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRM_SYNC_SALESFORCE_STEP_TYPE } from "./crm-sync-types";
import {
  normalizeCrmSyncMatchBehavior,
  normalizeCrmSyncRecordType,
  parseWorkflowCrmSyncConfigOverride,
  resolveWorkflowCrmSyncConfig,
  validateResolvedWorkflowCrmSyncConfig
} from "./crm-sync-effective-config";
import { loadLatestScopedConversationInsights } from "./crm-sync-conversation-insights";
import { loadConversationReadinessState } from "@/lib/conversations/conversation-readiness";
import { runCrmSyncSalesforceStep } from "./crm-sync-salesforce-runner";
import type { CrmLeadProfileSnapshot } from "./crm-sync-ai-notes";

export { CRM_SYNC_SALESFORCE_STEP_TYPE } from "./crm-sync-types";

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

async function loadScopedLeadProfile(
  supabase: ReturnType<typeof createAdminClient>,
  input: { accountId: string; leadId: string }
): Promise<CrmLeadProfileSnapshot | null> {
  const { data, error } = await (supabase as any)
    .from("leads")
    .select("full_name, email, company_text, job_title, rating, temperature, status")
    .eq("company_id", input.accountId)
    .eq("id", input.leadId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load lead profile.");
  }
  if (!data) return null;

  return {
    fullName: normalizeText(data.full_name),
    email: normalizeText(data.email),
    companyText: normalizeText(data.company_text),
    jobTitle: normalizeText(data.job_title),
    rating: Number.isFinite(Number(data.rating)) ? Number(data.rating) : null,
    temperature: normalizeText(data.temperature),
    status: normalizeText(data.status)
  };
}

async function loadSalesforceWorkflowSyncDefaults(supabase: any, accountId: string) {
  const { data, error } = await supabase
    .from("integration_sync_configs")
    .select("sync_target_object, sync_behavior, campaign_name")
    .eq("account_id", accountId)
    .eq("provider", "salesforce")
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load Salesforce sync settings.");
  }

  return {
    recordType: normalizeCrmSyncRecordType(data?.sync_target_object) ?? undefined,
    matchBehavior: normalizeCrmSyncMatchBehavior(data?.sync_behavior) ?? undefined,
    sourceLabel: normalizeText(data?.campaign_name)
  };
}

export const crmSyncSalesforceStepHandler: WorkflowHandler = {
  stepType: CRM_SYNC_SALESFORCE_STEP_TYPE,
  displayName: "Salesforce · sync lead",
  defaultTimeoutMs: 25_000,
  async run(ctx: WorkflowHandlerContext): Promise<WorkflowHandlerResult> {
    const supabase = createAdminClient();
    const accountId = String(ctx.run.company_id ?? "").trim();
    if (!accountId) {
      return {
        kind: "fail",
        errorCode: "crm_salesforce_missing_scope",
        errorText: "Missing lead or company scope."
      };
    }
    if (accountId) {
      try {
        await getSalesforceIntegration(accountId);
      } catch (error) {
        if (error instanceof SalesforceIntegrationError && error.code === "MISSING_INTEGRATION") {
          return {
            kind: "fail",
            errorCode: "crm_salesforce_not_connected",
            errorText: "Salesforce is not connected for this account."
          };
        }
        if (error instanceof SalesforceIntegrationError && error.code === "RECONNECT_REQUIRED") {
          return {
            kind: "fail",
            errorCode: "crm_salesforce_not_connected",
            errorText: error.message
          };
        }
        if (error instanceof SalesforceIntegrationError && error.code === "TOKEN_REFRESH_FAILED") {
          return {
            kind: "fail",
            errorCode: "crm_salesforce_sync_failed",
            errorText: error.message
          };
        }
        throw error;
      }
    }

    const parsedSyncConfig = parseWorkflowCrmSyncConfigOverride(ctx.step.params_jsonb, "salesforce");
    const effectiveSyncConfig = resolveWorkflowCrmSyncConfig({
      provider: "salesforce",
      workflowMode: parsedSyncConfig.mode,
      workflowOverride: parsedSyncConfig.override,
      integrationDefault: await loadSalesforceWorkflowSyncDefaults(supabase as any, accountId)
    });
    const syncConfigValidation = validateResolvedWorkflowCrmSyncConfig(effectiveSyncConfig);
    if (!syncConfigValidation.ok) {
      return {
        kind: "fail",
        errorCode: "crm_salesforce_invalid_sync_config",
        errorText: syncConfigValidation.error
      };
    }

    return runCrmSyncSalesforceStep({
      ctx,
      effectiveSyncConfig,
      adapters: {
        syncLead: syncLeadToSalesforce,
        async loadLatestConversationInsights({ accountId, leadId }) {
          return loadLatestScopedConversationInsights(supabase as any, { accountId, leadId });
        },
        async loadLeadProfile({ accountId, leadId }) {
          return loadScopedLeadProfile(supabase, { accountId, leadId });
        },
        async loadConversationReadiness({ accountId, leadId }) {
          await loadScopedLeadProfile(supabase, { accountId, leadId });
          return loadConversationReadinessState(supabase, leadId);
        },
        async loadLatestFollowUpDraft({ accountId, leadId, runId }) {
          const { data, error } = await (supabase as any)
            .from("generated_drafts")
            .select("content_jsonb")
            .eq("company_id", accountId)
            .eq("lead_id", leadId)
            .eq("run_id", runId)
            .eq("kind", "email")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            throw new Error(error.message ?? "Failed to load follow-up draft.");
          }

          const content =
            data && typeof (data as { content_jsonb?: unknown }).content_jsonb === "object"
              ? ((data as { content_jsonb?: Record<string, unknown> }).content_jsonb ?? {})
              : {};

          return {
            subject: normalizeText(content.subject),
            bodyText: normalizeText(content.body_text)
          };
        },
        async createLeadTask({ accountId, salesforceLeadId, noteBody }) {
          return createSalesforceLeadTask({ accountId, salesforceLeadId, noteBody });
        }
      }
    });
  }
};
