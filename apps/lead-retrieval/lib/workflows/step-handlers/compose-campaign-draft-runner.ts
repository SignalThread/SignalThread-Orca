/**
 * Testable, dependency-injected core for the `compose_campaign_draft` step.
 *
 * Split from `./compose-campaign-draft.ts` so unit tests can exercise the handler logic
 * without pulling `@/lib/supabase/admin` (which is `server-only`), `@/lib/campaigns/*`
 * (which transitively imports `openai`), or `next/headers`.
 *
 * Production code wires real adapters in `./compose-campaign-draft.ts`. Tests pass
 * stubs implementing {@link ComposeCampaignDraftAdapters}.
 */

import type {
  WorkflowHandlerContext,
  WorkflowHandlerDraft,
  WorkflowHandlerResult
} from "../contracts/step-handler";
import {
  buildComposeDraftStepOutput,
  composeDraftErrorToResult,
  orderSignalsByIds,
  parseComposeCampaignDraftParams,
  resolveRecipientContextForLead,
  type LeadFactsForDraft,
  type PriorEnrichOutput
} from "./compose-campaign-draft-pure";

// We import only types here — these modules either have no runtime side effects (the
// composer's `SelectedSignalForGeneration` is just a type) or are accessed by the
// adapter wiring (the LLM generator's `DraftGenerationResult`).
import type { SelectedSignalForGeneration } from "@/lib/campaigns/signal-prompt-composer";
import type { DraftGenerationResult } from "@/lib/campaigns/llm-draft-generator";

const ENRICH_LEAD_STEP_KEY_FALLBACKS = ["enrich", "enrich_lead", "enrichLead"] as const;

/** AI-summary signal name matcher — re-implemented as a pure function so this module
 *  has no runtime imports from `@/lib/campaigns/*`. Must agree with
 *  `lib/campaigns/ai-summary-signal.ts::isAiSummarySignalName`.
 */
const AI_SUMMARY_NAMES = new Set(["conversation brief agent", "ai voice summary", "ai summary"]);
function isAiSummaryByName(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  return AI_SUMMARY_NAMES.has(n);
}

export type ComposeDraftSignalRow = {
  id: string;
  name: string;
  category: string;
  default_prompt: string;
  admin_override_prompt: string | null;
  visibility: "global" | "role" | "template" | null;
  signal_scope: string | null;
  company_id: string | null;
  owner_user_id: string | null;
  role_scope: string | null;
  template_scope: string | null;
  tones: string[] | null;
  event_id: string | null;
  is_active: boolean;
};

export type ComposeDraftLeadRow = {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  enriched_job_title: string | null;
  enriched_company_size: string | null;
  enriched_industry: string | null;
  enriched_company_domain: string | null;
  company_text: string | null;
  event_id: string | null;
};

/**
 * Adapters that the handler depends on. Tests inject stubs; production wires real
 * implementations in `./compose-campaign-draft.ts`.
 */
export type ComposeCampaignDraftAdapters = {
  loadLead(leadId: string): Promise<ComposeDraftLeadRow | null>;
  loadEventName(eventId: string | null): Promise<string | null>;
  loadActiveSignals(signalIds: ReadonlyArray<string>): Promise<ComposeDraftSignalRow[]>;
  loadConversationSummaryByLeadId(
    leadIds: ReadonlyArray<string>
  ): Promise<Map<string, string | null>>;
  /** Persisted workflow initiator identity for queued/retried execution. */
  loadInitiatorName?(): Promise<string | null>;
  invokeLlm(input: {
    subjectTemplate: string;
    templateName: string;
    selectedSignals: ReadonlyArray<SelectedSignalForGeneration>;
    recipientContext: ReturnType<typeof resolveRecipientContextForLead>;
    senderName?: string | null;
  }): Promise<DraftGenerationResult>;
  persistCampaignDraft(input: {
    companyId: string;
    leadId: string;
    campaignName: string;
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
    selectedSignalIds: string[];
    subjectLine: string;
  }): Promise<{
    campaignId: string;
    recipientId: string;
    messageId: string;
  }>;
};

export async function runComposeCampaignDraftStep(input: {
  ctx: WorkflowHandlerContext;
  adapters: ComposeCampaignDraftAdapters;
}): Promise<WorkflowHandlerResult> {
  const { ctx, adapters } = input;

  // 1. Parse + validate params.
  const parsed = parseComposeCampaignDraftParams(ctx.step.params_jsonb);
  if (!parsed.ok) {
    return {
      kind: "fail",
      errorText: parsed.error.errorText,
      errorCode: parsed.error.errorCode
    };
  }
  const params = parsed.value;

  const leadId = String(ctx.run.lead_id ?? "").trim();
  if (!leadId) {
    return {
      kind: "fail",
      errorText: "Workflow run has no lead_id; cannot compose draft.",
      errorCode: "compose_draft_missing_lead_id"
    };
  }

  try {
    // 2. Load lead row + (optional) event name.
    const lead = await adapters.loadLead(leadId);
    if (!lead) {
      return {
        kind: "fail",
        errorText: `Lead not found: ${leadId}`,
        errorCode: "compose_draft_validation"
      };
    }
    const eventName = await adapters.loadEventName(lead.event_id);

    // 3. Read prior enrich_lead output if present.
    const priorEnrich = findPriorEnrichOutput(ctx.previousStepOutputs);

    // 4. Load active signals by id, then order by selectedSignalIds.
    const dbSignals =
      params.selectedSignalIds.length > 0
        ? await adapters.loadActiveSignals(params.selectedSignalIds)
        : [];
    const allUsable: SelectedSignalForGeneration[] = dbSignals
      .filter((row) => row.is_active !== false)
      .map(toSelectedSignalForGeneration);

    const { ordered: orderedSignals, missingSignalIds } = orderSignalsByIds(
      params.selectedSignalIds,
      allUsable
    );
    if (params.selectedSignalIds.length > 0 && missingSignalIds.length > 0) {
      return {
        kind: "fail",
        errorText: `Selected Campaign Agents are not available for this workflow event (missing: ${missingSignalIds.join(", ")}).`,
        errorCode: "compose_draft_validation"
      };
    }

    // 5. Conversation context is a contributing input by default. Selecting the
    // Conversation Brief Agent asks us to use it when available; it becomes a
    // hard requirement only when the workflow explicitly declares it so.
    const conversationAgentSelected = orderedSignals.some((signal) => isAiSummaryByName(signal.name));
    const conversationSummaryRequired = params.requiredInputs.includes("conversation_summary");
    const needsConversationSummary = conversationAgentSelected || conversationSummaryRequired;
    let resolvedSummary: string | null = null;
    if (needsConversationSummary) {
      const summaryByLeadId = await adapters.loadConversationSummaryByLeadId([leadId]);
      const summary = summaryByLeadId.get(leadId) ?? null;
      if (!summary && conversationSummaryRequired) {
        return {
          kind: "fail",
          errorText:
            "Conversation summary is required by this workflow. Capture or sync a conversation before approving draft creation.",
          errorCode: "compose_draft_validation"
        };
      }
      resolvedSummary = summary;
    }

    // Do not send a placeholder prompt and do not fabricate a summary. The
    // configured agent remains selected on the workflow; it simply contributes
    // no source for this lead when there is no completed conversation context.
    const finalSignals: SelectedSignalForGeneration[] = orderedSignals
      .filter((signal) => resolvedSummary || !isAiSummaryByName(signal.name))
      .map((signal) => {
        if (!resolvedSummary || !isAiSummaryByName(signal.name)) return signal;
        return { ...signal, defaultPromptText: resolvedSummary };
      });

    // 6. Build recipient context.
    const recipientContext = resolveRecipientContextForLead({
      lead: {
        id: lead.id,
        full_name: lead.full_name,
        email: lead.email,
        job_title: lead.job_title,
        enriched_job_title: lead.enriched_job_title,
        enriched_company_size: lead.enriched_company_size,
        enriched_industry: lead.enriched_industry,
        enriched_company_domain: lead.enriched_company_domain,
        company_text: lead.company_text,
        event_name: eventName,
        company_name: null
      } satisfies LeadFactsForDraft,
      priorEnrich
    });

    // 7. Generate via LLM.
    const senderName = await adapters.loadInitiatorName?.();
    const generated = await adapters.invokeLlm({
      subjectTemplate: params.subjectTemplate,
      templateName: params.templateName,
      selectedSignals: finalSignals,
      recipientContext,
      senderName
    });

    // 8. Persist only for automatic mode. Approval-required workflows store a
    // proposed payload first; approval promotes it into Campaign Builder tables.
    const usedIds = finalSignals.map((s) => s.id ?? "").filter(Boolean);
    const campaignName = buildWorkflowCampaignName({
      runId: ctx.run.id,
      leadName: lead.full_name,
      templateName: params.templateName
    });
    const persistedDraft = ctx.step.requires_approval
      ? null
      : await adapters.persistCampaignDraft({
          companyId: ctx.run.company_id,
          leadId,
          campaignName,
          subject: generated.subject,
          bodyText: generated.body,
          bodyHtml: null,
          selectedSignalIds: usedIds,
          subjectLine: params.subjectTemplate
        });

    const draft: WorkflowHandlerDraft = {
      kind: "email",
      content: {
        subject: generated.subject,
        body_text: generated.body,
        body_html: null,
        workflow_campaign_name: campaignName,
        campaign_id: persistedDraft?.campaignId ?? null,
        campaign_recipient_id: persistedDraft?.recipientId ?? null,
        campaign_message_id: persistedDraft?.messageId ?? null,
        model: generated.model,
        signal_ids_used: usedIds,
        signal_names_used: finalSignals.map((s) => s.name),
        template_name: params.templateName,
        sender_name: senderName ?? "The team",
        subject_template: params.subjectTemplate,
        prompt_preview_truncated:
          generated.promptPreview.length > 4000
            ? generated.promptPreview.slice(0, 4000)
            : generated.promptPreview,
        recipient_context_summary: {
          first_name: recipientContext.firstName,
          full_name: recipientContext.fullName,
          title: recipientContext.title,
          company_text: recipientContext.companyText,
          company_size: recipientContext.companySize,
          industry: recipientContext.industry,
          company_domain: recipientContext.companyDomain,
          event_name: recipientContext.eventName
        }
      }
    };

    const output = buildComposeDraftStepOutput({
      draftId: null,
      subjectPreview: generated.subject,
      bodyPreview: generated.body,
      model: generated.model,
      signalIdsUsed: usedIds,
      signalIdsMissing: missingSignalIds,
      campaignId: persistedDraft?.campaignId ?? null,
      campaignRecipientId: persistedDraft?.recipientId ?? null,
      campaignMessageId: persistedDraft?.messageId ?? null
    });

    return {
      kind: "draft",
      output,
      drafts: [draft]
    };
  } catch (error) {
    return composeDraftErrorToResult(error, ctx.stepRun.attempt_count);
  }
}

function buildWorkflowCampaignName(input: {
  runId: string;
  leadName: string | null | undefined;
  templateName: string;
}) {
  const leadName = String(input.leadName ?? "").trim() || "Lead";
  const templateName = String(input.templateName ?? "").trim() || "Workflow";
  return `Workflow Draft - ${templateName} - ${leadName} - ${input.runId}`;
}

function findPriorEnrichOutput(
  previous: Record<string, Record<string, unknown> | null>
): PriorEnrichOutput | null {
  for (const key of ENRICH_LEAD_STEP_KEY_FALLBACKS) {
    const candidate = previous[key];
    if (candidate && typeof candidate === "object" && "lead_summary" in candidate) {
      return candidate as PriorEnrichOutput;
    }
  }
  for (const value of Object.values(previous)) {
    if (value && typeof value === "object" && "lead_summary" in value) {
      return value as PriorEnrichOutput;
    }
  }
  return null;
}

function toSelectedSignalForGeneration(row: ComposeDraftSignalRow): SelectedSignalForGeneration {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    defaultPromptText: row.admin_override_prompt?.trim() || row.default_prompt?.trim() || "",
    tone: row.tones ?? [],
    visibility: row.visibility ?? null,
    roleScope: row.role_scope ?? null,
    templateScope: row.template_scope ?? null
  };
}
