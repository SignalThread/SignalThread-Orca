import type { CopilotClientContext, MatrixCopilotActionType, MatrixCopilotResolverResult, CopilotMode } from "@/lib/copilot/types";

export const MATRIX_DO_CLARIFICATION_THRESHOLD = 0.72;

type MatrixResolverInput = {
  mode: CopilotMode;
  prompt: string;
  context?: CopilotClientContext;
  availableCapabilities: MatrixCopilotActionType[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampConfidence(value: unknown): number {
  const parsed = toNumber(value);
  if (parsed === null) return 0;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function isMatrixCapability(value: unknown): value is MatrixCopilotActionType {
  return value === "room.create" || value === "room.update" || value === "session.create" || value === "session.move";
}

function extractQuotedValues(prompt: string): string[] {
  const results: string[] = [];
  const regex = /"([^"]+)"/g;
  let match: RegExpExecArray | null = regex.exec(prompt);
  while (match) {
    if (match[1]?.trim()) {
      results.push(match[1].trim());
    }
    match = regex.exec(prompt);
  }
  return results;
}

function extractCapacity(prompt: string): number | null {
  const match = prompt.match(/capacity\s*(?:of|=|to)?\s*(\d{1,6})/i) ?? prompt.match(/(\d{1,6})\s*(?:seats|people)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function cleanRoomNameCandidate(value: string | null): string | null {
  if (!value) return null;
  const withoutCapacity = value
    .replace(/\s+(?:with\s+)?capacity\s*(?:of|=|to)?\s*\d{1,6}\b.*$/i, "")
    .replace(/\s+\d{1,6}\s*(?:seats|people)\b.*$/i, "");
  const cleaned = withoutCapacity.trim().replace(/[.,;:]+$/, "");
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const explicit = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (explicit) {
    let hours = Number(explicit[1]);
    const minutes = Number(explicit[2]);
    const meridian = explicit[3]?.toLowerCase() ?? null;
    if (meridian === "pm" && hours < 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const hourOnly = normalized.match(/^(\d{1,2})(?:\s*(am|pm))$/i);
  if (hourOnly) {
    let hours = Number(hourOnly[1]);
    const meridian = hourOnly[2]?.toLowerCase();
    if (meridian === "pm" && hours < 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
    if (hours < 0 || hours > 23) return null;
    return `${String(hours).padStart(2, "0")}:00`;
  }

  return null;
}

function extractTime(prompt: string): string | null {
  const match = prompt.match(/(?:at|from|start(?:ing)?\s+at|to)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  return normalizeTime(match?.[1] ?? null);
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeResolverResult(result: Partial<MatrixCopilotResolverResult> & UnknownRecord, allowedCapabilities: MatrixCopilotActionType[]): MatrixCopilotResolverResult {
  const capability = isMatrixCapability(result.capability) && allowedCapabilities.includes(result.capability) ? result.capability : null;
  const confidence = clampConfidence(result.confidence);
  const params = isRecord(result.params) ? result.params : {};
  const fallbackQuestion = "Can you clarify what you want to change in Matrix (room create/update, session create/move)?";
  const reasoningSummary = toText(result.reasoningSummary) ?? "Resolver could not map this request confidently.";

  const needsClarification =
    typeof result.needsClarification === "boolean"
      ? result.needsClarification
      : capability === null || confidence < MATRIX_DO_CLARIFICATION_THRESHOLD;

  const clarifyingQuestion = needsClarification
    ? (toText(result.clarifyingQuestion) ?? fallbackQuestion)
    : null;

  return {
    capability,
    confidence,
    params,
    needsClarification,
    clarifyingQuestion,
    reasoningSummary,
  };
}

function fallbackResolve(input: MatrixResolverInput): MatrixCopilotResolverResult {
  const text = input.prompt.trim();
  const lower = text.toLowerCase();
  const quoted = extractQuotedValues(text);
  const allowed = input.availableCapabilities;

  const roomCreateAlias = /(add|create|new)\s+(?:a\s+|an\s+)?(?:breakout\s+)?room\b/.test(lower) || /\badd breakout room\b/.test(lower);
  if (roomCreateAlias && allowed.includes("room.create")) {
    const nameFromCalled = cleanRoomNameCandidate(text.match(/(?:called|named)\s+["“]?([^"”\n,.]{1,80})["”]?/i)?.[1]?.trim() ?? null);
    const nameFromQuoted = cleanRoomNameCandidate(quoted.find((entry) => !entry.toLowerCase().includes("matrix")) ?? null);
    const roomName = nameFromCalled ?? nameFromQuoted;
    const capacity = extractCapacity(text);

    if (!roomName) {
      return {
        capability: "room.create",
        confidence: 0.56,
        params: {
          roomName: null,
          capacity,
        },
        needsClarification: true,
        clarifyingQuestion: "What should the new room be called?",
        reasoningSummary: "Detected room-creation intent but room name is missing.",
      };
    }

    return {
      capability: "room.create",
      confidence: 0.9,
      params: {
        roomName,
        capacity,
        notes: null,
      },
      needsClarification: false,
      clarifyingQuestion: null,
      reasoningSummary: `Create room "${roomName}"${capacity ? ` with capacity ${capacity}` : ""}.`,
    };
  }

  const roomUpdateAlias = /\b(rename room|update room)\b/.test(lower);
  if (roomUpdateAlias && allowed.includes("room.update")) {
    const roomName = quoted[0] ?? text.match(/(?:rename|update)\s+room\s+(.+?)(?:\s+to\s+|$)/i)?.[1]?.trim() ?? null;
    const newName = quoted[1] ?? text.match(/\s+to\s+(.+)$/i)?.[1]?.trim() ?? null;
    const capacity = extractCapacity(text);
    const missingTarget = !roomName;
    const missingMutation = !newName && capacity === null;

    if (missingTarget || missingMutation) {
      return {
        capability: "room.update",
        confidence: 0.58,
        params: {
          roomName,
          newName,
          capacity,
        },
        needsClarification: true,
        clarifyingQuestion: missingTarget
          ? "Which room should I update?"
          : "What room change should I apply (new name and/or capacity)?",
        reasoningSummary: "Detected room update intent but details are incomplete.",
      };
    }

    return {
      capability: "room.update",
      confidence: 0.82,
      params: {
        roomName,
        newName,
        capacity,
      },
      needsClarification: false,
      clarifyingQuestion: null,
      reasoningSummary: `Update room "${roomName}".`,
    };
  }

  const sessionMoveAlias = /\bmove\b/.test(lower) && /\bsession\b/.test(lower);
  if (sessionMoveAlias && allowed.includes("session.move")) {
    const sessionName = quoted[0] ?? text.match(/move\s+(?:session\s+)?(.+?)(?:\s+to\s+|$)/i)?.[1]?.trim() ?? null;
    const roomName = text.match(/(?:to|into)\s+([a-z0-9][a-z0-9\s\-]{1,60})/i)?.[1]?.trim() ?? null;
    const startTime = extractTime(text);
    const missing = !sessionName || !roomName || !startTime;

    return {
      capability: "session.move",
      confidence: missing ? 0.54 : 0.8,
      params: {
        sessionName,
        roomName,
        startTime,
      },
      needsClarification: missing,
      clarifyingQuestion: missing ? "Please share the session name, target room, and target start time." : null,
      reasoningSummary: missing ? "Detected session move intent but details are incomplete." : `Move session "${sessionName}" to ${roomName}.`,
    };
  }

  const sessionCreateAlias = /\b(add|create|new)\b/.test(lower) && /\bsession\b/.test(lower);
  if (sessionCreateAlias && allowed.includes("session.create")) {
    const sessionName = quoted[0] ?? text.match(/(?:add|create)\s+session\s+(.+?)(?:\s+in\s+|\s+at\s+|$)/i)?.[1]?.trim() ?? null;
    const roomName = text.match(/(?:in|room)\s+([a-z0-9][a-z0-9\s\-]{1,60})/i)?.[1]?.trim() ?? null;
    const startTime = extractTime(text);
    const missing = !sessionName || !startTime;
    return {
      capability: "session.create",
      confidence: missing ? 0.53 : 0.76,
      params: {
        sessionName,
        roomName,
        startTime,
        durationMinutes: 60,
      },
      needsClarification: missing,
      clarifyingQuestion: missing ? "What is the session title and start time?" : null,
      reasoningSummary: missing ? "Detected session creation intent but title/time are incomplete." : `Create session "${sessionName}".`,
    };
  }

  return {
    capability: null,
    confidence: 0.31,
    params: {},
    needsClarification: true,
    clarifyingQuestion: "I can help with room create/update or session create/move in Matrix. What should I do?",
    reasoningSummary: "Prompt did not map confidently to the supported Matrix capabilities.",
  };
}

async function resolveWithLlm(input: MatrixResolverInput): Promise<MatrixCopilotResolverResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.COPILOT_RESOLVER_MODEL?.trim() || "gpt-4.1-mini";
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      capability: {
        anyOf: [
          {
            type: "string",
            enum: input.availableCapabilities,
          },
          { type: "null" },
        ],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      params: { type: "object", additionalProperties: true },
      needsClarification: { type: "boolean" },
      clarifyingQuestion: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      reasoningSummary: { type: "string" },
    },
    required: ["capability", "confidence", "params", "needsClarification", "clarifyingQuestion", "reasoningSummary"],
  } as const;

  const systemPrompt = [
    "You are the Planner Copilot Matrix Do resolver.",
    "Map the user prompt to exactly one supported capability or null.",
    "Supported capabilities: room.create, room.update, session.create, session.move.",
    "Alias room.create when user says add/create/new room or add breakout room.",
    "For room.create extract params.roomName (required) and params.capacity (optional number).",
    "If required details are missing or confidence is low, set needsClarification=true and ask one concise question.",
    "Never invent unsupported capabilities. Keep params minimal and executable.",
  ].join(" ");

  const payload = {
    model,
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "matrix_do_resolution",
        schema,
        strict: true,
      },
    },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          mode: input.mode,
          prompt: input.prompt,
          context: input.context ?? {},
          availableCapabilities: input.availableCapabilities,
        }),
      },
    ],
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn("[copilot/matrix-resolver] LLM request failed", {
        status: response.status,
        body: errorText.slice(0, 500),
      });
      return null;
    }

    const data = (await response.json()) as UnknownRecord;
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = choices[0];
    const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = message ? message.content : null;
    const contentText = typeof content === "string" ? content : null;
    if (!contentText) return null;

    const jsonPayload = extractJsonObject(contentText) ?? contentText;
    const parsed = JSON.parse(jsonPayload) as UnknownRecord;
    return normalizeResolverResult(parsed, input.availableCapabilities);
  } catch (error) {
    console.warn("[copilot/matrix-resolver] LLM parse failure", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

export async function resolveMatrixDoAction(input: MatrixResolverInput): Promise<MatrixCopilotResolverResult> {
  const llmResult = await resolveWithLlm(input);
  const resolved = llmResult ?? fallbackResolve(input);

  console.info("[copilot/matrix-resolver] resolved", {
    prompt: input.prompt,
    capability: resolved.capability,
    confidence: resolved.confidence,
    needsClarification: resolved.needsClarification,
  });

  return resolved;
}
