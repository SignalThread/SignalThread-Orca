import { safeTimeZone } from "./lifecycle";

/**
 * "Nov 3–5, 2026", "Nov 30 – Dec 2, 2026", "Dec 30, 2026 – Jan 2, 2027" or
 * "Nov 3, 2026". Null when the event has no dates at all.
 */
export function formatDateRange(
  startsAt: string | null,
  endsAt: string | null,
  timeZone?: string | null,
): string | null {
  const start = toDate(startsAt);
  const end = toDate(endsAt);
  if (!start && !end) return null;
  const a = start ?? end!;
  const b = end ?? start!;
  const tz = safeTimeZone(timeZone);

  const month = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(d);
  const day = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(d);
  const year = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(d);

  if (year(a) !== year(b)) return `${month(a)} ${day(a)}, ${year(a)} – ${month(b)} ${day(b)}, ${year(b)}`;
  if (month(a) !== month(b)) return `${month(a)} ${day(a)} – ${month(b)} ${day(b)}, ${year(a)}`;
  if (day(a) !== day(b)) return `${month(a)} ${day(a)}–${day(b)}, ${year(a)}`;
  return `${month(a)} ${day(a)}, ${year(a)}`;
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Active" from "ACTIVE", "Needs review" from "NEEDS_REVIEW". */
export function humanizeStatus(status: string): string {
  const lower = status.trim().toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Tabular counts: 1,204. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
