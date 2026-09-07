/**
 * Compute the current "day N" of a live event from its start/end dates.
 *
 * This replaces the previously hardcoded `DAY 1` badge on Events Home. The rule
 * is deliberately conservative: if a trustworthy day number cannot be computed,
 * it returns `null` so the UI shows a plain `LIVE` badge instead of a misleading
 * day value.
 *
 * Timezone assumption: events do not currently carry a reliable per-event
 * timezone, so day boundaries are compared in UTC calendar dates. Both the event
 * start and "now" are floored to their UTC date before diffing. This keeps the
 * result stable and never off by more than a day for events near midnight; when
 * a real event/venue timezone becomes available it should be threaded in here.
 */

/** Milliseconds in one day. */
const DAY_MS = 24 * 60 * 60 * 1000

function toUtcMidnightMs(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Returns the 1-based day number of `now` within the event window, or `null`
 * when it cannot be computed safely (no start date, event not started yet, or
 * `now` is past a known end date).
 */
export function computeEventDay(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  const start = parseDate(startDate)
  if (!start) return null

  const startMs = toUtcMidnightMs(start)
  const nowMs = toUtcMidnightMs(now)

  // Event hasn't started (by calendar date) — no trustworthy day number.
  if (nowMs < startMs) return null

  const end = parseDate(endDate)
  if (end && nowMs > toUtcMidnightMs(end)) return null

  return Math.floor((nowMs - startMs) / DAY_MS) + 1
}

/**
 * Badge label for a live event, e.g. `Live · Day 2`. Falls back to `Live` when
 * the day number cannot be computed safely.
 */
export function formatLiveDayBadge(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  const day = computeEventDay(startDate, endDate, now)
  return day == null ? 'Live' : `Live · Day ${day}`
}
