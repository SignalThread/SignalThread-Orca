/**
 * Canonical event lifecycle resolution for the Event Workspace.
 *
 * One deterministic answer to "is this event upcoming, live, or completed?",
 * driven by real event data. Precedence (see EVENT_WORKSPACE_REPLACEMENT_AUDIT.md §5):
 *
 *   1. `container_kind = 'continuous_capture'` → live (ongoing capture bucket).
 *   2. Stored `status = 'COMPLETED'` → completed. An operator can close an event
 *      early; the explicit terminal state is honored even inside the date range.
 *      The reverse never holds: a stale ACTIVE/UPCOMING does not survive date
 *      correction, because `events.status` is written at creation and never
 *      advanced afterwards.
 *   3. Both dates → date-derived on the caller-supplied event-local calendar
 *      day (lexical `YYYY-MM-DD` comparison):
 *      before start → upcoming; after end → completed; else live.
 *      Start day and end day are inclusive (the event is live on both).
 *   4. One date → the comparable half of rule 3; the open side defaults to live.
 *   5. No dates → stored status (ACTIVE → live, UPCOMING → upcoming). Anything
 *      else — including malformed status — resolves to upcoming: Event Readiness
 *      is the safest honest state, where "event dates missing" surfaces as the
 *      top blocker instead of guessing a live or completed body.
 *
 * The server resolves the caller-supplied day from `events.timezone`. No
 * user-facing lifecycle switch exists — this helper is the single source of truth.
 */

import { isContinuousCaptureContainerKind, normalizeEventContainerKind } from "@/lib/events/event-container-kind";

export type EventWorkspaceLifecycle = "upcoming" | "live" | "completed";

export type EventLifecycleReason =
  | "continuous_capture"
  | "explicit_completed"
  | "date_range"
  | "status_fallback"
  | "default_upcoming";

export type EventLifecycleSource = {
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  container_kind: string | null;
};

export type EventLifecycleResolution = {
  state: EventWorkspaceLifecycle;
  reason: EventLifecycleReason;
};

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A trimmed `YYYY-MM-DD` string, or null for anything absent or malformed. */
export function normalizeYmd(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!YMD_PATTERN.test(trimmed)) return null;
  // Reject impossible calendar dates (e.g. 2026-13-40) that pass the pattern.
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}

/** Compatibility fallback for callers without an event-scoped calendar day. */
export function currentUtcYmd(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function resolveEventLifecycle(
  source: EventLifecycleSource,
  todayYmd: string
): EventLifecycleResolution {
  const today = normalizeYmd(todayYmd) ?? currentUtcYmd();
  const start = normalizeYmd(source.start_date);
  const end = normalizeYmd(source.end_date);
  const status = String(source.status ?? "").trim().toUpperCase();

  if (isContinuousCaptureContainerKind(normalizeEventContainerKind(source.container_kind))) {
    return { state: "live", reason: "continuous_capture" };
  }

  if (status === "COMPLETED") {
    return { state: "completed", reason: "explicit_completed" };
  }

  if (start !== null && end !== null) {
    if (today < start) return { state: "upcoming", reason: "date_range" };
    if (today > end) return { state: "completed", reason: "date_range" };
    return { state: "live", reason: "date_range" };
  }

  if (start !== null) {
    return today < start
      ? { state: "upcoming", reason: "date_range" }
      : { state: "live", reason: "date_range" };
  }

  if (end !== null) {
    return today > end
      ? { state: "completed", reason: "date_range" }
      : { state: "live", reason: "date_range" };
  }

  if (status === "ACTIVE") return { state: "live", reason: "status_fallback" };
  if (status === "UPCOMING") return { state: "upcoming", reason: "status_fallback" };
  return { state: "upcoming", reason: "default_upcoming" };
}

/** Whole-day difference between two normalized `YYYY-MM-DD` values (b − a). */
function daysBetweenYmd(a: string, b: string): number {
  const toUtc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/**
 * Short timing context for the workspace shell: "Opens in 5 days",
 * "Day 2 of 3", "Wrapped 4 days ago". Null when the dates can't support the
 * claim — never an invented countdown.
 */
export function describeEventTiming(
  source: EventLifecycleSource,
  todayYmd: string,
  state: EventWorkspaceLifecycle
): string | null {
  const today = normalizeYmd(todayYmd) ?? currentUtcYmd();
  const start = normalizeYmd(source.start_date);
  const end = normalizeYmd(source.end_date);

  if (isContinuousCaptureContainerKind(normalizeEventContainerKind(source.container_kind))) {
    return null;
  }

  if (state === "upcoming") {
    if (start === null) return null;
    const days = daysBetweenYmd(today, start);
    if (days <= 0) return null;
    if (days === 1) return "Opens tomorrow";
    return `Opens in ${days} days`;
  }

  if (state === "live") {
    if (start === null || today < start) return null;
    const dayNumber = daysBetweenYmd(start, today) + 1;
    if (end !== null && end >= start) {
      const totalDays = daysBetweenYmd(start, end) + 1;
      if (dayNumber >= 1 && dayNumber <= totalDays) {
        return `Day ${dayNumber} of ${totalDays}`;
      }
      return null;
    }
    return dayNumber >= 1 ? `Day ${dayNumber}` : null;
  }

  const reference = end ?? start;
  if (reference === null) return null;
  const daysAgo = daysBetweenYmd(reference, today);
  if (daysAgo < 0) return null;
  if (daysAgo === 0) return "Wrapped today";
  if (daysAgo === 1) return "Wrapped yesterday";
  return `Wrapped ${daysAgo} days ago`;
}
