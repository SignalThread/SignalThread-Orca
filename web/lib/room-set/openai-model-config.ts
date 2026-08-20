/**
 * Shared OpenAI model resolution and chat completion options for room-set API routes.
 */

const DEFAULT_ROOMSET_OPENAI_MODEL = "gpt-4.1-mini";
const CLASSIC_ROOMSET_TEMPERATURE = 0;

export type RoomSetOpenAiModelSource =
  | "OPENAI_ROOMSET_MODEL"
  | "ROOM_SET_LAYOUT_MODEL"
  | "ROOM_SET_INTENT_MODEL"
  | "COPILOT_RESOLVER_MODEL"
  | "default";

export type ResolvedRoomSetOpenAiModel = Readonly<{
  model: string;
  source: RoomSetOpenAiModelSource;
}>;

export type RoomSetOpenAiChatRole = "system" | "user" | "assistant";

export type RoomSetOpenAiChatMessage = Readonly<{
  role: RoomSetOpenAiChatRole;
  content: string;
}>;

export type RoomSetOpenAiJsonSchemaResponseFormat = Readonly<{
  type: "json_schema";
  json_schema: Readonly<{
    name: string;
    schema: unknown;
    strict: boolean;
  }>;
}>;

export type RoomSetOpenAiChatCompletionBody = Readonly<{
  model: string;
  messages: ReadonlyArray<RoomSetOpenAiChatMessage>;
  response_format: RoomSetOpenAiJsonSchemaResponseFormat;
  temperature?: number;
}>;

export type ResolvedRoomSetOpenAiRequestOptions = Readonly<{
  temperature: number | "model-default";
}>;

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** GPT-5 and o-series models reject non-default sampling params such as temperature: 0. */
export function openAiModelSupportsCustomTemperature(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return true;

  if (/^gpt-5(?:[-.]|$)/.test(normalized)) return false;
  if (/^o\d(?:[-.]|$)/.test(normalized)) return false;

  return true;
}

/** Resolve temperature for room-set structured outputs; omit when the model only accepts defaults. */
export function resolveRoomSetOpenAiTemperature(model: string): number | undefined {
  if (!openAiModelSupportsCustomTemperature(model)) {
    return undefined;
  }

  return CLASSIC_ROOMSET_TEMPERATURE;
}

export function resolveRoomSetOpenAiRequestOptions(model: string): ResolvedRoomSetOpenAiRequestOptions {
  const temperature = resolveRoomSetOpenAiTemperature(model);
  return {
    temperature: temperature ?? "model-default",
  };
}

export function buildRoomSetOpenAiChatCompletionBody(input: {
  model: string;
  messages: ReadonlyArray<RoomSetOpenAiChatMessage>;
  responseFormat: RoomSetOpenAiJsonSchemaResponseFormat;
}): RoomSetOpenAiChatCompletionBody {
  const temperature = resolveRoomSetOpenAiTemperature(input.model);

  return {
    model: input.model,
    ...(temperature !== undefined ? { temperature } : {}),
    response_format: input.responseFormat,
    messages: input.messages,
  };
}

/** Resolve the OpenAI chat model for room-set intent and layout planning. */
export function resolveRoomSetOpenAiModel(): ResolvedRoomSetOpenAiModel {
  const fromPrimary = trimEnv(process.env.OPENAI_ROOMSET_MODEL);
  if (fromPrimary) {
    return { model: fromPrimary, source: "OPENAI_ROOMSET_MODEL" };
  }

  const fromLayout = trimEnv(process.env.ROOM_SET_LAYOUT_MODEL);
  if (fromLayout) {
    return { model: fromLayout, source: "ROOM_SET_LAYOUT_MODEL" };
  }

  const fromIntent = trimEnv(process.env.ROOM_SET_INTENT_MODEL);
  if (fromIntent) {
    return { model: fromIntent, source: "ROOM_SET_INTENT_MODEL" };
  }

  const fromCopilot = trimEnv(process.env.COPILOT_RESOLVER_MODEL);
  if (fromCopilot) {
    return { model: fromCopilot, source: "COPILOT_RESOLVER_MODEL" };
  }

  return { model: DEFAULT_ROOMSET_OPENAI_MODEL, source: "default" };
}
