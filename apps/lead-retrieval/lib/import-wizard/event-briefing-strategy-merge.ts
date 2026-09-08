import type { BatchBriefingContextV1, BriefingGuardrailsV1 } from "@/lib/import-wizard/batch-briefing-context";
import { defaultBriefingGuardrails } from "@/lib/import-wizard/batch-briefing-context";

/** Event-level Briefing Foundations (stored in `events.briefing_strategy` JSONB). */
export type EventBriefingStrategyFields = Pick<
  BatchBriefingContextV1,
  "productFocus" | "targetBuyerPersona" | "eventGoal" | "toneOfVoice" | "guardrails"
>;

/** Deep-merge guardrails: patch keys override; omitted keys keep existing or default to false. */
export function mergeGuardrailsPatch(
  existing: BriefingGuardrailsV1 | undefined,
  patch: Partial<BriefingGuardrailsV1> | undefined
): BriefingGuardrailsV1 | undefined {
  if (patch === undefined) return existing;
  return { ...defaultBriefingGuardrails(), ...existing, ...patch };
}

/** Merge a partial update onto existing strategy; `undefined` in the patch means “leave existing”. */
export function mergeEventBriefingStrategyPatch(
  existing: EventBriefingStrategyFields,
  patch: Partial<EventBriefingStrategyFields>
): EventBriefingStrategyFields {
  return {
    productFocus: patch.productFocus !== undefined ? patch.productFocus : existing.productFocus,
    targetBuyerPersona: patch.targetBuyerPersona !== undefined ? patch.targetBuyerPersona : existing.targetBuyerPersona,
    eventGoal: patch.eventGoal !== undefined ? patch.eventGoal : existing.eventGoal,
    toneOfVoice: patch.toneOfVoice !== undefined ? patch.toneOfVoice : existing.toneOfVoice,
    guardrails: mergeGuardrailsPatch(existing.guardrails, patch.guardrails),
  };
}
