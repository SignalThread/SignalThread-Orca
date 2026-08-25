import { FALLBACK_EVENT_CREATION_TIMEZONE } from "@/lib/timezones";

export type EventTimezoneSource = "event" | "application_fallback" | "utc_fallback";

export type EventDateBoundaries = {
  resolvedTimezone: string;
  timezoneSource: EventTimezoneSource;
  referenceInstant: string;
  localDate: string;
  todayStart: string;
  tomorrowStart: string;
  weekStart: string;
  weekEndExclusive: string;
  weekStartsOn: "monday";
};

type CalendarDate = { year: number; month: number; day: number };
type ZonedDateTimeParts = CalendarDate & { hour: number; minute: number; second: number };

function isValidTimezone(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}
export function resolveEventTimezone(
  eventTimezone: string | null | undefined,
  applicationFallback = FALLBACK_EVENT_CREATION_TIMEZONE,
): { resolvedTimezone: string; timezoneSource: EventTimezoneSource } {
  if (isValidTimezone(eventTimezone)) {
    return { resolvedTimezone: eventTimezone, timezoneSource: "event" };
  }
  if (isValidTimezone(applicationFallback)) {
    return { resolvedTimezone: applicationFallback, timezoneSource: "application_fallback" };
  }
  return { resolvedTimezone: "UTC", timezoneSource: "utc_fallback" };
}

function zonedParts(instant: Date, timezone: string): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function calendarDateString(value: CalendarDate): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function addCalendarDays(value: CalendarDate, days: number): CalendarDate {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function isoWeekday(value: CalendarDate): number {
  const weekday = new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/**
 * Converts a local wall-clock value into an instant without mutating process TZ.
 * Midnight is unambiguous in supported IANA zones used by Orca; the short
 * fixed-point loop also accounts for DST offset changes between adjacent days.
 */
function localDateTimeToInstant(value: ZonedDateTimeParts, timezone: string): Date {
  const desired = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
  let candidate = desired;
  for (let index = 0; index < 4; index += 1) {
    const actual = zonedParts(new Date(candidate), timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const adjustment = desired - actualAsUtc;
    if (adjustment === 0) break;
    candidate += adjustment;
  }
  return new Date(candidate);
}

function startOfCalendarDate(value: CalendarDate, timezone: string): Date {
  return localDateTimeToInstant({ ...value, hour: 0, minute: 0, second: 0 }, timezone);
}

function parseCalendarDate(value: string): CalendarDate {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function getEventDateBoundaries(
  referenceInstant: Date,
  eventTimezone: string | null | undefined,
  applicationFallback = FALLBACK_EVENT_CREATION_TIMEZONE,
): EventDateBoundaries {
  if (Number.isNaN(referenceInstant.getTime())) throw new Error("referenceInstant must be a valid Date");
  const resolution = resolveEventTimezone(eventTimezone, applicationFallback);
  const current = zonedParts(referenceInstant, resolution.resolvedTimezone);
  const today: CalendarDate = { year: current.year, month: current.month, day: current.day };
  const tomorrow = addCalendarDays(today, 1);
  const monday = addCalendarDays(today, 1 - isoWeekday(today));
  const nextMonday = addCalendarDays(monday, 7);

  return {
    ...resolution,
    referenceInstant: referenceInstant.toISOString(),
    localDate: calendarDateString(today),
    todayStart: startOfCalendarDate(today, resolution.resolvedTimezone).toISOString(),
    tomorrowStart: startOfCalendarDate(tomorrow, resolution.resolvedTimezone).toISOString(),
    weekStart: startOfCalendarDate(monday, resolution.resolvedTimezone).toISOString(),
    weekEndExclusive: startOfCalendarDate(nextMonday, resolution.resolvedTimezone).toISOString(),
    weekStartsOn: "monday",
  };
}

export function isDateOnlyOverdue(dateOnly: string, boundaries: EventDateBoundaries): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) && dateOnly < boundaries.localDate;
}

export function isInstantOverdue(dueAt: Date, boundaries: EventDateBoundaries): boolean {
  return dueAt.getTime() < new Date(boundaries.referenceInstant).getTime();
}

export function isInstantToday(dueAt: Date, boundaries: EventDateBoundaries): boolean {
  const value = dueAt.getTime();
  return value >= new Date(boundaries.todayStart).getTime() && value < new Date(boundaries.tomorrowStart).getTime();
}

export function isInstantThisWeek(dueAt: Date, boundaries: EventDateBoundaries): boolean {
  const value = dueAt.getTime();
  return value >= new Date(boundaries.referenceInstant).getTime() && value < new Date(boundaries.weekEndExclusive).getTime();
}

export function eventCalendarDayStart(boundaries: EventDateBoundaries, dayOffset: number): Date {
  const date = addCalendarDays(parseCalendarDate(boundaries.localDate), dayOffset);
  return startOfCalendarDate(date, boundaries.resolvedTimezone);
}

export function calendarDayDistanceToInstant(dueAt: Date, boundaries: EventDateBoundaries): number {
  const due = zonedParts(dueAt, boundaries.resolvedTimezone);
  const current = parseCalendarDate(boundaries.localDate);
  const dueDay = Date.UTC(due.year, due.month - 1, due.day);
  const currentDay = Date.UTC(current.year, current.month - 1, current.day);
  return Math.round((dueDay - currentDay) / (24 * 60 * 60 * 1000));
}
