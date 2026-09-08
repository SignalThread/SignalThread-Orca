import "server-only";

import OpenAI from "openai";

import {
  BADGE_INTERPRETER_FIELDS,
  normalizeBadgeInterpreterResponse,
  type BadgeInterpreterRequest,
  type BadgeInterpreterResponse,
} from "@/lib/capture/badge-interpreter-core";

export const BADGE_INTERPRETER_PROVIDER_TIMEOUT_MS = 8_000;
export const BADGE_INTERPRETER_OPENAI_REASONING_EFFORT = "medium";

export interface BadgeInterpreter {
  interpret(input: BadgeInterpreterRequest): Promise<BadgeInterpreterResponse>;
}

function nullableRecommendationSchema() {
  return {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["value", "sourceLineIndexes", "confidence"],
        properties: {
          value: { type: "string" },
          sourceLineIndexes: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "integer", minimum: 0 },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
      { type: "null" },
    ],
  };
}

export class OpenAiBadgeInterpreter implements BadgeInterpreter {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async interpret(input: BadgeInterpreterRequest): Promise<BadgeInterpreterResponse> {
    const client = new OpenAI({
      apiKey: this.apiKey,
      timeout: BADGE_INTERPRETER_PROVIDER_TIMEOUT_MS,
      maxRetries: 0,
    });
    const openAiStartedAt = Date.now();
    console.info("[badge-ai-backend] openai_started");
    let response: Awaited<ReturnType<typeof client.responses.create>>;
    try {
      response = await client.responses.create({
        model: this.model,
        reasoning: { effort: BADGE_INTERPRETER_OPENAI_REASONING_EFFORT },
        max_output_tokens: 900,
        input: [
          {
            role: "system",
            content: [
              "Interpret badge OCR into contact-field recommendations.",
              "Use only the supplied OCR lines. Local suggestions are advisory, not truth.",
              "Every value must exactly equal one referenced line or the space-joined text of up to three referenced lines.",
              "Never invent or infer contact information. Use null for uncertain fields.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({ lines: input.lines, localSuggestions: input.localSuggestions }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "badge_interpretation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["fields"],
              properties: {
                fields: {
                  type: "object",
                  additionalProperties: false,
                  required: [...BADGE_INTERPRETER_FIELDS],
                  properties: Object.fromEntries(
                    BADGE_INTERPRETER_FIELDS.map((field) => [field, nullableRecommendationSchema()])
                  ),
                },
              },
            },
          },
        },
      });
      console.info(`[badge-ai-backend] openai_completed elapsedMs=${Date.now() - openAiStartedAt}`);
    } catch (error) {
      console.info(`[badge-ai-backend] openai_failed elapsedMs=${Date.now() - openAiStartedAt}`);
      throw error;
    }

    const validationStartedAt = Date.now();
    const parsed = response.output_text?.trim() ? JSON.parse(response.output_text) : null;
    const normalized = normalizeBadgeInterpreterResponse(parsed, input.lines);
    if (!normalized) {
      console.info(`[badge-ai-backend] validation_failed elapsedMs=${Date.now() - validationStartedAt}`);
      throw new Error("BADGE_INTERPRETER_MALFORMED_RESPONSE");
    }
    console.info(`[badge-ai-backend] validation_complete elapsedMs=${Date.now() - validationStartedAt}`);
    return normalized;
  }
}

export function createConfiguredBadgeInterpreter(): BadgeInterpreter {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.BADGE_INTERPRETER_OPENAI_MODEL?.trim();
  if (!apiKey || !model) throw new Error("BADGE_INTERPRETER_NOT_CONFIGURED");
  return new OpenAiBadgeInterpreter(apiKey, model);
}
