import {
  normalizeConversationInsightPayload,
  type ConversationInsightPayload
} from "@/lib/conversations/conversation-insight-contract";

type PersistedConversationInsight = {
  [K in keyof ConversationInsightPayload]?: ConversationInsightPayload[K] | null;
};

export type ConversationIntelligenceRecord = PersistedConversationInsight & {
  id: string;
  created_at: string;
  transcript?: string | null;
  transcription_status?: string | null;
  synthesis_status?: string | null;
  transcription_error?: string | null;
  synthesis_error?: string | null;
};

export type CumulativeIntelligenceRecord = {
  status?: string | null;
  insights_json?: unknown;
};

export type CanonicalConversationIntelligence = ConversationInsightPayload & {
  source: "conversation" | "cumulative";
  schema: "structured" | "legacy";
};

const STRUCTURED_ARRAY_FIELDS = [
  "priority_themes",
  "competitors_mentioned",
  "pain_points",
  "feature_requests",
  "buying_signals",
  "operational_pains",
  "workflow_constraints",
  "technical_constraints",
  "desired_outcomes",
  "adoption_risks",
  "management_visibility_needs",
  "business_process_concerns",
  "product_objections",
  "rep_behavior_patterns"
] as const satisfies readonly (keyof ConversationInsightPayload)[];

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

function toObject(value: unknown): PersistedConversationInsight | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as PersistedConversationInsight;
}

function hasStructuredFields(value: PersistedConversationInsight): boolean {
  return STRUCTURED_ARRAY_FIELDS.some((field) => {
    const items = value[field];
    return Array.isArray(items) && items.some((item) => hasText(item));
  });
}

export function isNoSpeechConversation(
  record: Pick<
    ConversationIntelligenceRecord,
    "transcription_status" | "synthesis_status" | "transcript" | "synthesis_error"
  >
): boolean {
  const synthesisError = normalizeStatus(record.synthesis_error);
  return (
    normalizeStatus(record.transcription_status) === "completed" &&
    !hasText(record.transcript) &&
    normalizeStatus(record.synthesis_status) === "failed" &&
    (synthesisError.includes("no speech") || synthesisError.includes("empty"))
  );
}

function intelligenceRank(record: ConversationIntelligenceRecord): number {
  const synthesisStatus = normalizeStatus(record.synthesis_status);
  if (synthesisStatus === "completed" && hasText(record.summary)) return 3;
  if (synthesisStatus === "completed" && hasText(record.transcript)) return 2;
  if (hasText(record.summary) || hasText(record.transcript)) return 1;
  return 0;
}

/**
 * Selects the newest usable intelligence snapshot. A later failed/no-speech
 * recording must not hide a previously completed synthesis for the lead.
 */
export function selectCanonicalConversationIntelligence<T extends ConversationIntelligenceRecord>(
  records: readonly T[]
): T | null {
  const sorted = [...records].sort((a, b) => {
    const rankDelta = intelligenceRank(b) - intelligenceRank(a);
    if (rankDelta !== 0) return rankDelta;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return sorted[0] ?? null;
}

/**
 * Canonical provider-neutral read model for conversation intelligence.
 * Completed cumulative intelligence wins field-by-field, while empty fields
 * safely fall back to the selected conversation's persisted values.
 */
export function buildCanonicalConversationIntelligence(
  conversation: ConversationIntelligenceRecord | null,
  cumulative: CumulativeIntelligenceRecord | null
): CanonicalConversationIntelligence | null {
  const conversationInput: PersistedConversationInsight = conversation ?? {};
  const conversationNormalized = normalizeConversationInsightPayload(
    conversationInput as Partial<ConversationInsightPayload>
  );
  const cumulativeInput =
    normalizeStatus(cumulative?.status) === "completed" ? toObject(cumulative?.insights_json) : null;

  if (!conversation && !cumulativeInput) return null;

  if (!cumulativeInput) {
    return {
      ...conversationNormalized,
      source: "conversation",
      schema: hasStructuredFields(conversationInput) ? "structured" : "legacy"
    };
  }

  const cumulativeNormalized = normalizeConversationInsightPayload(
    cumulativeInput as Partial<ConversationInsightPayload>
  );
  const merged = { ...conversationNormalized } as ConversationInsightPayload;
  for (const [key, value] of Object.entries(cumulativeNormalized) as Array<
    [keyof ConversationInsightPayload, ConversationInsightPayload[keyof ConversationInsightPayload]]
  >) {
    if (Array.isArray(value)) {
      if (value.length > 0) (merged as Record<string, unknown>)[key] = value;
    } else if (hasText(value)) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return {
    ...merged,
    source: "cumulative",
    schema: hasStructuredFields(cumulativeInput) || hasStructuredFields(conversationInput) ? "structured" : "legacy"
  };
}
