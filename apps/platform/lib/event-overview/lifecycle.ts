/**
 * Where an event sits in its lifecycle, derived from its dates and the clock.
 *
 * One lifecycle clock is shared by every product on the dashboard: the Now
 * marker, the "74 days out" copy and the footer's lifecycle label all come from
 * here. Pure so every branch is testable without a database.
 */

export type EventLifecycle =
  | { phase: "unknown"; reason: "missing-dates" | "invalid-dates"; label: string; phaseLabel: string; markerPosition: null }
  | { phase: "before"; daysOut: number; label: string; phaseLabel: string; markerPosition: number }
  | { phase: "during"; dayIndex: number; dayCount: number; label: string; phaseLabel: string; markerPosition: number }
  | { phase: "after"; daysSince: number; label: string; phaseLabel: string; markerPosition: number };

const DAY_MS = 86_400_000;

/** How far ahead the Before third of the marker stretches. Beyond this the marker sits at the left edge. */
const PLANNING_HORIZON_DAYS = 180;
/** How far the After third stretches before the marker rests at the right edge. */
const WRAP_HORIZON_DAYS = 90;

/** The calendar day (as a UTC day number) an instant falls on in a timezone. */
function calendarDay(instant: Date, timeZone: string | null): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / DAY_MS);
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function deriveLifecycle(input: {
  startsAt: string | null;
  endsAt: string | null;
  timeZone?: string | null;
  now: Date;
}): EventLifecycle {
  const starts = parseInstant(input.startsAt);
  const ends = parseInstant(input.endsAt);
  if ((input.startsAt && !starts) || (input.endsAt && !ends) || (starts && ends && ends < starts)) {
    return { phase: "unknown", reason: "invalid-dates", label: "Check event dates", phaseLabel: "Dates need review", markerPosition: null };
  }
  if (!starts && !ends) {
    return { phase: "unknown", reason: "missing-dates", label: "Dates not set", phaseLabel: "Dates not set", markerPosition: null };
  }

  const tz = input.timeZone ?? null;
  const startDay = calendarDay(starts ?? ends!, tz);
  const endDay = Math.max(startDay, calendarDay(ends ?? starts!, tz));
  const today = calendarDay(input.now, tz);

  if (today < startDay) {
    const daysOut = startDay - today;
    const progress = 1 - Math.min(daysOut, PLANNING_HORIZON_DAYS) / PLANNING_HORIZON_DAYS;
    return {
      phase: "before",
      daysOut,
      label: daysOut === 1 ? "1 day out" : `${daysOut} days out`,
      phaseLabel: "Planning",
      markerPosition: round(progress / 3),
    };
  }

  if (today <= endDay) {
    const dayCount = endDay - startDay + 1;
    const dayIndex = today - startDay + 1;
    return {
      phase: "during",
      dayIndex,
      dayCount,
      label: dayCount === 1 ? "Live today" : `Live · day ${dayIndex} of ${dayCount}`,
      phaseLabel: "Live",
      markerPosition: round(1 / 3 + ((dayIndex - 0.5) / dayCount) / 3),
    };
  }

  const daysSince = today - endDay;
  const progress = Math.min(daysSince, WRAP_HORIZON_DAYS) / WRAP_HORIZON_DAYS;
  return {
    phase: "after",
    daysSince,
    label: daysSince === 1 ? "Wrapped yesterday" : `Wrapped ${daysSince} days ago`,
    phaseLabel: "Wrap-up",
    markerPosition: round(2 / 3 + progress / 3),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
