import type { TimelinePlanningStage, TimelineWorkstream } from "@prisma/client";

/**
 * Canonical Timeline roadmap taxonomy.
 *
 * Workstreams are the top-level categories and planning stages are the
 * subcategories that power the Timeline Dashboard. These constants mirror the
 * additive Prisma enums `TimelineWorkstream` / `TimelinePlanningStage` and are
 * server-safe (no React) so both server services and client components can
 * import them.
 */

export const TIMELINE_WORKSTREAMS = [
  "VENUE",
  "HOUSING",
  "REGISTRATION",
  "SPEAKERS",
  "SPONSORS",
  "FNB",
  "PRODUCTION",
  "MARKETING",
] as const satisfies readonly TimelineWorkstream[];

export const TIMELINE_PLANNING_STAGES = [
  "PRE_PLANNING",
  "PLANNING",
  "BUILD",
  "SHOW_WEEK",
  "CLOSE",
] as const satisfies readonly TimelinePlanningStage[];

export const WORKSTREAM_LABELS: Record<TimelineWorkstream, string> = {
  VENUE: "Venue",
  HOUSING: "Housing",
  REGISTRATION: "Registration",
  SPEAKERS: "Speakers",
  SPONSORS: "Sponsors",
  FNB: "F&B",
  PRODUCTION: "Production",
  MARKETING: "Marketing",
};

export const PLANNING_STAGE_LABELS: Record<TimelinePlanningStage, string> = {
  PRE_PLANNING: "Pre-Planning",
  PLANNING: "Planning",
  BUILD: "Build",
  SHOW_WEEK: "Show Week",
  CLOSE: "Close",
};

/** Tailwind treatments per workstream for dashboard cards / pills. */
export const WORKSTREAM_THEME: Record<
  TimelineWorkstream,
  { badge: string; bar: string; dot: string }
> = {
  VENUE: { badge: "bg-teal-100 text-teal-700", bar: "bg-teal-500", dot: "bg-teal-500" },
  HOUSING: { badge: "bg-sky-100 text-sky-700", bar: "bg-sky-500", dot: "bg-sky-500" },
  REGISTRATION: { badge: "bg-indigo-100 text-indigo-700", bar: "bg-indigo-500", dot: "bg-indigo-500" },
  SPEAKERS: { badge: "bg-violet-100 text-violet-700", bar: "bg-violet-500", dot: "bg-violet-500" },
  SPONSORS: { badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500", dot: "bg-amber-500" },
  FNB: { badge: "bg-orange-100 text-orange-700", bar: "bg-orange-500", dot: "bg-orange-500" },
  PRODUCTION: { badge: "bg-blue-100 text-blue-700", bar: "bg-blue-500", dot: "bg-blue-500" },
  MARKETING: { badge: "bg-pink-100 text-pink-700", bar: "bg-pink-500", dot: "bg-pink-500" },
};

const WORKSTREAM_SET = new Set<string>(TIMELINE_WORKSTREAMS);
const PLANNING_STAGE_SET = new Set<string>(TIMELINE_PLANNING_STAGES);

/**
 * Best-effort mapping from the legacy free-text `department` field (and other
 * loose aliases) to a canonical workstream. Used only to bucket pre-taxonomy
 * items in read/display paths; the canonical source of truth remains the
 * `workstream` column.
 */
const WORKSTREAM_ALIASES: Record<string, TimelineWorkstream> = {
  VENUE: "VENUE",
  ROOMS: "VENUE",
  ROOM: "VENUE",
  HOUSING: "HOUSING",
  "SLEEPING ROOMS": "HOUSING",
  HOTEL: "HOUSING",
  REGISTRATION: "REGISTRATION",
  REG: "REGISTRATION",
  STAFFING: "REGISTRATION",
  STAFF: "REGISTRATION",
  SPEAKERS: "SPEAKERS",
  SPEAKER: "SPEAKERS",
  SPONSORS: "SPONSORS",
  SPONSOR: "SPONSORS",
  SPONSORSHIP: "SPONSORS",
  FNB: "FNB",
  "F&B": "FNB",
  "FOOD & BEVERAGE": "FNB",
  "FOOD AND BEVERAGE": "FNB",
  CATERING: "FNB",
  PRODUCTION: "PRODUCTION",
  AV: "PRODUCTION",
  "A/V": "PRODUCTION",
  "AUDIO VISUAL": "PRODUCTION",
  AUDIOVISUAL: "PRODUCTION",
  DECOR: "PRODUCTION",
  LOGISTICS: "PRODUCTION",
  OPS: "PRODUCTION",
  OPERATIONS: "PRODUCTION",
  GENERAL: "PRODUCTION",
  MARKETING: "MARKETING",
  COMMS: "MARKETING",
  COMMUNICATIONS: "MARKETING",
};

const PLANNING_STAGE_ALIASES: Record<string, TimelinePlanningStage> = {
  PRE_PLANNING: "PRE_PLANNING",
  "PRE PLANNING": "PRE_PLANNING",
  "PRE-PLANNING": "PRE_PLANNING",
  PREPLANNING: "PRE_PLANNING",
  PLANNING: "PLANNING",
  BUILD: "BUILD",
  PRODUCTION: "BUILD",
  SHOW_WEEK: "SHOW_WEEK",
  "SHOW WEEK": "SHOW_WEEK",
  SHOWWEEK: "SHOW_WEEK",
  ONSITE: "SHOW_WEEK",
  CLOSE: "CLOSE",
  CLOSEOUT: "CLOSE",
  WRAP: "CLOSE",
  POST: "CLOSE",
};

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/_/g, " ")
    .replace(/\band\b/gi, "&")
    .toUpperCase();
}

export function normalizeWorkstreamLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function workstreamLabelKey(value: string): string {
  return normalizeWorkstreamLabel(value).toLowerCase();
}

export type TimelineWorkstreamOption = {
  value: string;
  label: string;
  workstream: TimelineWorkstream | null;
  department: string | null;
  isCustom: boolean;
};

type TimelineWorkstreamSource = {
  workstream?: TimelineWorkstream | string | null;
  department?: string | null;
};

export function getWorkstreamDisplayKey(value: TimelineWorkstream | string | null | undefined): string | null {
  const normalized = normalizeWorkstreamLabel(value ?? "");
  if (!normalized) return null;
  return resolveWorkstream(normalized) ?? normalized;
}

export function isTimelineWorkstream(value: string): value is TimelineWorkstream {
  return WORKSTREAM_SET.has(value);
}

export function isTimelinePlanningStage(value: string): value is TimelinePlanningStage {
  return PLANNING_STAGE_SET.has(value);
}

/** Strict parse: only an exact enum value is accepted (used for API input). */
export function coerceWorkstream(value: string | null | undefined): TimelineWorkstream | null {
  if (!value) return null;
  return isTimelineWorkstream(value) ? value : null;
}

export function coercePlanningStage(value: string | null | undefined): TimelinePlanningStage | null {
  if (!value) return null;
  return isTimelinePlanningStage(value) ? value : null;
}

/** Lenient resolve: accepts enum values and legacy/loose aliases for display. */
export function resolveWorkstream(value: string | null | undefined): TimelineWorkstream | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (isTimelineWorkstream(trimmed)) return trimmed;
  const key = normalizeLookupKey(trimmed).replace(/ /g, "_");
  if (isTimelineWorkstream(key)) return key;
  return WORKSTREAM_ALIASES[normalizeLookupKey(trimmed)] ?? null;
}

export function resolvePlanningStage(value: string | null | undefined): TimelinePlanningStage | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (isTimelinePlanningStage(trimmed)) return trimmed;
  const key = normalizeLookupKey(trimmed).replace(/ /g, "_");
  if (isTimelinePlanningStage(key)) return key;
  return PLANNING_STAGE_ALIASES[normalizeLookupKey(trimmed)] ?? null;
}

export function getWorkstreamLabel(value: TimelineWorkstream | string | null | undefined): string {
  const resolved = typeof value === "string" ? resolveWorkstream(value) : value ?? null;
  if (resolved) return WORKSTREAM_LABELS[resolved];
  const custom = typeof value === "string" ? normalizeWorkstreamLabel(value) : "";
  return custom || "Unassigned";
}

export function buildTimelineWorkstreamOptions(items: TimelineWorkstreamSource[]): TimelineWorkstreamOption[] {
  const customByLabelKey = new Map<string, string>();
  const canonicalLabelKeys = new Set(Object.values(WORKSTREAM_LABELS).map(workstreamLabelKey));

  for (const item of items) {
    const rawValue = item.workstream ?? item.department;
    const resolved = resolveWorkstream(rawValue ?? null);
    if (resolved) {
      continue;
    }

    const label = normalizeWorkstreamLabel(item.department ?? "");
    if (!label) continue;

    const labelKey = workstreamLabelKey(label);
    if (canonicalLabelKeys.has(labelKey) || customByLabelKey.has(labelKey)) continue;
    customByLabelKey.set(labelKey, label);
  }

  // Canonical workstreams are the persistent event-level assignment taxonomy.
  // Their options must not disappear just because no current timeline item uses
  // one; item-derived labels are only used for legacy custom departments.
  const canonicalOptions = TIMELINE_WORKSTREAMS.map<TimelineWorkstreamOption>((workstream) => ({
    value: workstream,
    label: WORKSTREAM_LABELS[workstream],
    workstream,
    department: null,
    isCustom: false,
  }));

  const customOptions = Array.from(customByLabelKey.values())
    .sort((left, right) => left.localeCompare(right))
    .map<TimelineWorkstreamOption>((label) => ({
      value: label,
      label,
      workstream: null,
      department: label,
      isCustom: true,
    }));

  return [...canonicalOptions, ...customOptions];
}

export function getPlanningStageLabel(value: TimelinePlanningStage | string | null | undefined): string {
  const resolved = typeof value === "string" ? resolvePlanningStage(value) : value ?? null;
  return resolved ? PLANNING_STAGE_LABELS[resolved] : "Unscheduled";
}

export function getWorkstreamTheme(value: TimelineWorkstream | string | null | undefined): {
  badge: string;
  bar: string;
  dot: string;
} {
  const resolved = typeof value === "string" ? resolveWorkstream(value) : value ?? null;
  return resolved
    ? WORKSTREAM_THEME[resolved]
    : { badge: "bg-slate-100 text-slate-600", bar: "bg-slate-400", dot: "bg-slate-400" };
}
