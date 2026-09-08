import type { WorkflowHandlerContext, WorkflowHandlerResult } from "../contracts/step-handler";
import type { HubSpotLeadSyncResult } from "@/lib/integrations/hubspot/syncLeadToHubSpot";
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

type HubSpotContactNoteResult = {
  success: boolean;
  noteId?: string;
  error?: string;
  status?: number;
};

export type CrmSyncHubspotAdapters = {
  syncLead: (input: { leadId: string; syncConfig: WorkflowCrmResolvedSyncConfig }) => Promise<HubSpotLeadSyncResult>;
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
  createContactNote: (input: {
    accountId: string;
    contactId: string;
    noteBody: string;
  }) => Promise<HubSpotContactNoteResult>;
};

function cleanText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseOperation(ctx: WorkflowHandlerContext): WorkflowCrmOperationId {
  const raw = ctx.step.params_jsonb?.["operation"];
  return normalizeCrmOperation(raw, "hubspot");
}

function crmNoteDataRequirements(noteOptions: ReturnType<typeof parseWorkflowCrmSyncContentOptions>): WorkflowDataRequirements {
  const includeRawTranscript = ctxBool(noteOptions as unknown as Record<string, unknown>, "includeRawTranscriptInCrmNote");
  return {
    requiresAudioTranscript: includeRawTranscript,
    requiresConversationInsights:
      noteOptions.includeAiNotes ||
      noteOptions.includeRecommendedFollowUpInCrmNote ||
      noteOptions.includeSuggestedEmailDraftInCrmNote
  };
}

function ctxBool(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

export async function runCrmSyncHubspotStep(input: {
  ctx: WorkflowHandlerContext;
  adapters: CrmSyncHubspotAdapters;
  effectiveSyncConfig: WorkflowCrmResolvedSyncConfig;
}): Promise<WorkflowHandlerResult> {
  const { ctx, adapters, effectiveSyncConfig } = input;
  const op = parseOperation(ctx);
  if (op !== "hubspot_upsert_contact") {
    return {
      kind: "fail",
      errorCode: "crm_hubspot_unsupported_operation",
      errorText: `Unsupported HubSpot workflow operation "${op}".`
    };
  }

  const leadId = String(ctx.run.lead_id ?? "").trim();
  const accountId = String(ctx.run.company_id ?? "").trim();
  if (!leadId || !accountId) {
    return { kind: "fail", errorCode: "crm_hubspot_missing_scope", errorText: "Missing lead or company scope." };
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
          provider: "hubspot",
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

  const syncResult = await adapters.syncLead({ leadId, syncConfig: effectiveSyncConfig });
  if (!syncResult.success) {
    return {
      kind: "fail",
      errorCode: "crm_hubspot_sync_failed",
      errorText: syncResult.error ?? "HubSpot sync failed."
    };
  }

  const baseOutput: Record<string, unknown> = {
    operation: op,
    crmSyncConfig: {
      recordType: effectiveSyncConfig.recordType,
      matchBehavior: effectiveSyncConfig.matchBehavior,
      sourceLabel: effectiveSyncConfig.sourceLabel
    },
    hubspotId: syncResult.hubspotId ?? null
  };

  if (!hasWorkflowCrmNotesEnabled(noteOptions)) {
    return { kind: "ok", output: baseOutput };
  }

  const hubspotId = cleanText(syncResult.hubspotId);
  if (!hubspotId) {
    return {
      kind: "fail",
      errorCode: "crm_hubspot_missing_contact_id",
      errorText: "HubSpot contact synced but did not return a Contact ID.",
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
  const noteResult = await adapters.createContactNote({
    accountId,
    contactId: hubspotId,
    noteBody
  });

  if (!noteResult.success) {
    const message = cleanText(noteResult.error) ?? "HubSpot note creation failed.";
    return {
      kind: "fail",
      errorCode: "crm_hubspot_note_failed",
      errorText: `HubSpot contact synced, but AI note creation failed: ${message}`,
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
      hubspotNoteId: noteResult.noteId ?? null
    }
  };
}
