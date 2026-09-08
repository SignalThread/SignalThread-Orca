export const LEAD_TEMPERATURE_VALUES = ["hot", "warm", "cold"] as const;

export type LeadTemperature = (typeof LEAD_TEMPERATURE_VALUES)[number];

const LEAD_TEMPERATURE_SET = new Set<string>(LEAD_TEMPERATURE_VALUES);

function toNormalized(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isLeadTemperature(value: unknown): value is LeadTemperature {
  return LEAD_TEMPERATURE_SET.has(toNormalized(value));
}

export function parseLeadTemperature(value: unknown): LeadTemperature | null {
  const normalized = toNormalized(value);
  if (LEAD_TEMPERATURE_SET.has(normalized)) {
    return normalized as LeadTemperature;
  }
  return null;
}

export function legacyPriorityScoreToLeadTemperature(score: number): LeadTemperature {
  if (!Number.isFinite(score)) return "warm";
  if (score >= 67) return "hot";
  if (score >= 34) return "warm";
  return "cold";
}

export function leadTemperatureToLegacyPriorityScore(temperature: LeadTemperature): number {
  switch (temperature) {
    case "hot":
      return 85;
    case "warm":
      return 50;
    case "cold":
      return 20;
  }
}

export function legacyPriorityLabelToLeadTemperature(value: unknown): LeadTemperature | null {
  const normalized = toNormalized(value);
  if (!normalized) return null;
  if (normalized === "high" || normalized === "hot") return "hot";
  if (normalized === "medium" || normalized === "normal" || normalized === "unscored") return "warm";
  if (normalized === "low" || normalized === "cold") return "cold";
  return null;
}

export function resolveLeadTemperature(
  rawTemperature: unknown,
  legacyPriorityScore: unknown
): LeadTemperature {
  const direct = parseLeadTemperature(rawTemperature);
  if (direct) return direct;
  const score = Number(legacyPriorityScore);
  return legacyPriorityScoreToLeadTemperature(score);
}

export const LEAD_TEMPERATURE_LABEL: Record<LeadTemperature, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};
