/**
 * Batch-level operational notes — stored in `import_batches.briefing_context` (jsonb, nullable).
 * Event-level **Briefing Foundations** live in `events.briefing_strategy` and merge in at read time.
 */

/** Optional UI presets for Event Goal (legacy slug values still compose with dedicated templates). */
export const EVENT_GOAL_PRESETS = [
  { value: "lead_generation", label: "Lead Generation", description: "Capture new prospects" },
  { value: "pipeline_acceleration", label: "Pipeline Acceleration", description: "Move deals forward" },
  { value: "product_launch", label: "Product Launch", description: "Introduce new offering" },
  { value: "brand_awareness", label: "Brand Awareness", description: "Build market presence" },
  { value: "customer_engagement", label: "Customer Engagement", description: "Connect with existing customers" },
  { value: "partner_development", label: "Partner Development", description: "Build partnerships" },
] as const;

/** @deprecated Use EVENT_GOAL_PRESETS — kept for existing imports */
export const EVENT_GOAL_OPTIONS = EVENT_GOAL_PRESETS;

/**
 * Event-scoped AI output constraints — nested under `events.briefing_strategy.guardrails`.
 * Does not replace core strategy fields; narrows assisted output behavior.
 */
export type BriefingGuardrailsV1 = {
  excludeUnverifiedSources?: boolean;
  neutralToneBias?: boolean;
  technicalDeepDive?: boolean;
  realtimeDriftDetection?: boolean;
};

export function defaultBriefingGuardrails(): BriefingGuardrailsV1 {
  return {
    excludeUnverifiedSources: false,
    neutralToneBias: false,
    technicalDeepDive: false,
    realtimeDriftDetection: false,
  };
}

export function parseGuardrails(raw: unknown): BriefingGuardrailsV1 | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: BriefingGuardrailsV1 = {};
  if (typeof o.excludeUnverifiedSources === "boolean") out.excludeUnverifiedSources = o.excludeUnverifiedSources;
  if (typeof o.neutralToneBias === "boolean") out.neutralToneBias = o.neutralToneBias;
  if (typeof o.technicalDeepDive === "boolean") out.technicalDeepDive = o.technicalDeepDive;
  if (typeof o.realtimeDriftDetection === "boolean") out.realtimeDriftDetection = o.realtimeDriftDetection;
  return Object.keys(out).length > 0 ? out : undefined;
}

export type BatchBriefingContextV1 = {
  productFocus?: string;
  targetBuyerPersona?: string;
  /** Free-text strategic goal for the event (may match a legacy preset slug or arbitrary copy). */
  eventGoal?: string;
  /** How assisted copy should sound — often comma-separated tone labels from the UI. */
  toneOfVoice?: string;
  /** Event-level only; merged from `events.briefing_strategy` when loading batch context. */
  guardrails?: BriefingGuardrailsV1;
  batchNotes?: string;
};

export function parseBatchBriefingContext(raw: unknown): BatchBriefingContextV1 {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  return {
    productFocus: typeof obj.productFocus === "string" ? obj.productFocus : undefined,
    targetBuyerPersona: typeof obj.targetBuyerPersona === "string" ? obj.targetBuyerPersona : undefined,
    eventGoal: typeof obj.eventGoal === "string" ? obj.eventGoal : undefined,
    toneOfVoice: typeof obj.toneOfVoice === "string" ? obj.toneOfVoice : undefined,
    guardrails: parseGuardrails(obj.guardrails),
    batchNotes: typeof obj.batchNotes === "string" ? obj.batchNotes : undefined,
  };
}

export function hasBatchBriefingContext(ctx: BatchBriefingContextV1): boolean {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const g = ctx.guardrails;
  const guardrailsActive =
    g &&
    (g.excludeUnverifiedSources ||
      g.neutralToneBias ||
      g.technicalDeepDive ||
      g.realtimeDriftDetection);
  return !!(s(ctx.productFocus) || s(ctx.targetBuyerPersona) || s(ctx.eventGoal) || s(ctx.toneOfVoice) || s(ctx.batchNotes) || guardrailsActive);
}
