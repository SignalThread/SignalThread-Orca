export const EVENT_SETUP_TABS = ['overview', 'operations', 'surveys', 'deploy'] as const
const LEGACY_EVENT_SETUP_TABS = ['areas', 'agenda', 'speakers'] as const

export type EventSetupTab = (typeof EVENT_SETUP_TABS)[number]

export function parseEventSetupTab(value: string | null | undefined): EventSetupTab {
  if ((LEGACY_EVENT_SETUP_TABS as readonly string[]).includes(value ?? '')) return 'operations'
  return EVENT_SETUP_TABS.includes(value as EventSetupTab) ? value as EventSetupTab : 'overview'
}

export function buildEventSetupTabPath(eventId: string, accountSlug: string | null, tab: EventSetupTab) {
  const params = new URLSearchParams()
  if (accountSlug) params.set('account', accountSlug)
  params.set('tab', tab)
  return `/app/events/${encodeURIComponent(eventId)}?${params.toString()}`
}

export type AgendaReadinessStatus = 'NOT_STARTED' | 'IMPORT_IN_PROGRESS' | 'NEEDS_REVIEW' | 'READY'

export interface AgendaReadiness {
  status: AgendaReadinessStatus
  label: 'Not started' | 'Import in progress' | 'Needs review' | 'Ready'
  actionLabel: 'Import agenda' | 'Review import' | 'Manage agenda'
  detail: string
}

/** The resolved account-level consent payload used by the attendee entry screen. */
export interface AttendeeExperienceConsent {
  title?: string
  subtitle?: string
  items?: string[]
  buttonText?: string
  bulletStyle?: string
}

/**
 * The consent endpoint resolves safe legacy defaults. Treat that resolved
 * payload as the source of truth rather than recreating consent readiness
 * from event-local fields.
 */
export function isAttendeeExperienceConfigured(consent: AttendeeExperienceConsent | null | undefined): boolean {
  return Boolean(
    consent?.title?.trim()
      && consent?.buttonText?.trim()
      && consent.items?.some((item) => item.trim()),
  )
}

export function resolveAgendaReadiness({
  sessionCount,
  importState = null,
}: {
  sessionCount: number
  importState?: 'IN_PROGRESS' | 'NEEDS_REVIEW' | null
}): AgendaReadiness {
  if (importState === 'IN_PROGRESS') {
    return {
      status: 'IMPORT_IN_PROGRESS',
      label: 'Import in progress',
      actionLabel: 'Review import',
      detail: 'The agenda import is still being processed.',
    }
  }
  if (importState === 'NEEDS_REVIEW') {
    return {
      status: 'NEEDS_REVIEW',
      label: 'Needs review',
      actionLabel: 'Review import',
      detail: 'Imported agenda rows need a decision before they can be confirmed.',
    }
  }
  if (sessionCount > 0) {
    return {
      status: 'READY',
      label: 'Ready',
      actionLabel: 'Manage agenda',
      detail: `${sessionCount} agenda session${sessionCount === 1 ? '' : 's'} available.`,
    }
  }
  return {
    status: 'NOT_STARTED',
    label: 'Not started',
    actionLabel: 'Import agenda',
    detail: 'No agenda sessions have been added yet.',
  }
}

export interface EventSetupReadiness {
  eventDetailsReady: boolean
  eventAreasReady: boolean
  agenda: AgendaReadiness
  surveysReady: boolean
  attendeeExperienceReady: boolean
  deploymentReady: boolean
  collectionReady: boolean
  readyCount: number
  totalCount: number
}

export function deriveEventSetupReadiness({
  hasEventDetails,
  eventAreaCount,
  agendaSessionCount,
  agendaImportState,
  surveyCount,
  attendeeExperienceReady = true,
  launchableSurveyCount,
  uncoveredEventAreaCount,
}: {
  hasEventDetails: boolean
  eventAreaCount: number
  agendaSessionCount: number
  agendaImportState?: 'IN_PROGRESS' | 'NEEDS_REVIEW' | null
  surveyCount: number
  /**
   * Callers that have loaded the canonical consent configuration provide this
   * explicitly. The default preserves legacy non-workspace readiness callers
   * until they are migrated to load that account-scoped configuration.
   */
  attendeeExperienceReady?: boolean
  launchableSurveyCount: number
  uncoveredEventAreaCount: number
}): EventSetupReadiness {
  const eventAreasReady = eventAreaCount > 0
  const agenda = resolveAgendaReadiness({ sessionCount: agendaSessionCount, importState: agendaImportState })
  const agendaReady = agenda.status === 'READY'
  const surveysReady = surveyCount > 0
  const deploymentReady = launchableSurveyCount > 0
  const collectionReady = hasEventDetails
    && eventAreasReady
    && agendaReady
    && surveysReady
    && attendeeExperienceReady
    && deploymentReady
    && uncoveredEventAreaCount === 0
  const stages = [
    hasEventDetails,
    eventAreasReady,
    agendaReady,
    surveysReady,
    attendeeExperienceReady,
    deploymentReady,
    collectionReady,
  ]

  return {
    eventDetailsReady: hasEventDetails,
    eventAreasReady,
    agenda,
    surveysReady,
    attendeeExperienceReady,
    deploymentReady,
    collectionReady,
    readyCount: stages.filter(Boolean).length,
    totalCount: stages.length,
  }
}
