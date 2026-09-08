import { buildConversationInsightPrompt } from "@/lib/conversations/conversation-insight-contract";

export type LeadInsightPromptLeadContext = {
  id: string;
  fullName: string | null;
  email: string | null;
  jobTitle: string | null;
  companyText: string | null;
  companyDomain: string | null;
  industry: string | null;
  companySize: string | null;
  seniority: string | null;
  status: string | null;
  temperature: string | null;
  priorityScore: number | null;
  eventName: string | null;
  eventLocation: string | null;
};

export type LeadInsightPromptVoiceNote = {
  id: string;
  recordedAt: string | null;
  durationMs: number | null;
  transcript: string;
};

function printable(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function formatLeadContext(context: LeadInsightPromptLeadContext) {
  return JSON.stringify(
    {
      leadId: context.id,
      fullName: printable(context.fullName),
      email: printable(context.email),
      jobTitle: printable(context.jobTitle),
      companyText: printable(context.companyText),
      companyDomain: printable(context.companyDomain),
      industry: printable(context.industry),
      companySize: printable(context.companySize),
      seniority: printable(context.seniority),
      status: printable(context.status),
      temperature: printable(context.temperature),
      priorityScore: context.priorityScore ?? null,
      eventName: printable(context.eventName),
      eventLocation: printable(context.eventLocation)
    },
    null,
    2
  );
}

function formatVoiceNotes(voiceNotes: LeadInsightPromptVoiceNote[]) {
  if (voiceNotes.length === 0) {
    return "No transcripted voice notes are available.";
  }

  return voiceNotes
    .map((note, index) =>
      [
        `Voice note ${index + 1}:`,
        `id: ${note.id}`,
        `recorded_at: ${note.recordedAt ?? "unknown"}`,
        `duration_ms: ${note.durationMs ?? "unknown"}`,
        "transcript:",
        note.transcript.trim()
      ].join("\n")
    )
    .join("\n\n");
}

export function buildLeadInsightRegenerationPrompt(input: {
  lead: LeadInsightPromptLeadContext;
  voiceNotes: LeadInsightPromptVoiceNote[];
}) {
  return buildConversationInsightPrompt({
    contextTitle: "Lead context:",
    context: formatLeadContext(input.lead),
    transcriptTitle: "Transcripted voice notes in chronological order:",
    transcript: [
      "Regenerate cumulative lead insights from source-of-truth lead context and ALL transcripted voice notes.",
      "Do not rely on prior AI summaries as the primary source.",
      "",
      formatVoiceNotes(input.voiceNotes)
    ].join("\n")
  });
}
