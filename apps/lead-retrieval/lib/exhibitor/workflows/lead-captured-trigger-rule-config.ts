/**
 * UI-friendly types and helpers for the lead_captured trigger rule config.
 * Maps to the trigger_conditions_jsonb format consumed by evaluateLeadCapturedTriggerRules().
 *
 * Multi-select model: each field holds an array of chosen values.
 * Empty array = no filter for that field ("any").
 * Across fields: AND. Within a field: OR.
 */

export type LeadRatingValue = "1" | "2" | "3" | "4" | "5";
export type LeadTemperatureValue = "hot" | "warm" | "cold";
export type LeadStatusValue = "new" | "follow_up" | "closed";

export type LeadCapturedTriggerRuleConfig = {
  ratings: LeadRatingValue[];
  temperatures: LeadTemperatureValue[];
  /** Deprecated UI field kept only so older saved status conditions can load safely. */
  statuses: LeadStatusValue[];
};

export const DEFAULT_TRIGGER_RULE_CONFIG: LeadCapturedTriggerRuleConfig = {
  ratings: [],
  temperatures: [],
  statuses: []
};

export const LEAD_RATING_VALUES: ReadonlyArray<{ value: LeadRatingValue; label: string }> = [
  { value: "1", label: "1★" },
  { value: "2", label: "2★" },
  { value: "3", label: "3★" },
  { value: "4", label: "4★" },
  { value: "5", label: "5★" }
];

export const LEAD_TEMPERATURE_VALUES: ReadonlyArray<{ value: LeadTemperatureValue; label: string }> = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" }
];

/** Returns true when all fields are empty — no filtering applied. */
export function isTriggerRuleConfigDefault(config: LeadCapturedTriggerRuleConfig): boolean {
  return (
    config.ratings.length === 0 &&
    config.temperatures.length === 0
  );
}

/** Validates a trigger rule config. Returns an error string or null. */
export function validateTriggerRuleConfig(
  config: LeadCapturedTriggerRuleConfig
): string | null {
  const validRatings: string[] = ["1", "2", "3", "4", "5"];
  const validTemps: string[] = ["hot", "warm", "cold"];

  if (config.ratings.some((r) => !validRatings.includes(r))) return "Invalid rating filter.";
  if (config.temperatures.some((t) => !validTemps.includes(t))) return "Invalid temperature filter.";

  return null;
}

/**
 * Converts UI config to the trigger_conditions_jsonb format the backend evaluator expects.
 * Returns null when config has no visible conditions — stored as no conditions in the DB.
 *
 * Normalized shape: { lead_captured: { ruleId, rating?: { in: number[] }, temperature?: { in: string[] } } }
 * Backward-compatible: the evaluator already handles { gte }, { eq }, bare strings from older saves.
 */
export function triggerRuleConfigToJson(
  config: LeadCapturedTriggerRuleConfig
): Record<string, unknown> | null {
  if (isTriggerRuleConfigDefault(config)) return null;

  const ruleId = deriveTriggerRuleId(config);
  const ruleParts: Record<string, unknown> = { ruleId };

  if (config.ratings.length > 0) {
    ruleParts.rating = { in: config.ratings.map(Number) };
  }
  if (config.temperatures.length > 0) {
    ruleParts.temperature = { in: [...config.temperatures] };
  }

  return { lead_captured: ruleParts };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function uniqueValidStrings<T extends string>(
  values: readonly unknown[],
  allowed: readonly T[],
  normalize: (value: unknown) => string = (value) => String(value ?? "").trim()
): T[] {
  const allowedSet = new Set<string>(allowed);
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const normalized = normalize(value);
    if (!allowedSet.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized as T);
  }
  return result;
}

function parseRuleValues(ruleValue: unknown): unknown[] {
  const record = asRecord(ruleValue);
  if (Array.isArray(record.in)) return record.in;
  if (record.eq !== undefined) return [record.eq];
  if (record.gte !== undefined) return [record.gte];
  if (Array.isArray(ruleValue)) return ruleValue;
  if (ruleValue !== null && ruleValue !== undefined) return [ruleValue];
  return [];
}

/**
 * Converts persisted trigger_conditions_jsonb back to the UI multi-select config.
 * Also tolerates older single-value shapes such as { eq }, { gte }, and bare values.
 */
export function triggerRuleConfigFromJson(raw: unknown): LeadCapturedTriggerRuleConfig {
  const root = asRecord(raw);
  const rule = asRecord(root.lead_captured);
  if (Object.keys(rule).length === 0) {
    return { ...DEFAULT_TRIGGER_RULE_CONFIG };
  }

  return {
    ratings: uniqueValidStrings(parseRuleValues(rule.rating), ["1", "2", "3", "4", "5"], (value) =>
      String(Number(value))
    ),
    temperatures: uniqueValidStrings(parseRuleValues(rule.temperature), ["hot", "warm", "cold"]),
    statuses: uniqueValidStrings(parseRuleValues(rule.status), ["new", "follow_up", "closed"])
  };
}

/** Derives a deterministic ruleId from the UI config. */
function deriveTriggerRuleId(config: LeadCapturedTriggerRuleConfig): string {
  const parts: string[] = [];
  if (config.ratings.length > 0) parts.push(`rating-${config.ratings.join("-")}`);
  if (config.temperatures.length > 0) parts.push(`temp-${config.temperatures.join("-")}`);
  return `ui-${parts.join("-")}`;
}

/** Generates a plain-English run condition preview sentence. */
export function triggerRuleConfigPreview(config: LeadCapturedTriggerRuleConfig): string {
  if (isTriggerRuleConfigDefault(config)) {
    return "Runs for all captured leads";
  }

  const tempPart =
    config.temperatures.length > 0 ? config.temperatures.join(" or ") : null;

  let leadDesc = "leads";
  if (tempPart) {
    leadDesc = `${tempPart} leads`;
  }

  const suffix: string[] = [];
  if (config.ratings.length > 0) suffix.push(formatRatingLabel(config.ratings));

  return `Runs for ${leadDesc}${suffix.length > 0 ? " " + suffix.join(" ") : ""}`;
}

/** Short summary for the canvas trigger card chip. */
export function triggerRuleConfigCardSummary(config: LeadCapturedTriggerRuleConfig): string {
  if (isTriggerRuleConfigDefault(config)) return "All captured leads";

  const parts: string[] = [];
  if (config.ratings.length > 0) {
    parts.push(config.ratings.map((r) => `${r}★`).join("/"));
  }
  if (config.temperatures.length > 0) {
    parts.push(
      config.temperatures
        .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
        .join("/")
    );
  }
  return parts.join(" · ");
}

function formatRatingLabel(ratings: LeadRatingValue[]): string {
  if (ratings.length === 1) return `rated ${ratings[0]}★`;
  const labels = ratings.map((r) => `${r}★`);
  const last = labels.pop()!;
  return `rated ${labels.join(", ")} or ${last}`;
}
