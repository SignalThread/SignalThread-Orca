import {
  EventStatus,
  SurveyAvailabilityAnchor,
  SurveyAvailabilityMode,
  SurveyAvailabilityOverride,
} from '@prisma/client'

const MIN_OFFSET_MINUTES = -24 * 60
// Long post-session follow-up is a normal response-window use case. Keep a
// finite server-side bound, without arbitrarily limiting organizers to a week.
const MAX_OFFSET_MINUTES = 90 * 24 * 60

export type SurveyAvailabilityState = 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED' | 'INVALID'

export interface SurveyAvailabilityInput {
  mode: SurveyAvailabilityMode | string
  timezone?: string | null
  opensAt?: string | Date | null
  closesAt?: string | Date | null
  openAnchor?: SurveyAvailabilityAnchor | string | null
  closeAnchor?: SurveyAvailabilityAnchor | string | null
  openOffsetMinutes?: number | null
  closeOffsetMinutes?: number | null
  override?: SurveyAvailabilityOverride | string | null
}

export interface SurveyAvailabilityRecord {
  availabilityMode: SurveyAvailabilityMode
  availabilityTimezone: string | null
  availabilityOpensAt: Date | null
  availabilityClosesAt: Date | null
  availabilityOpenAnchor: SurveyAvailabilityAnchor | null
  availabilityCloseAnchor: SurveyAvailabilityAnchor | null
  availabilityOpenOffsetMinutes: number | null
  availabilityCloseOffsetMinutes: number | null
  availabilityOverride: SurveyAvailabilityOverride | null
}

export interface SurveyAvailabilityContext {
  survey: SurveyAvailabilityRecord
  eventStructureItem?: {
    startsAt: Date | null
    endsAt: Date | null
    timezone: string | null
  } | null
  locationTimezone?: string | null
  /** Event timing is the valid schedule basis for event/area/custom surveys. */
  eventTiming?: { startsAt: Date | null; endsAt: Date | null; timezone: string | null } | null
  allowEventTimingFallback?: boolean
  now?: Date
}

export interface SurveyAvailabilityResolution {
  state: SurveyAvailabilityState
  mode: SurveyAvailabilityMode
  timezone: string
  effectiveOpensAt: Date | null
  effectiveClosesAt: Date | null
  message: string
  issues: string[]
}

export interface SurveyLaunchReadinessInput extends SurveyAvailabilityContext {
  survey: SurveyAvailabilityRecord & { status: EventStatus | string }
  publicLink: { isActive: boolean; token?: string | null } | null
  targetActive: boolean
  questionCount: number
}

export interface SurveyLaunchReadiness {
  responseEligible: boolean
  availability: SurveyAvailabilityResolution
  issues: string[]
}

export class SurveyAvailabilityValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SurveyAvailabilityValidationError'
  }
}

export function normalizeSurveyAvailabilityInput(input?: SurveyAvailabilityInput | null): SurveyAvailabilityRecord {
  const mode = parseEnum(input?.mode ?? SurveyAvailabilityMode.OPEN_IMMEDIATELY, SurveyAvailabilityMode, 'availability mode')
  const override = input?.override
    ? parseEnum(input.override, SurveyAvailabilityOverride, 'availability override')
    : null

  if (mode === SurveyAvailabilityMode.OPEN_IMMEDIATELY) {
    return emptyAvailability(mode, override)
  }

  const timezone = requireTimezone(input?.timezone)

  if (mode === SurveyAvailabilityMode.CUSTOM_WINDOW) {
    const opensAt = requireDate(input?.opensAt, 'Opening time')
    const closesAt = requireDate(input?.closesAt, 'Closing time')
    if (opensAt.getTime() >= closesAt.getTime()) {
      throw new SurveyAvailabilityValidationError('Opening time must be before closing time')
    }
    return {
      ...emptyAvailability(mode, override),
      availabilityTimezone: timezone,
      availabilityOpensAt: opensAt,
      availabilityClosesAt: closesAt,
    }
  }

  const openAnchor = parseEnum(input?.openAnchor, SurveyAvailabilityAnchor, 'opening anchor')
  const closeAnchor = parseEnum(input?.closeAnchor, SurveyAvailabilityAnchor, 'closing anchor')
  const openOffsetMinutes = requireOffset(input?.openOffsetMinutes, 'Opening offset')
  const closeOffsetMinutes = requireOffset(input?.closeOffsetMinutes, 'Closing offset')

  return {
    ...emptyAvailability(mode, override),
    availabilityTimezone: timezone,
    availabilityOpenAnchor: openAnchor,
    availabilityCloseAnchor: closeAnchor,
    availabilityOpenOffsetMinutes: openOffsetMinutes,
    availabilityCloseOffsetMinutes: closeOffsetMinutes,
  }
}

export function resolveSurveyAvailability(context: SurveyAvailabilityContext): SurveyAvailabilityResolution {
  const { survey } = context
  const timezone = survey.availabilityTimezone
    || context.eventStructureItem?.timezone
    || context.locationTimezone
    || 'UTC'
  const issues: string[] = []

  if (!isValidTimezone(timezone)) {
    issues.push('Availability timezone is invalid')
  }

  let opensAt: Date | null = null
  let closesAt: Date | null = null

  if (survey.availabilityMode === SurveyAvailabilityMode.CUSTOM_WINDOW) {
    opensAt = validDateOrNull(survey.availabilityOpensAt)
    closesAt = validDateOrNull(survey.availabilityClosesAt)
    if (!opensAt) issues.push('Custom opening time is missing')
    if (!closesAt) issues.push('Custom closing time is missing')
  } else if (survey.availabilityMode === SurveyAvailabilityMode.RELATIVE_TO_EVENT_AREA) {
    // Sessions must keep their own schedule. Other target types can use the
    // event schedule when they have no inherent start/end time.
    const item = context.eventStructureItem?.startsAt && context.eventStructureItem?.endsAt
      ? context.eventStructureItem
      : context.allowEventTimingFallback ? context.eventTiming : null
    if (!item) {
      const message = 'Add a session date and time to enable automatic survey scheduling. You can still publish this survey manually.'
      return resolution('INVALID', survey.availabilityMode, timezone, null, null, message, [message])
    } else if (!item.startsAt || !item.endsAt) {
      const message = 'Add a session date and time to enable automatic survey scheduling. You can still publish this survey manually.'
      return resolution('INVALID', survey.availabilityMode, timezone, null, null, message, [message])
    } else {
      opensAt = resolveRelativeBoundary(item, survey.availabilityOpenAnchor, survey.availabilityOpenOffsetMinutes, 'opening', issues)
      closesAt = resolveRelativeBoundary(item, survey.availabilityCloseAnchor, survey.availabilityCloseOffsetMinutes, 'closing', issues)
    }
  }

  if (opensAt && closesAt && opensAt.getTime() >= closesAt.getTime()) {
    issues.push('Effective opening time must be before closing time')
  }

  if (survey.availabilityOverride === SurveyAvailabilityOverride.FORCE_CLOSED) {
    return resolution('CLOSED', survey.availabilityMode, timezone, opensAt, closesAt, 'This survey is currently closed.', issues)
  }
  if (issues.length > 0) {
    return resolution('INVALID', survey.availabilityMode, timezone, opensAt, closesAt, 'This survey is not available right now.', issues)
  }
  if (survey.availabilityOverride === SurveyAvailabilityOverride.FORCE_OPEN) {
    return resolution('OPEN', survey.availabilityMode, timezone, opensAt, closesAt, 'This survey is open.', issues)
  }

  const nowMs = (context.now ?? new Date()).getTime()
  if (opensAt && nowMs < opensAt.getTime()) {
    return resolution('NOT_YET_OPEN', survey.availabilityMode, timezone, opensAt, closesAt, `This survey opens ${formatAvailabilityDate(opensAt, timezone)}.`, issues)
  }
  if (closesAt && nowMs >= closesAt.getTime()) {
    return resolution('CLOSED', survey.availabilityMode, timezone, opensAt, closesAt, `This survey closed ${formatAvailabilityDate(closesAt, timezone)}.`, issues)
  }

  return resolution('OPEN', survey.availabilityMode, timezone, opensAt, closesAt, 'This survey is open.', issues)
}

export function resolveSurveyLaunchReadiness(input: SurveyLaunchReadinessInput): SurveyLaunchReadiness {
  const availability = resolveSurveyAvailability(input)
  const issues = [...availability.issues]
  if (input.survey.status === EventStatus.DRAFT) issues.push('Survey is unpublished')
  else if (input.survey.status === EventStatus.COMPLETED) issues.push('Survey collection is complete')
  else if (input.survey.status !== EventStatus.ACTIVE) issues.push('Survey is not active')
  if (!input.publicLink) issues.push('Public survey link is missing')
  else {
    if (!input.publicLink.isActive) issues.push('Public survey link is inactive')
    if (!input.publicLink.token) issues.push('Public survey token is missing')
  }
  if (!input.targetActive) issues.push('Event Area is inactive')
  if (input.questionCount < 1) issues.push('Survey has no questions')
  if (availability.state === 'NOT_YET_OPEN') issues.push('Survey is not yet open')
  if (availability.state === 'CLOSED') issues.push('Survey is closed')

  return {
    responseEligible: issues.length === 0 && availability.state === 'OPEN',
    availability,
    issues: Array.from(new Set(issues)),
  }
}

function emptyAvailability(
  mode: SurveyAvailabilityMode,
  override: SurveyAvailabilityOverride | null,
): SurveyAvailabilityRecord {
  return {
    availabilityMode: mode,
    availabilityTimezone: null,
    availabilityOpensAt: null,
    availabilityClosesAt: null,
    availabilityOpenAnchor: null,
    availabilityCloseAnchor: null,
    availabilityOpenOffsetMinutes: null,
    availabilityCloseOffsetMinutes: null,
    availabilityOverride: override,
  }
}

function resolveRelativeBoundary(
  item: { startsAt: Date | null; endsAt: Date | null },
  anchor: SurveyAvailabilityAnchor | null,
  offsetMinutes: number | null,
  label: string,
  issues: string[],
): Date | null {
  if (!anchor) {
    issues.push(`Relative ${label} anchor is missing`)
    return null
  }
  if (!Number.isInteger(offsetMinutes)) {
    issues.push(`Relative ${label} offset is missing`)
    return null
  }
  const anchorDate = anchor === SurveyAvailabilityAnchor.START ? item.startsAt : item.endsAt
  if (!anchorDate) {
    issues.push(`Event Area ${anchor === SurveyAvailabilityAnchor.START ? 'start' : 'end'} time is missing`)
    return null
  }
  return new Date(anchorDate.getTime() + (offsetMinutes as number) * 60_000)
}

function resolution(
  state: SurveyAvailabilityState,
  mode: SurveyAvailabilityMode,
  timezone: string,
  effectiveOpensAt: Date | null,
  effectiveClosesAt: Date | null,
  message: string,
  issues: string[],
): SurveyAvailabilityResolution {
  return { state, mode, timezone, effectiveOpensAt, effectiveClosesAt, message, issues }
}

function parseEnum<T extends Record<string, string>>(value: unknown, values: T, label: string): T[keyof T] {
  if (typeof value !== 'string' || !Object.values(values).includes(value)) {
    throw new SurveyAvailabilityValidationError(`Invalid ${label}`)
  }
  return value as T[keyof T]
}

function requireTimezone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || !isValidTimezone(value.trim())) {
    throw new SurveyAvailabilityValidationError('A valid IANA timezone is required')
  }
  return value.trim()
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function requireDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? value : new Date(typeof value === 'string' ? value : '')
  if (Number.isNaN(date.getTime())) throw new SurveyAvailabilityValidationError(`${label} is invalid`)
  return date
}

function validDateOrNull(value: Date | null): Date | null {
  return value && !Number.isNaN(value.getTime()) ? value : null
}

function requireOffset(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < MIN_OFFSET_MINUTES || (value as number) > MAX_OFFSET_MINUTES) {
    throw new SurveyAvailabilityValidationError(`${label} must be a whole number between ${MIN_OFFSET_MINUTES} and ${MAX_OFFSET_MINUTES} minutes`)
  }
  return value as number
}

function formatAvailabilityDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: isValidTimezone(timezone) ? timezone : 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
