import { createRequire } from "node:module";
import OpenAI from "openai";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_PLAYGROUND_OPENAI_MODEL = "gpt-4.1";
const require = createRequire(import.meta.url);

const LEAD_INSIGHTS_JSON_SCHEMA = {
  name: "lead_insights",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      context_summary: { type: "string" },
      sentiment: { type: "string" },
      buying_signals: {
        type: "array",
        items: { type: "string" }
      },
      key_needs: {
        type: "array",
        items: { type: "string" }
      },
      objections: {
        type: "array",
        items: { type: "string" }
      },
      next_steps: {
        type: "array",
        items: { type: "string" }
      },
      next_best_action: { type: "string" }
    },
    required: [
      "summary",
      "context_summary",
      "sentiment",
      "buying_signals",
      "key_needs",
      "objections",
      "next_steps",
      "next_best_action"
    ]
  }
} as const;

export type LeadInsightsStructuredOutput = {
  summary: string;
  context_summary: string;
  sentiment: string;
  buyingSignals: string[];
  keyNeeds: string[];
  objections: string[];
  next_steps: string[];
  nextBestAction: string;
};

export type LeadInsightsGenerationInput = {
  transcript: string;
  context?: string | null;
};

export type LeadInsightsOpenAIConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  organization: string | null;
  project: string | null;
};

export type LeadInsightsGenerationResult = {
  insights: LeadInsightsStructuredOutput;
  model: string;
  request: {
    systemPrompt: string;
    userPrompt: string;
  };
  rawResponse: unknown;
};

export function resolveLeadInsightsOpenAIConfig(
  env: NodeJS.ProcessEnv = process.env
): LeadInsightsOpenAIConfig {
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const model = resolveLeadInsightsOpenAIModel(env);
  const baseUrl =
    String(env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL).trim().replace(/\/+$/, "") ||
    DEFAULT_OPENAI_BASE_URL;
  const organization = String(env.OPENAI_ORG_ID ?? "").trim() || null;
  const project = String(env.OPENAI_PROJECT_ID ?? "").trim() || null;

  return {
    apiKey,
    model,
    baseUrl,
    organization,
    project
  };
}

function resolveLeadInsightsOpenAIModel(env: NodeJS.ProcessEnv): string {
  if (String(env.ALLOW_LEAD_INSIGHTS_PLAYGROUND ?? "").trim() === "1") {
    return (
      String(env.LEAD_INSIGHTS_OPENAI_MODEL ?? "").trim() ||
      DEFAULT_PLAYGROUND_OPENAI_MODEL
    );
  }

  const imported = require("../../server/lead-insights/modelConfig") as {
    getLeadInsightsOpenAIModel: (runtimeEnv?: NodeJS.ProcessEnv) => string;
  };

  return imported.getLeadInsightsOpenAIModel(env);
}

export function buildLeadInsightsPrompts(input: LeadInsightsGenerationInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const transcript = normalizeRequiredText(input.transcript, "transcript");
  const context = typeof input.context === "string" ? input.context.trim() : "";

  const systemPrompt =
    "You generate structured lead insights for a sales rep. Infer only from the provided transcript and optional context. Keep output concise, concrete, and useful for follow-up.";

  const sections = ["Transcript:", transcript];

  if (context) {
    sections.push("", "Additional context:", context);
  }

  sections.push(
    "",
    "Return JSON matching the requested schema.",
    "Rules:",
    "- summary: 1-3 sentence factual summary",
    "- context_summary: a compact one-line synthesis for the lead detail header",
    "- sentiment: short description such as positive, mixed, cautious, urgent, or neutral",
    "- buying_signals, key_needs, objections, next_steps: arrays of concise bullets",
    "- next_best_action: one specific recommended follow-up action"
  );

  return {
    systemPrompt,
    userPrompt: sections.join("\n")
  };
}

export async function generateLeadInsightsWithOpenAI(
  input: LeadInsightsGenerationInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<LeadInsightsGenerationResult> {
  const config = resolveLeadInsightsOpenAIConfig(env);
  const { systemPrompt, userPrompt } = buildLeadInsightsPrompts(input);

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    organization: config.organization ?? undefined,
    project: config.project ?? undefined
  });

  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: LEAD_INSIGHTS_JSON_SCHEMA
    }
  });

  const content = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!content) {
    const refusal = completion.choices[0]?.message?.refusal?.trim();
    throw new Error(
      refusal
        ? `Model refused the request: ${refusal}`
        : "OpenAI response did not include content."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse model JSON response: ${
        error instanceof Error ? error.message : "Unknown parse error."
      }`
    );
  }

  return {
    insights: validateLeadInsightsStructuredOutput(parsed),
    model: config.model,
    request: {
      systemPrompt,
      userPrompt
    },
    rawResponse: completion
  };
}

function validateLeadInsightsStructuredOutput(value: unknown): LeadInsightsStructuredOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid model response: expected a JSON object.");
  }

  const record = value as Record<string, unknown>;

  return {
    summary: normalizeRequiredString(record.summary, "summary"),
    context_summary: normalizeRequiredString(record.context_summary, "context_summary"),
    sentiment: normalizeRequiredString(record.sentiment, "sentiment"),
    buyingSignals: normalizeStringArray(record.buying_signals, "buying_signals"),
    keyNeeds: normalizeStringArray(record.key_needs, "key_needs"),
    objections: normalizeStringArray(record.objections, "objections"),
    next_steps: normalizeStringArray(record.next_steps, "next_steps"),
    nextBestAction: normalizeRequiredString(record.next_best_action, "next_best_action")
  };
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new Error(`Missing ${fieldName} text.`);
  }
  return normalized;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid model response: expected ${fieldName} to be a string.`);
  }
  return value.trim();
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid model response: expected ${fieldName} to be an array.`);
  }

  return value
    .map((item) => {
      if (typeof item !== "string") {
        throw new Error(`Invalid model response: expected ${fieldName} items to be strings.`);
      }
      return item.trim();
    })
    .filter(Boolean);
}
