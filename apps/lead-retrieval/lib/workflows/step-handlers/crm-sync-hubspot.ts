/**
 * `crm_sync_hubspot` workflow step — pushes the captured lead into HubSpot using the
 * existing integration helper (create/update contact by email).
 */

import type {
  WorkflowHandler,
  WorkflowHandlerContext,
  WorkflowHandlerResult
} from "../contracts/step-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getHubSpotIntegration,
  HubSpotIntegrationError
} from "@/lib/integrations/hubspot/client";
import {
  createHubSpotContactNote,
  syncLeadToHubSpot
} from "@/lib/integrations/hubspot/syncLeadToHubSpot";
import { CRM_SYNC_HUBSPOT_STEP_TYPE } from "./crm-sync-types";
import {
  parseWorkflowCrmSyncConfigOverride,
  resolveWorkflowCrmSyncConfig,
  validateResolvedWorkflowCrmSyncConfig
} from "./crm-sync-effective-config";
import { loadLatestScopedConversationInsights } from "./crm-sync-conversation-insights";
import { loadConversationReadinessState } from "@/lib/conversations/conversation-readiness";
import { runCrmSyncHubspotStep } from "./crm-sync-hubspot-runner";
import type { CrmLeadProfileSnapshot } from "./crm-sync-ai-notes";

export { CRM_SYNC_HUBSPOT_STEP_TYPE } from "./crm-sync-types";

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

export const crmSyncHubspotStepHandler: WorkflowHandler = {
  stepType: CRM_SYNC_HUBSPOT_STEP_TYPE,
  displayName: "HubSpot · sync contact",
  defaultTimeoutMs: 25_000,
  async run(ctx: WorkflowHandlerContext): Promise<WorkflowHandlerResult> {
    const accountId = String(ctx.run.company_id ?? "").trim();
    if (!accountId) {
      return { kind: "fail", errorCode: "crm_hubspot_missing_scope", errorText: "Missing lead or company scope." };
    }

    const supabase = createAdminClient();

    try {
      await getHubSpotIntegration(accountId);
    } catch (error) {
      if (error instanceof HubSpotIntegrationError && error.code === "MISSING_INTEGRATION") {
        return {
          kind: "fail",
          errorCode: "crm_hubspot_not_connected",
          errorText: "HubSpot is not connected for this account."
        };
      }
      throw error;
    }

    const parsedSyncConfig = parseWorkflowCrmSyncConfigOverride(ctx.step.params_jsonb, "hubspot");
    const effectiveSyncConfig = resolveWorkflowCrmSyncConfig({
      provider: "hubspot",
      workflowMode: parsedSyncConfig.mode,
      workflowOverride: parsedSyncConfig.override
    });
    const syncConfigValidation = validateResolvedWorkflowCrmSyncConfig(effectiveSyncConfig);
    if (!syncConfigValidation.ok) {
      return {
        kind: "fail",
        errorCode: "crm_hubspot_invalid_sync_config",
        errorText: syncConfigValidation.error
      };
    }

    return runCrmSyncHubspotStep({
      ctx,
      effectiveSyncConfig,
      adapters: {
        async syncLead({ leadId, syncConfig }) {
          return syncLeadToHubSpot(leadId, { syncConfig });
        },
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
        async createContactNote({ accountId, contactId, noteBody }) {
          return createHubSpotContactNote({ accountId, contactId, noteBody });
        }
      }
    });
  }
};
