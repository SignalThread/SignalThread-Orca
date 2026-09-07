import { eventLocalDateTimeToIso } from './event-agenda-time'

export type EventsHomeTimeBucket = 'live' | 'upcoming' | 'past'
export type EventLifecyclePhase = 'PRE_EVENT' | 'IN_EVENT' | 'POST_EVENT'
export type ResolvedEventLifecyclePhase = EventLifecyclePhase | null

export interface EventsHomeGroupableEvent {
  status: string
  startDate: string | Date | null
  endDate: string | Date | null
  isActive: boolean
  /** IANA timezone of the event venue, used for calendar-date event bounds. */
  timezone?: string | null
}

export interface EventsHomeGroups<TEvent extends EventsHomeGroupableEvent> {
  live: TEvent[]
  upcoming: TEvent[]
  past: TEvent[]
}

function toValidTime(value: string | Date | null): number | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? null : time
}

function isCalendarDateStorage(date: Date): boolean {
  return date.getUTCHours() === 12
    && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0
    && date.getUTCMilliseconds() === 0
}

function validTimezone(value: string | null | undefined): string {
  if (!value) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return value
  } catch {
    return 'UTC'
  }
}

function calendarDateBoundary(date: Date, boundary: 'start' | 'end', timezone: string): number {
  const calendarDate = date.toISOString().slice(0, 10)
  const wallTime = boundary === 'start' ? '00:00:00' : '23:59:59'
  try {
    const instant = new Date(eventLocalDateTimeToIso(`${calendarDate}T${wallTime}`, timezone)).getTime()
    return instant + (boundary === 'end' ? 999 : 0)
  } catch {
    return date.getTime()
  }
}

function lifecycleBoundary(value: string | Date | null, boundary: 'start' | 'end', timezone: string): number | null {
  const time = toValidTime(value)
  if (time === null || !value) return null
  const date = value instanceof Date ? value : new Date(value)
  return isCalendarDateStorage(date) ? calendarDateBoundary(date, boundary, timezone) : time
}

function getEventLifecycleBounds(event: EventsHomeGroupableEvent): {
  startAt: Date | null
  endAt: Date | null
} {
  const timezone = validTimezone(event.timezone)
  const start = lifecycleBoundary(event.startDate, 'start', timezone)
  const end = lifecycleBoundary(event.endDate, 'end', timezone)
  return {
    startAt: start === null ? null : new Date(start),
    endAt: end === null ? null : new Date(end),
  }
}

/**
 * Canonical lifecycle resolver for the Events intelligence workspace. A null
 * result means the configured dates do not establish a trustworthy phase yet;
 * callers must use neutral copy rather than guess a lifecycle state.
 */
export function resolveEventLifecyclePhase(
  event: EventsHomeGroupableEvent,
  now: Date = new Date(),
): ResolvedEventLifecyclePhase {
  const nowTime = now.getTime()
  const { startAt, endAt } = getEventLifecycleBounds(event)
  const startTime = startAt?.getTime() ?? null
  const endTime = endAt?.getTime() ?? null

  if (startTime !== null && startTime > nowTime) return 'PRE_EVENT'
  if (endTime !== null && endTime < nowTime) return 'POST_EVENT'
  if (startTime !== null && endTime !== null) return 'IN_EVENT'

  return null
}

/**
 * Backward-compatible Events Home status fallback. Workspace intelligence uses
 * resolveEventLifecyclePhase so missing/TBD dates never invent a phase.
 */
export function getEventLifecyclePhase(
  event: EventsHomeGroupableEvent,
  now: Date = new Date(),
): EventLifecyclePhase {
  return resolveEventLifecyclePhase(event, now) ?? 'PRE_EVENT'
}

export function getEventsHomeTimeBucket(
  event: EventsHomeGroupableEvent,
  now: Date = new Date(),
): EventsHomeTimeBucket {
  // Buckets derive from the canonical date-aware lifecycle rule so a future
  // event never reads as live purely because its stored status is ACTIVE.
  const phase = getEventLifecyclePhase(event, now)
  if (phase === 'IN_EVENT') return 'live'
  if (phase === 'POST_EVENT') return 'past'
  return 'upcoming'
}

/**
 * Canonical operator-facing status for an event, shared by Events Home rows
 * and workspace badges. One rule: dates + activity decide, never the raw
 * DRAFT/ACTIVE storage status on its own.
 */
export type EventDisplayStatus = 'live' | 'upcoming' | 'completed'

export function getEventDisplayStatusForPhase(phase: EventLifecyclePhase): EventDisplayStatus {
  if (phase === 'IN_EVENT') return 'live'
  if (phase === 'POST_EVENT') return 'completed'
  return 'upcoming'
}

export function getEventDisplayStatus(
  event: EventsHomeGroupableEvent,
  now: Date = new Date(),
): EventDisplayStatus {
  return getEventDisplayStatusForPhase(getEventLifecyclePhase(event, now))
}

export function groupEventsForHome<TEvent extends EventsHomeGroupableEvent>(
  events: TEvent[],
  now: Date = new Date(),
): EventsHomeGroups<TEvent> {
  return events.reduce<EventsHomeGroups<TEvent>>(
    (groups, event) => {
      groups[getEventsHomeTimeBucket(event, now)].push(event)
      return groups
    },
    { live: [], upcoming: [], past: [] },
  )
}
