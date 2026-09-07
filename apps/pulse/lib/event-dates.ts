/**
 * Canonical handling for event-level calendar dates.
 *
 * Event start/end are calendar dates chosen by an operator ("Sep 17"), not
 * instants. Date-only input is stored at 12:00 UTC so every display timezone
 * from UTC-11 through UTC+11 renders the same calendar date the operator
 * entered — UTC midnight storage is what made Sep 17 render as Sep 16 in
 * Eastern Time. Full datetime input (legacy callers) passes through unchanged.
 */

export const EVENT_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Human labels for event date fields, for validation copy. */
export const EVENT_DATE_FIELD_LABELS = {
  startDate: 'Start date',
  endDate: 'End date',
} as const

export type EventDateField = keyof typeof EVENT_DATE_FIELD_LABELS

export class EventDateInputError extends Error {}

/**
 * Parses operator date input for persistence.
 * - '' / null / undefined → null (date cleared)
 * - 'YYYY-MM-DD' → Date at 12:00 UTC (calendar-date preserving)
 * - anything else → Date via the platform parser; invalid input throws with a
 *   human field label, never a raw field key.
 */
export function parseEventDateInput(value: unknown, field: EventDateField): Date | null {
  if (value === undefined || value === null || value === '') return null
  const label = EVENT_DATE_FIELD_LABELS[field]
  if (typeof value !== 'string') {
    throw new EventDateInputError(`${label} must be a valid date`)
  }
  const trimmed = value.trim()
  if (EVENT_DATE_ONLY_PATTERN.test(trimmed)) {
    const parsed = new Date(`${trimmed}T12:00:00.000Z`)
    if (Number.isNaN(parsed.getTime())) {
      throw new EventDateInputError(`${label} must be a valid date`)
    }
    return parsed
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    throw new EventDateInputError(`${label} must be a valid date`)
  }
  return parsed
}

/**
 * Converts a stored event date to the canonical date-only input value
 * (YYYY-MM-DD) using the UTC date part. For canonical noon-UTC values this is
 * exact; for legacy midnight-UTC values it recovers the operator's intended
 * calendar date rather than repeating the local-time drift.
 */
export function eventDateToDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}
