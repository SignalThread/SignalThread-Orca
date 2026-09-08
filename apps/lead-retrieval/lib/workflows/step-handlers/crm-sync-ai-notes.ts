import type { WorkflowCrmSyncContentOptions } from "./crm-sync-types";
import {
  crmMatchBehaviorLabel,
  crmRecordTypeLabel,
  type WorkflowCrmResolvedSyncConfig
} from "./crm-sync-effective-config";

export type CrmLeadProfileSnapshot = {
  fullName: string | null;
  email: string | null;
  companyText: string | null;
  jobTitle: string | null;
  rating: number | null;
  temperature: string | null;
  status: string | null;
};

export type CrmConversationInsightSnapshot = {
  summary: string | null;
  objections: string[];
  nextSteps: string[];
  conversationVersion?: number | null;
  generatedAt?: string | null;
};

export type CrmFollowUpDraftSnapshot = {
  subject: string | null;
  bodyText: string | null;
};

function cleanText(value: unknown): string | null {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function escapePlainTextForCrm(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function linesForList(values: readonly string[]): string {
  if (values.length === 0) return "Not available yet.";
  return values.map((value) => `- ${cleanText(value) ?? "Not available yet."}`).join("\n");
}

function leadSummary(lead: CrmLeadProfileSnapshot | null): string {
  if (!lead) return "Not available yet.";
  const lines = [
    cleanText(lead.fullName) ? `Name: ${cleanText(lead.fullName)}` : null,
    cleanText(lead.email) ? `Email: ${cleanText(lead.email)}` : null,
    cleanText(lead.companyText) ? `Company: ${cleanText(lead.companyText)}` : null,
    cleanText(lead.jobTitle) ? `Title: ${cleanText(lead.jobTitle)}` : null,
    Number.isFinite(lead.rating) && Number(lead.rating) > 0 ? `Rating: ${Number(lead.rating)} star` : null,
    cleanText(lead.temperature) ? `Temperature: ${cleanText(lead.temperature)}` : null,
    cleanText(lead.status) ? `Status: ${cleanText(lead.status)}` : null
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "Not available yet.";
}

function firstName(lead: CrmLeadProfileSnapshot | null): string {
  const name = cleanText(lead?.fullName);
  return name?.split(/\s+/)[0] ?? "there";
}

function buildDeterministicSuggestedEmailDraft(input: {
  lead: CrmLeadProfileSnapshot | null;
  conversation: CrmConversationInsightSnapshot | null;
  syncConfig: WorkflowCrmResolvedSyncConfig;
  instructions: string | null;
}): CrmFollowUpDraftSnapshot {
  const source = cleanText(input.syncConfig.sourceLabel);
  const summary = cleanText(input.conversation?.summary);
  const nextStep = input.conversation?.nextSteps.map(cleanText).find(Boolean) ?? null;
  const subject = source ? `Follow-up from ${source}` : "Quick follow-up";
  const bodyLines = [
    `Hi ${firstName(input.lead)},`,
    "",
    summary
      ? `Thanks again for the conversation. I noted that ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`
      : "Thanks again for taking the time to connect.",
    nextStep
      ? `As a next step, I thought it would be useful to ${nextStep.charAt(0).toLowerCase()}${nextStep.slice(1)}`
      : "As a next step, I would be happy to share more detail and see whether this is worth exploring further.",
    input.instructions ? `Draft guidance: ${input.instructions}` : null,
    "",
    "Best,"
  ].filter((line): line is string => line !== null);

  return {
    subject,
    bodyText: bodyLines.join("\n")
  };
}

export function buildCrmAiNotesBody(input: {
  contentOptions: WorkflowCrmSyncContentOptions;
  syncConfig: WorkflowCrmResolvedSyncConfig;
  lead: CrmLeadProfileSnapshot | null;
  conversation: CrmConversationInsightSnapshot | null;
  followUpDraft: CrmFollowUpDraftSnapshot | null;
  conversationData?: {
    transcriptVersion: number | null;
    insightsVersion: number | null;
    generatedAt: string;
  } | null;
}): string {
  const sections: string[] = ["Lead Retrieval AI Follow-up Notes"];

  if (input.contentOptions.includeCampaignContextInCrmNote) {
    sections.push(
      "Campaign / Source",
      cleanText(input.syncConfig.sourceLabel) ?? "Not available yet.",
      "Campaign Context / Write-up",
      [
        `Provider: ${input.syncConfig.provider === "salesforce" ? "Salesforce" : "HubSpot"}`,
        `Object: ${crmRecordTypeLabel(input.syncConfig)}`,
        `Match behavior: ${crmMatchBehaviorLabel(input.syncConfig.matchBehavior)}`,
        input.syncConfig.sourceLabel ? `Source label: ${input.syncConfig.sourceLabel}` : null
      ].filter(Boolean).join("\n")
    );
  }

  sections.push("Lead Summary", leadSummary(input.lead));

  if (input.contentOptions.includeAiNotes) {
    sections.push(
      "Conversation Summary",
      cleanText(input.conversation?.summary) ?? "Not available yet.",
      "Key Objections / Concerns",
      linesForList(input.conversation?.objections ?? [])
    );
  }

  if (input.contentOptions.includeRecommendedFollowUpInCrmNote) {
    sections.push("Recommended Follow-up", linesForList(input.conversation?.nextSteps ?? []));
  }

  if (input.contentOptions.includeSuggestedEmailDraftInCrmNote) {
    const draft =
      cleanText(input.followUpDraft?.subject) || cleanText(input.followUpDraft?.bodyText)
        ? input.followUpDraft
        : buildDeterministicSuggestedEmailDraft({
            lead: input.lead,
            conversation: input.conversation,
            syncConfig: input.syncConfig,
            instructions: input.contentOptions.suggestedEmailInstructions
          });
    const subject = cleanText(draft?.subject);
    const body = cleanText(draft?.bodyText);
    sections.push("Suggested Email Draft", `Subject: ${subject ?? "Not available yet."}\nBody:\n${body ?? "Not available yet."}`);
  }

  if (input.conversationData) {
    sections.push(
      "Conversation Data Versions",
      [
        `Transcript version: ${input.conversationData.transcriptVersion ?? "Not available yet."}`,
        `Insight version: ${input.conversationData.insightsVersion ?? "Not available yet."}`,
        `Generated at: ${input.conversationData.generatedAt}`
      ].join("\n")
    );
  }

  return escapePlainTextForCrm(sections.join("\n\n"));
}
