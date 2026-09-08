import type { WorkflowHandlerContext, WorkflowHandlerResult } from "../contracts/step-handler";
import type { SalesforceTestSyncResult } from "@/lib/integrations/salesforce/syncLeadToSalesforce";
import {
  hasWorkflowCrmNotesEnabled,
  normalizeCrmOperation,
  parseWorkflowCrmSyncContentOptions,
  type WorkflowCrmOperationId
} from "./crm-sync-types";
import type { WorkflowCrmResolvedSyncConfig } from "./crm-sync-effective-config";
import {
  evaluateWorkflowDataReadiness,
  type ConversationReadinessState,
  type WorkflowDataRequirements
} from "@/lib/conversations/conversation-readiness";
import {
  buildCrmAiNotesBody,
  type CrmConversationInsightSnapshot,
  type CrmFollowUpDraftSnapshot,
  type CrmLeadProfileSnapshot
} from "./crm-sync-ai-notes";

type SalesforceTaskCreateResult = {
  success: boolean;
  taskId?: string;
  error?: string;
  status?: number;
};

export type CrmSyncSalesforceAdapters = {
  syncLead: (input: {
    accountId: string;
    leadId: string;
    syncConfig: WorkflowCrmResolvedSyncConfig;
  }) => Promise<SalesforceTestSyncResult>;
  loadLatestConversationInsights: (input: {
    accountId: string;
    leadId: string;
  }) => Promise<CrmConversationInsightSnapshot | null>;
  loadLeadProfile: (input: {
    accountId: string;
    leadId: string;
  }) => Promise<CrmLeadProfileSnapshot | null>;
  loadConversationReadiness: (input: {
    accountId: string;
    leadId: string;
  }) => Promise<ConversationReadinessState>;
  loadLatestFollowUpDraft: (input: {
    accountId: string;
    leadId: string;
    runId: string;
  }) => Promise<CrmFollowUpDraftSnapshot | null>;
  createLeadTask: (input: {
    accountId: string;
    salesforceLeadId: string;
    noteBody: string;
  }) => Promise<SalesforceTaskCreateResult>;
};

function cleanText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseOperation(ctx: WorkflowHandlerContext): WorkflowCrmOperationId {
  const raw = ctx.step.params_jsonb?.["operation"];
  return normalizeCrmOperation(raw, "salesforce");
}

function crmNoteDataRequirements(noteOptions: ReturnType<typeof parseWorkflowCrmSyncContentOptions>): WorkflowDataRequirements {
  const includeRawTranscript =
    (noteOptions as unknown as Record<string, unknown>).includeRawTranscriptInCrmNote === true;
  return {
    requiresAudioTranscript: includeRawTranscript,
    requiresConversationInsights:
      noteOptions.includeAiNotes ||
      noteOptions.includeRecommendedFollowUpInCrmNote ||
      noteOptions.includeSuggestedEmailDraftInCrmNote
  };
}

export async function runCrmSyncSalesforceStep(input: {
  ctx: WorkflowHandlerContext;
  adapters: CrmSyncSalesforceAdapters;
  effectiveSyncConfig: WorkflowCrmResolvedSyncConfig;
}): Promise<WorkflowHandlerResult> {
  const { ctx, adapters, effectiveSyncConfig } = input;
  const op = parseOperation(ctx);
  if (op !== "salesforce_upsert_lead") {
    return {
      kind: "fail",
      errorCode: "crm_salesforce_unsupported_operation",
      errorText: `Unsupported Salesforce workflow operation "${op}".`
    };
  }

  const leadId = String(ctx.run.lead_id ?? "").trim();
  const accountId = String(ctx.run.company_id ?? "").trim();
  if (!leadId || !accountId) {
    return {
      kind: "fail",
      errorCode: "crm_salesforce_missing_scope",
      errorText: "Missing lead or company scope."
    };
  }

  const noteOptions = parseWorkflowCrmSyncContentOptions(ctx.step.params_jsonb);
  const noteDataRequirements = crmNoteDataRequirements(noteOptions);
  let conversationData:
    | { transcriptVersion: number | null; insightsVersion: number | null; generatedAt: string }
    | null = null;
  if (
    hasWorkflowCrmNotesEnabled(noteOptions) &&
    (noteDataRequirements.requiresAudioTranscript || noteDataRequirements.requiresConversationInsights)
  ) {
    const readiness = await adapters.loadConversationReadiness({ accountId, leadId });
    const readinessDecision = evaluateWorkflowDataReadiness({
      state: readiness,
      requirements: noteDataRequirements
    });
    if (!readinessDecision.ready) {
      return {
        kind: "wait",
        waitingReason: readinessDecision.waitingReason,
        errorText: readinessDecision.errorText,
        waitExpiresAt: readinessDecision.waitExpiresAt,
        output: {
          operation: op,
          provider: "salesforce",
          workflowDataRequirements: noteDataRequirements,
          required_conversation_version: readinessDecision.requiredConversationVersion,
          current_transcript_version: readinessDecision.currentTranscriptVersion,
          current_insights_version: readinessDecision.currentInsightsVersion,
          waiting_reason: readinessDecision.waitingReason
        }
      };
    }
    conversationData = {
      transcriptVersion: readinessDecision.currentTranscriptVersion,
      insightsVersion: readinessDecision.currentInsightsVersion,
      generatedAt: new Date().toISOString()
    };
  }

  const syncResult = await adapters.syncLead({ accountId, leadId, syncConfig: effectiveSyncConfig });
  if (!syncResult.success) {
    const msg = String(syncResult.error ?? "").trim() || "Salesforce sync failed.";
    const lower = msg.toLowerCase();
    if (
      lower.includes("email is required") ||
      lower.includes("lead email is required") ||
      lower.includes("lead not found")
    ) {
      return {
        kind: "skipped",
        reason: msg,
        output: { operation: op }
      };
    }

    return {
      kind: "fail",
      errorCode: "crm_salesforce_sync_failed",
      errorText: msg
    };
  }

  const baseOutput: Record<string, unknown> = {
    operation: op,
    crmSyncConfig: {
      recordType: effectiveSyncConfig.recordType,
      matchBehavior: effectiveSyncConfig.matchBehavior,
      sourceLabel: effectiveSyncConfig.sourceLabel
    },
    salesforceLeadId: syncResult.salesforceLeadId ?? null,
    action: syncResult.action ?? null
  };

  if (!hasWorkflowCrmNotesEnabled(noteOptions)) {
    return { kind: "ok", output: baseOutput };
  }

  const salesforceLeadId = cleanText(syncResult.salesforceLeadId);
  if (!salesforceLeadId) {
    return {
      kind: "fail",
      errorCode: "crm_salesforce_missing_lead_id",
      errorText: "Salesforce lead synced but did not return a Lead ID.",
      output: {
        ...baseOutput,
        partial_success: true,
        notes_requested: true
      }
    };
  }

  const shouldLoadConversation =
    noteOptions.includeAiNotes ||
    noteOptions.includeRecommendedFollowUpInCrmNote ||
    noteOptions.includeSuggestedEmailDraftInCrmNote;
  const [lead, conversation, followUpDraft] = await Promise.all([
    adapters.loadLeadProfile({ accountId, leadId }),
    shouldLoadConversation
      ? adapters.loadLatestConversationInsights({ accountId, leadId })
      : Promise.resolve(null),
    noteOptions.includeSuggestedEmailDraftInCrmNote
      ? adapters.loadLatestFollowUpDraft({
          accountId,
          leadId,
          runId: String(ctx.run.id ?? "").trim()
        })
      : Promise.resolve(null)
  ]);

  const noteBody = buildCrmAiNotesBody({
    contentOptions: noteOptions,
    syncConfig: effectiveSyncConfig,
    lead,
    conversation,
    followUpDraft,
    conversationData
  });
  const noteResult = await adapters.createLeadTask({
    accountId,
    salesforceLeadId,
    noteBody
  });

  if (!noteResult.success) {
    const message = cleanText(noteResult.error) ?? "Salesforce note creation failed.";
    return {
      kind: "fail",
      errorCode: "crm_salesforce_note_failed",
      errorText: `Salesforce Lead synced, but follow-up note creation failed: ${message}`,
      output: {
        ...baseOutput,
        partial_success: true,
        notes_requested: true,
        note_error: message
      }
    };
  }

  return {
    kind: "ok",
    output: {
      ...baseOutput,
      notes_requested: true,
      crmNoteSections: {
        campaignContext: noteOptions.includeCampaignContextInCrmNote,
        aiConversationInsights: noteOptions.includeAiNotes,
        recommendedFollowUp: noteOptions.includeRecommendedFollowUpInCrmNote,
        suggestedEmailDraft: noteOptions.includeSuggestedEmailDraftInCrmNote
      },
      crmConversationData: conversationData,
      salesforceTaskId: noteResult.taskId ?? null
    }
  };
}
