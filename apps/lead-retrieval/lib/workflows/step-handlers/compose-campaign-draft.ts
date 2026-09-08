/**
 * `compose_campaign_draft` workflow step — production handler.
 *
 * Wraps the existing campaign draft pipeline:
 *   - `lib/campaigns/signal-prompt-composer.ts`
 *   - `lib/campaigns/llm-draft-generator.ts::generateLeadDraftWithLLM`
 *   - `lib/campaigns/lead-conversation-summaries.ts` (when Conversation Brief Agent selected)
 *   - `lib/campaigns/ai-summary-signal.ts`
 *
 * Produces a real Campaign Builder draft (`campaigns` + `campaign_recipients` +
 * `campaign_messages`) plus workflow run metadata. NEVER calls any send pipeline.
 *
 * The handler is intentionally thin: all step logic lives in `./compose-campaign-draft-runner.ts`
 * (testable, no `server-only` chain) and `./compose-campaign-draft-pure.ts` (pure helpers).
 * This file only wires real adapters that touch supabase / OpenAI.
 */

import type {
  WorkflowHandler,
  WorkflowHandlerContext,
  WorkflowHandlerResult
} from "../contracts/step-handler";
import {
  runComposeCampaignDraftStep,
  type ComposeCampaignDraftAdapters,
  type ComposeDraftLeadRow,
  type ComposeDraftSignalRow
} from "./compose-campaign-draft-runner";
import { COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE } from "./compose-campaign-draft-pure";
import {
  combineConversationSummaries,
  isAiSummarySignalName
} from "@/lib/campaigns/ai-summary-signal";
import { loadLatestCompletedConversationSummaryByLeadId } from "@/lib/campaigns/lead-conversation-summaries";
import { generateLeadDraftWithLLM } from "@/lib/campaigns/llm-draft-generator";
import { persistWorkflowCampaignDraft } from "@/lib/campaigns/workflow-campaign-draft-persistence";
import { filterWorkflowSelectableSignalRowsForEvent } from "@/lib/signals/workflow-selectable-signal-rows";
import { createAdminClient } from "@/lib/supabase/admin";

export { COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE } from "./compose-campaign-draft-pure";
export type { ComposeCampaignDraftAdapters } from "./compose-campaign-draft-runner";

function buildProductionAdapters(ctx: WorkflowHandlerContext): ComposeCampaignDraftAdapters {
  const supabase = createAdminClient();

  return {
    async loadLead(leadId) {
      const { data, error } = (await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: unknown) => {
              maybeSingle: () => Promise<{
                data: ComposeDraftLeadRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from("leads")
        .select(
          "id, full_name, email, job_title, enriched_job_title, enriched_company_size, enriched_industry, enriched_company_domain, company_text, event_id"
        )
        .eq("id", leadId)
        .maybeSingle());
      if (error) throw new Error(`Failed to load lead: ${error.message}`);
      return data;
    },

    async loadEventName(eventId) {
      if (!eventId) return null;
      const { data, error } = (await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: unknown) => {
              maybeSingle: () => Promise<{
                data: { name: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from("events")
        .select("name")
        .eq("id", eventId)
        .maybeSingle());
      if (error) throw new Error(`Failed to load event name: ${error.message}`);
      return data?.name ?? null;
    },

    async loadActiveSignals(signalIds) {
      if (signalIds.length === 0) return [];
      const eventId = String(ctx.run.event_id ?? "").trim();
      const companyId = String(ctx.run.company_id ?? "").trim();
      if (!eventId || !companyId) return [];
      const { data, error } = (await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: unknown) => {
              in: (col: string, vals: unknown[]) => Promise<{
                data: ComposeDraftSignalRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from("signals")
        .select(
          "id, name, category, default_prompt, admin_override_prompt, visibility, signal_scope, company_id, owner_user_id, role_scope, template_scope, tones, event_id, is_active"
        )
        .eq("is_active", true)
        .in("id", [...signalIds]));
      if (error) throw new Error(`Failed to load signals: ${error.message}`);
      return filterWorkflowSelectableSignalRowsForEvent(data ?? [], {
        companyId,
        eventId
      });
    },

    async loadConversationSummaryByLeadId(leadIds) {
      const { summaryByLeadId, error } = await loadLatestCompletedConversationSummaryByLeadId(
        supabase as unknown as Parameters<typeof loadLatestCompletedConversationSummaryByLeadId>[0],
        [...leadIds]
      );
      if (error) throw new Error(`Failed to load conversation summaries: ${error.message}`);
      // Production combines if multiple summaries exist; here we have one lead id.
      const result = new Map<string, string | null>();
      for (const [leadId, summary] of summaryByLeadId.entries()) {
        result.set(leadId, summary ? combineConversationSummaries([summary]) : null);
      }
      // Fallback: ensure entry exists for each requested id (null if missing).
      for (const leadId of leadIds) {
        if (!result.has(leadId)) result.set(leadId, null);
      }
      // Keep parity with existing AI-Summary signal name detection upstream — no-op here.
      void isAiSummarySignalName;
      return result;
    },

    async loadInitiatorName() {
      const { data, error } = await (supabase as any)
        .from("workflow_templates")
        .select("created_by, users!workflow_templates_created_by_fkey(full_name)")
        .eq("id", ctx.run.template_id)
        .eq("company_id", ctx.run.company_id)
        .maybeSingle();
      if (error) throw new Error(`Failed to load workflow initiator: ${error.message}`);
      const user = data?.users as { full_name?: string | null } | null;
      return String(user?.full_name ?? "").trim() || null;
    },

    async invokeLlm({ subjectTemplate, templateName, selectedSignals, recipientContext }) {
      return generateLeadDraftWithLLM({
        subjectTemplate,
        templateName,
        selectedSignals: [...selectedSignals],
        recipientContext
      });
    },

    async persistCampaignDraft(input) {
      return persistWorkflowCampaignDraft({
        supabase,
        companyId: input.companyId,
        leadId: input.leadId,
        campaignName: input.campaignName,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml,
        selectedSignalIds: input.selectedSignalIds,
        subjectLine: input.subjectLine
      });
    }
  };
}

export const composeCampaignDraftStepHandler: WorkflowHandler = {
  stepType: COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE,
  displayName: "Compose campaign draft (review-required)",
  defaultTimeoutMs: 60_000,
  async run(ctx: WorkflowHandlerContext): Promise<WorkflowHandlerResult> {
    const adapters = buildProductionAdapters(ctx);
    return runComposeCampaignDraftStep({ ctx, adapters });
  }
};
