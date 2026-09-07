export type SupplyQuantityRule = "PER_ATTENDEE" | "PER_TABLE" | "PER_STATION" | "FIXED" | "MANUAL";
export type SupplyFulfillment = "PLANNED" | "CONFIRMED" | "PACKED" | "DELIVERED" | "SET";
export type SupplyReadiness = "not_needed" | "needs_info" | "needs_work" | "blocked" | "ready";

export type SupplySuggestionInput = {
  attendance?: number | null;
  tables?: number | null;
  stations?: number | null;
  quantityRule: SupplyQuantityRule;
  quantityFactor?: number | null;
  fixedQuantity?: number | null;
};

export function calculateSuggestedQuantity(input: SupplySuggestionInput): number | null {
  const factor = input.quantityFactor ?? 1;
  const calculate = (basis: number | null | undefined) => basis == null ? null : Math.max(0, Math.ceil(basis * factor));
  if (input.quantityRule === "PER_ATTENDEE") return calculate(input.attendance);
  if (input.quantityRule === "PER_TABLE") return calculate(input.tables);
  if (input.quantityRule === "PER_STATION") return calculate(input.stations);
  if (input.quantityRule === "FIXED") return input.fixedQuantity ?? null;
  return null;
}

export function inferSupplyContexts(input: { sessionName?: string | null; setupType?: string | null; mealPeriod?: string | null; fnbNotes?: string | null }) {
  const text = [input.sessionName, input.setupType, input.mealPeriod, input.fnbNotes].filter(Boolean).join(" ").toLowerCase();
  const contexts = new Set<string>();
  if (/meal|lunch|dinner|breakfast|reception|buffet|food/.test(text)) contexts.add("MEAL_SERVICE");
  if (/workshop|breakout|training|classroom/.test(text)) contexts.add("WORKSHOP");
  if (/registration|arrival|check.?in/.test(text)) contexts.add("REGISTRATION");
  if (/sponsor|activation|expo|exhibit/.test(text)) contexts.add("SPONSOR");
  if (/general|keynote|plenary|session|presentation/.test(text) || contexts.size === 0) contexts.add("GENERAL_SESSION");
  contexts.add("ACCESSIBILITY");
  return [...contexts];
}

export function deriveSupplyReadiness(input: {
  notNeeded: boolean;
  allocations: Array<{ quantity: number | null; source: string | null; responsibleUserId: string | null; setupDeadline: Date | string | null; fulfillment: SupplyFulfillment; blocking: boolean }>;
  sessionStart?: Date | string | null;
}): SupplyReadiness {
  if (input.notNeeded) return "not_needed";
  if (input.allocations.some((item) => item.blocking)) return "blocked";
  if (input.allocations.length === 0) return "needs_info";
  if (input.allocations.some((item) => item.quantity == null || item.quantity <= 0 || !item.source || !item.responsibleUserId || !item.setupDeadline)) return "needs_info";
  const sessionStart = input.sessionStart ? new Date(input.sessionStart).getTime() : null;
  if (sessionStart != null && input.allocations.some((item) => item.setupDeadline && new Date(item.setupDeadline).getTime() > sessionStart)) return "blocked";
  if (input.allocations.every((item) => item.fulfillment === "DELIVERED" || item.fulfillment === "SET")) return "ready";
  return "needs_work";
}

export function supplyWarningCodes(input: { committed: number | null; allocated: number; missingInfo: boolean; blocked: boolean; timingRisk: boolean }) {
  return [
    input.missingInfo ? "MISSING_INFO" : null,
    input.blocked ? "BLOCKED" : null,
    input.committed != null && input.allocated > input.committed ? "OVER_ALLOCATED" : null,
    input.timingRisk ? "TIMING_RISK" : null,
  ].filter((value): value is string => Boolean(value));
}
