export const EVENT_CATEGORY_OPTIONS = [
  "F&B",
  "AV",
  "Rooms",
  "Staffing",
  "Production",
  "Decor",
] as const;

export type EventCategory = (typeof EVENT_CATEGORY_OPTIONS)[number];

const EVENT_CATEGORY_SET = new Set<string>(EVENT_CATEGORY_OPTIONS.map((value) => value.toUpperCase()));

const CATEGORY_ALIAS_MAP: Record<string, EventCategory> = {
  "F&B": "F&B",
  FNB: "F&B",
  "FOOD & BEVERAGE": "F&B",
  "FOOD AND BEVERAGE": "F&B",
  CATERING: "F&B",

  AV: "AV",
  "A/V": "AV",
  "AUDIO VISUAL": "AV",
  AUDIOVISUAL: "AV",

  ROOMS: "Rooms",
  ROOM: "Rooms",
  HOUSING: "Rooms",
  "SLEEPING ROOMS": "Rooms",
  VENUE: "Rooms",

  STAFFING: "Staffing",
  STAFF: "Staffing",
  REGISTRATION: "Staffing",
  VENDOR: "Staffing",
  VENDORS: "Staffing",

  PRODUCTION: "Production",
  GENERAL: "Production",
  LOGISTICS: "Production",
  MARKETING: "Production",
  OPS: "Production",
  OPERATIONS: "Production",
  OTHER: "Production",

  DECOR: "Decor",
  DECORATION: "Decor",
  DESIGN: "Decor",
};

function normalizeCategoryLookupKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\band\b/gi, "&")
    .toUpperCase();
}

export function isEventCategory(value: string): value is EventCategory {
  return EVENT_CATEGORY_SET.has(value.toUpperCase());
}

export function resolveEventCategory(value: string | null | undefined): EventCategory | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  if (isEventCategory(trimmed)) {
    return EVENT_CATEGORY_OPTIONS.find((category) => category.toUpperCase() === trimmed.toUpperCase()) ?? null;
  }

  const lookup = normalizeCategoryLookupKey(trimmed);
  return CATEGORY_ALIAS_MAP[lookup] ?? null;
}

export function normalizeEventCategory(
  value: string | null | undefined,
  fallback: EventCategory = "Production",
): EventCategory {
  return resolveEventCategory(value) ?? fallback;
}

export function getEventCategoryDisplay(value: string | null | undefined): string {
  return resolveEventCategory(value) ?? normalizeEventCategory(value);
}
