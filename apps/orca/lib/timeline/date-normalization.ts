const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T/;

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function toDateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateOnlyParts(value: string): { year: number; month: number; day: number } | null {
  if (!DATE_ONLY_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function normalizeDisplayDate(value: string): string | null {
  const displayDateMatch = value.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!displayDateMatch) return null;

  const [, monthName, dayValue, yearValue] = displayDateMatch;
  const month = MONTH_NAME_TO_NUMBER[monthName.toLowerCase()];
  const day = Number(dayValue);
  const year = Number(yearValue);

  if (!month || !Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(year)) {
    return null;
  }

  return toDateOnly(year, month, day);
}

export function normalizeTimelineDateInput(value: unknown): string | null {
  if (value === null || typeof value === "undefined") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toDateOnly(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;
  if (DATE_ONLY_PATTERN.test(raw)) return raw;

  const isoDateTimeMatch = raw.match(ISO_DATE_TIME_PATTERN);
  if (isoDateTimeMatch) return isoDateTimeMatch[1];

  const displayDate = normalizeDisplayDate(raw);
  if (displayDate) return displayDate;

  const slashDateMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDateMatch) {
    const [, monthValue, dayValue, yearValue] = slashDateMatch;
    const month = Number(monthValue);
    const day = Number(dayValue);
    const year = Number(yearValue);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && Number.isInteger(year)) {
      return toDateOnly(year, month, day);
    }
  }

  return raw;
}

/**
 * Parses a Roadmap calendar date without ever interpreting it in the browser's
 * local timezone. Roadmap start/end dates are date-only values, not moments.
 */
export function parseTimelineDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = normalizeTimelineDateInput(value);
  if (!normalized) return null;
  const parts = parseDateOnlyParts(normalized);
  return parts ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day)) : null;
}

/** Serializes a persisted UTC-midnight date as the canonical YYYY-MM-DD API value. */
export function serializeTimelineDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || typeof value === "undefined") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toDateOnly(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  const parsed = parseTimelineDateOnly(value);
  return parsed ? toDateOnly(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate()) : null;
}

/** Display a Roadmap calendar date in UTC so every browser timezone sees the same day. */
export function formatTimelineDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
): string {
  const date = parseTimelineDateOnly(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
}

/** Current local calendar day represented as a UTC date-only value. */
export function timelineTodayDateOnly(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Replaces Date fields with canonical date-only values before a Roadmap API response. */
export function serializeTimelineItemDates<T extends { startDate: Date | null; endDate: Date | null }>(item: T): Omit<T, "startDate" | "endDate"> & {
  startDate: string | null;
  endDate: string | null;
} {
  return {
    ...item,
    startDate: serializeTimelineDateOnly(item.startDate),
    endDate: serializeTimelineDateOnly(item.endDate),
  };
}

export function normalizeTimelineDatePatch<T extends { startDate?: unknown; endDate?: unknown; dueDate?: unknown }>(
  patch: T,
): T {
  const next: Record<string, unknown> = { ...patch };

  if (Object.prototype.hasOwnProperty.call(patch, "startDate")) {
    next.startDate = normalizeTimelineDateInput(patch.startDate);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "endDate")) {
    next.endDate = normalizeTimelineDateInput(patch.endDate);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "dueDate")) {
    next.dueDate = normalizeTimelineDateInput(patch.dueDate);
  }

  return next as T;
}
