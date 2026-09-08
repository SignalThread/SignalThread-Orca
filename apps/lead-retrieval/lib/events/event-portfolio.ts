/**
 * Account Command Center portfolio helpers for `/app/events`.
 *
 * Groups a company's accessible events with the canonical Event Workspace
 * lifecycle resolver and orders each group deterministically.
 */

export type EventPortfolioLifecycle = "live" | "upcoming" | "completed" | "unknown";

import { resolveEventLifecycle } from "@/lib/events/event-lifecycle";

export type EventPortfolioEventLike = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  container_kind: string | null;
  timezone?: string | null;
};

export type EventPortfolioGroups<T extends EventPortfolioEventLike> = {
  live: T[];
  upcoming: T[];
  completed: T[];
  unknown: T[];
};

/**
 * Render order for the portfolio sections: Live → Upcoming → Completed, with
 * the honesty bucket for unrecognized statuses trailing (normally empty).
 */
export const EVENT_PORTFOLIO_GROUP_ORDER: readonly EventPortfolioLifecycle[] = [
  "live",
  "upcoming",
  "completed",
  "unknown"
];

export const EVENT_PORTFOLIO_GROUP_LABEL: Record<EventPortfolioLifecycle, string> = {
  live: "Live",
  upcoming: "Upcoming",
  completed: "Completed",
  unknown: "Other"
};

/**
 * Canonical portfolio lifecycle. This deliberately delegates to the exact
 * resolver used by the Event Workspace so a server-rendered account card and
 * its selected workspace cannot disagree at a UTC date boundary.
 */
export function eventPortfolioLifecycleForEvent(
  event: EventPortfolioEventLike,
  todayYmd: string,
  todayByEvent?: ReadonlyMap<string, string>
): EventPortfolioLifecycle {
  const eventToday = todayByEvent ? todayByEvent.get(event.id) : todayYmd;
  return eventToday ? resolveEventLifecycle(event, eventToday).state : "unknown";
}

/** Deterministic, locale-independent code-point comparison. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Stable tiebreak: name, then id (both code-point order). */
function compareByNameThenId(a: EventPortfolioEventLike, b: EventPortfolioEventLike): number {
  return compareStrings(a.name, b.name) || compareStrings(a.id, b.id);
}

/**
 * ISO `YYYY-MM-DD` date columns compare correctly as strings.
 * Nulls always sort after dated entries, in both directions.
 */
function compareNullableDates(
  a: string | null,
  b: string | null,
  direction: "asc" | "desc"
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const cmp = compareStrings(a, b);
  return direction === "asc" ? cmp : -cmp;
}

/** The most relevant single date for a live or completed event: end date, else start date. */
function relevantEventDate(event: EventPortfolioEventLike): string | null {
  return event.end_date ?? event.start_date;
}

/** Live: ending soonest first (end date, else start date); null dates last; stable tiebreak. */
function compareLiveEvents(a: EventPortfolioEventLike, b: EventPortfolioEventLike): number {
  return (
    compareNullableDates(relevantEventDate(a), relevantEventDate(b), "asc") ||
    compareByNameThenId(a, b)
  );
}

/** Upcoming: nearest start date first; null start dates last; stable tiebreak. */
function compareUpcomingEvents(a: EventPortfolioEventLike, b: EventPortfolioEventLike): number {
  return compareNullableDates(a.start_date, b.start_date, "asc") || compareByNameThenId(a, b);
}

/** Completed: most recently completed first (end date, else start date); null dates last. */
function compareCompletedEvents(a: EventPortfolioEventLike, b: EventPortfolioEventLike): number {
  return (
    compareNullableDates(relevantEventDate(a), relevantEventDate(b), "desc") ||
    compareByNameThenId(a, b)
  );
}

/**
 * Groups events with the canonical lifecycle resolver and sorts each group
 * deterministically. `todayYmd` is supplied by the server page so no client
 * clock independently classifies an event.
 * Does not mutate the input array or its elements.
 */
export function groupEventsForPortfolio<T extends EventPortfolioEventLike>(
  events: readonly T[],
  todayYmd: string,
  todayByEvent?: ReadonlyMap<string, string>
): EventPortfolioGroups<T> {
  const live: T[] = [];
  const upcoming: T[] = [];
  const completed: T[] = [];
  const unknown: T[] = [];

  for (const event of events) {
    const lifecycle = eventPortfolioLifecycleForEvent(event, todayYmd, todayByEvent);
    if (lifecycle === "live") live.push(event);
    else if (lifecycle === "upcoming") upcoming.push(event);
    else if (lifecycle === "completed") completed.push(event);
    else unknown.push(event);
  }

  live.sort(compareLiveEvents);
  upcoming.sort(compareUpcomingEvents);
  completed.sort(compareCompletedEvents);
  unknown.sort(compareByNameThenId);

  return { live, upcoming, completed, unknown };
}

/**
 * Canonical open-event destination from the account portfolio.
 * Mirrors the pre-existing `/app/events/{id}` link target on this page.
 */
export function exhibitorOpenEventHref(eventId: string): string {
  const id = String(eventId ?? "").trim();
  if (!id) return "/app/events";
  return `/app/events/${encodeURIComponent(id)}`;
}
