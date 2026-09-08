export const BADGE_INTERPRETER_FIELDS = ["full_name", "company_text", "job_title", "email", "phone"] as const;
export type BadgeInterpreterField = (typeof BADGE_INTERPRETER_FIELDS)[number];

export type BadgeInterpreterLine = { index: number; text: string };
export type BadgeInterpreterRequest = {
  eventId: string;
  lines: BadgeInterpreterLine[];
  localSuggestions: Partial<Record<BadgeInterpreterField, string>>;
};
export type BadgeInterpreterRecommendation = {
  value: string;
  sourceLineIndexes: number[];
  confidence: number;
};
export type BadgeInterpreterResponse = {
  fields: Partial<Record<BadgeInterpreterField, BadgeInterpreterRecommendation>>;
};

const MAX_LINES = 80;
const MAX_LINE_LENGTH = 240;
const MAX_TOTAL_TEXT = 12_000;

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function parseBadgeInterpreterRequest(raw: unknown): BadgeInterpreterRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const eventId = typeof row.eventId === "string" ? row.eventId.trim() : "";
  if (!eventId || eventId.length > 128 || !Array.isArray(row.lines) || row.lines.length === 0 || row.lines.length > MAX_LINES) {
    return null;
  }

  const lines: BadgeInterpreterLine[] = [];
  const indexes = new Set<number>();
  let totalText = 0;
  for (const value of row.lines) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const line = value as Record<string, unknown>;
    const index = line.index;
    const text = typeof line.text === "string" ? line.text.trim() : "";
    if (!Number.isInteger(index) || (index as number) < 0 || indexes.has(index as number) || !text || text.length > MAX_LINE_LENGTH) {
      return null;
    }
    totalText += text.length;
    if (totalText > MAX_TOTAL_TEXT) return null;
    indexes.add(index as number);
    lines.push({ index: index as number, text });
  }

  const localSuggestions: Partial<Record<BadgeInterpreterField, string>> = {};
  if (row.localSuggestions && typeof row.localSuggestions === "object" && !Array.isArray(row.localSuggestions)) {
    for (const field of BADGE_INTERPRETER_FIELDS) {
      const value = (row.localSuggestions as Record<string, unknown>)[field];
      if (typeof value === "string" && value.trim() && value.length <= MAX_LINE_LENGTH) {
        localSuggestions[field] = value.trim();
      }
    }
  }
  return { eventId, lines, localSuggestions };
}

export function normalizeBadgeInterpreterResponse(
  raw: unknown,
  lines: BadgeInterpreterLine[]
): BadgeInterpreterResponse | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rawFields = (raw as Record<string, unknown>).fields;
  if (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields)) return null;
  const lineByIndex = new Map(lines.map((line) => [line.index, line.text]));
  const fields: BadgeInterpreterResponse["fields"] = {};

  for (const field of BADGE_INTERPRETER_FIELDS) {
    const candidate = (rawFields as Record<string, unknown>)[field];
    if (candidate == null) continue;
    if (typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const value = candidate as Record<string, unknown>;
    const text = typeof value.value === "string" ? value.value.trim() : "";
    const confidence = typeof value.confidence === "number" ? value.confidence : NaN;
    const sourceLineIndexes = Array.isArray(value.sourceLineIndexes)
      ? value.sourceLineIndexes.filter((index): index is number => Number.isInteger(index))
      : [];
    if (!text || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
    if (sourceLineIndexes.length === 0 || sourceLineIndexes.length > 3) return null;
    const selected = sourceLineIndexes.map((index) => lineByIndex.get(index));
    if (selected.some((line) => line == null)) return null;
    if (normalize(text) !== normalize((selected as string[]).join(" "))) return null;
    fields[field] = { value: text, sourceLineIndexes, confidence };
  }
  return Object.keys(fields).length ? { fields } : null;
}

export async function executeBadgeInterpretation(input: {
  principal: { userId: string; companyId: string };
  request: BadgeInterpreterRequest;
  assertEventAccess: (userId: string, eventId: string) => Promise<void>;
  interpret: (request: BadgeInterpreterRequest) => Promise<BadgeInterpreterResponse>;
}): Promise<BadgeInterpreterResponse> {
  if (!input.principal.userId || !input.principal.companyId) throw new Error("BADGE_INTERPRETER_SCOPE_REQUIRED");
  await input.assertEventAccess(input.principal.userId, input.request.eventId);
  return input.interpret(input.request);
}
