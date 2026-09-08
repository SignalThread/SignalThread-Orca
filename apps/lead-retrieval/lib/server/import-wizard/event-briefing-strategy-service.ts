import "server-only";

import { parseBatchBriefingContext } from "@/lib/import-wizard/batch-briefing-context";
import type { EventBriefingStrategyFields } from "@/lib/import-wizard/event-briefing-strategy-merge";
import type { BriefingGuardrailsV1 } from "@/lib/import-wizard/batch-briefing-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryEventIdForCompany } from "@/lib/server/briefing-event-knowledge-service";

/** Event-level Briefing Foundations (stored on `events.briefing_strategy`). */
export type EventBriefingStrategyV1 = EventBriefingStrategyFields;

function parseEventBriefingStrategy(raw: unknown): EventBriefingStrategyV1 {
  const p = parseBatchBriefingContext(raw);
  return {
    productFocus: p.productFocus,
    targetBuyerPersona: p.targetBuyerPersona,
    eventGoal: p.eventGoal,
    toneOfVoice: p.toneOfVoice,
    guardrails: p.guardrails,
  };
}

export { mergeEventBriefingStrategyPatch, mergeGuardrailsPatch } from "@/lib/import-wizard/event-briefing-strategy-merge";

const STRATEGY_TEXT_KEYS = ["productFocus", "targetBuyerPersona", "eventGoal", "toneOfVoice"] as const;
const GUARDRAIL_KEYS = ["excludeUnverifiedSources", "neutralToneBias", "technicalDeepDive", "realtimeDriftDetection"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a PATCH without turning omitted fields into empty strings. */
export function parseEventBriefingStrategyPatch(raw: unknown): Partial<EventBriefingStrategyV1> {
  if (!isRecord(raw)) throw new Error("invalid_strategy_patch");
  const patch: Partial<EventBriefingStrategyV1> = {};

  for (const key of STRATEGY_TEXT_KEYS) {
    if (!(key in raw)) continue;
    if (typeof raw[key] !== "string") throw new Error("invalid_strategy_patch");
    patch[key] = raw[key] as string;
  }

  if ("guardrails" in raw) {
    if (!isRecord(raw.guardrails)) throw new Error("invalid_strategy_patch");
    const guardrails: BriefingGuardrailsV1 = {};
    for (const key of GUARDRAIL_KEYS) {
      if (!(key in raw.guardrails)) continue;
      if (typeof raw.guardrails[key] !== "boolean") throw new Error("invalid_strategy_patch");
      guardrails[key] = raw.guardrails[key] as boolean;
    }
    patch.guardrails = guardrails;
  }

  if (Object.keys(patch).length === 0) throw new Error("empty_strategy_patch");
  return patch;
}

/**
 * Load the briefing strategy stored on the given event row. `eventId` MUST have been
 * validated by the caller via `company-event-access.ts` before invocation.
 */
export async function loadEventBriefingStrategy(
  eventId: string | null
): Promise<EventBriefingStrategyV1> {
  if (!eventId) return {};

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("briefing_strategy")
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const raw = (data as { briefing_strategy?: unknown } | null)?.briefing_strategy;
  return parseEventBriefingStrategy(raw);
}

/**
 * Save the briefing strategy on the given event row. `eventId` MUST have been validated by
 * the caller via `company-event-access.ts` before invocation. Throws `no_event` when null.
 */
export async function saveEventBriefingStrategy(
  eventId: string | null,
  patch: Partial<EventBriefingStrategyV1>
): Promise<EventBriefingStrategyV1> {
  if (!eventId) throw new Error("no_event");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as any).rpc("patch_event_briefing_strategy", {
    p_event_id: eventId,
    p_patch: patch,
  });

  if (error) throw new Error(`event_strategy_save_failed: ${error.message}`);
  return parseEventBriefingStrategy(data);
}

/**
 * Back-compat helper for non-user-facing server flows (background workers / internal
 * batch materialization) that only have `companyId`. User-facing routes MUST validate
 * `eventId` via `company-event-access.ts` and call `loadEventBriefingStrategy(eventId)`.
 */
export async function loadEventBriefingStrategyForCompany(
  companyId: string
): Promise<EventBriefingStrategyV1> {
  const eventId = await getPrimaryEventIdForCompany(companyId);
  return loadEventBriefingStrategy(eventId);
}
