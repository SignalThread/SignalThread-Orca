const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateParts(value: string): { year: number; month: number; day: number } | null {
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

/** Parses an Event calendar date without converting through the browser timezone. */
export function parseEventDateOnly(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parts = dateParts(value);
  return parts ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day)) : null;
}

/** Serializes a persisted Event date as the calendar day stored by the Event record. */
export function serializeEventDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || typeof value === "undefined") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  return parseEventDateOnly(value) ? value : null;
}
