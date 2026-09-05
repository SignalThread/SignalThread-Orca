'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { isEventsAccount } from '@/lib/account-product-mode'
import { getEventWorkspaceExperience, isEventCreationType } from '@/lib/event-creation-type'
import { EventCard, EventTabs, EventEmptyState, EventReadinessList, EventStatusPill, EventWorkspaceShell, type EventReadinessItem, type EventStatusTone } from '@/components/app/events'
import { getEventDisplayStatus } from '@/lib/events-home-groups'
import { EventDeploymentWorkspace, type EventDeploymentSurvey } from '@/components/events/EventDeploymentWorkspace'
import { EventAgendaWorkspace } from '@/components/events/EventAgendaWorkspace'
import { EventTemplateSurveyWorkspace } from '@/components/events/EventTemplateSurveyWorkspace'
import { SimpleEventWorkspace } from '@/components/events/SimpleEventWorkspace'
import { EventSurveyLibraryPicker, isSurveyAssignableToEventTarget, type SurveyLibraryItem } from '@/components/events/EventSurveyLibraryPicker'
import { EventAreasWorkspace } from '@/components/events/EventAreasWorkspace'
import { buildEventSetupTabPath, deriveEventSetupReadiness, isAttendeeExperienceConfigured, parseEventSetupTab, type AttendeeExperienceConsent, type EventSetupTab } from '@/lib/events-setup-readiness'
import { loadAccountContext, type AccountContext } from '@/lib/account-context-client'
import type { EventSignageVisualConfiguration } from '@/lib/event-signage'

type SurveyTargetCategory = 'EVENT' | 'SESSION' | 'LOCATION' | 'CUSTOM' | 'SPEAKER'
type EventStructureItemKind = 'EVENT' | 'SESSION' | 'AREA' | 'SPONSOR_ACTIVATION' | 'CUSTOM_TOUCHPOINT'
type EventOverviewIconName = 'setup' | 'surveys' | 'terms' | 'launch' | 'agenda' | 'sessions' | 'speakers' | 'areas'

function EventOverviewIcon({ name, className = 'h-5 w-5' }: { name: EventOverviewIconName; className?: string }) {
  const paths = {
    setup: <><rect x="3.5" y="5" width="13" height="12" rx="2" /><path d="M6.5 3v4M13.5 3v4M3.5 9h13" /></>,
    surveys: <><rect x="5" y="3" width="10" height="14" rx="1.5" /><path d="M8 3.5h4M8 8h4M8 11h4M8 14h2" /></>,
    terms: <><path d="M5 3.5h7l3 3V16.5H5z" /><path d="M12 3.5v3h3M8 10h4M8 13h3" /><circle cx="15.5" cy="15.5" r="2.5" /></>,
    launch: <><path d="M12.5 3.5c2.5.5 3.5 2.5 4 5-1.8 2.8-4.2 5.2-7 7-2.5-.5-4.5-1.5-5-4 1.8-2.8 4.8-6.2 8-8Z" /><path d="m8 12-3.5 3.5M7.5 15.5l-3 1 .8-3.2M12.5 8.5h.01" /><circle cx="12.5" cy="8.5" r="1" /></>,
    agenda: <><rect x="3.5" y="5" width="13" height="12" rx="2" /><path d="M6.5 3v4M13.5 3v4M3.5 9h13" /></>,
    sessions: <><circle cx="7" cy="7" r="2.5" /><circle cx="13.5" cy="8" r="2" /><path d="M3.5 16c.4-2.5 1.8-4 3.5-4s3.1 1.5 3.5 4M11.5 16c.3-1.8 1.3-3 2.8-3 1.1 0 1.9.6 2.3 1.6" /></>,
    speakers: <><circle cx="7" cy="7" r="2.5" /><circle cx="13.5" cy="7" r="2.5" /><path d="M3.5 16c.4-2.5 1.8-4 3.5-4s3.1 1.5 3.5 4M10 16c.4-2.5 1.8-4 3.5-4s3.1 1.5 3.5 4" /></>,
    areas: <><path d="M10 17s5-4.6 5-8a5 5 0 1 0-10 0c0 3.4 5 8 5 8Z" /><circle cx="10" cy="9" r="1.5" /></>,
  } satisfies Record<EventOverviewIconName, ReactNode>
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>
}

interface EventDetail {
  id: string
  name: string
  description: string | null
  venue: string | null
  status: string
  eventType: string
  templateKey?: string | null
  startDate: string | null
  endDate: string | null
  listeningWindowOpensAt: string | null
  listeningWindowClosesAt: string | null
  isActive: boolean
  location?: {
    id: string
    name: string
    slug: string
    timezone?: string | null
  }
  _count?: {
    responses?: number
    answers?: number
    surveys?: number
    surveyTargets?: number
    questions?: number
    assignedSpeakerCount?: number
  }
}

interface EventVoiceSurvey {
  id: string
  surveyId?: string
  name: string
  description: string | null
  status: string
  isArchived: boolean
  responseMode: string
  responseCount: number
  target: {
    id: string
    category: SurveyTargetCategory
    name: string
    description: string | null
    eventStructureItemId?: string | null
  } | null
  assignmentTargets?: Array<{
    id: string
    category: SurveyTargetCategory
    name: string
    description: string | null
    eventStructureItemId?: string | null
  }>
  questions: Array<{
    id: string
    label: string
    order: number
    required: boolean
  }>
  publicLink: {
    id: string
    kioskPath: string
    isActive: boolean
  } | null
  availability: {
    state: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED' | 'INVALID'
    message: string
    effectiveOpensAt: string | null
    effectiveClosesAt: string | null
  }
  readiness: {
    responseEligible: boolean
    issues: string[]
  }
  signageConfiguration?: EventSignageVisualConfiguration | null
}

interface EventVoiceSurveysResponse {
  data?: {
    surveys?: EventVoiceSurvey[]
    deployments?: EventDeploymentSurvey[]
  }
}

interface AccountSettingsResponse {
  settings?: {
    consent?: AttendeeExperienceConsent
    consentConfigured?: boolean
  }
}

interface EventStructureItem {
  id: string
  eventId: string
  kind: EventStructureItemKind
  name: string
  slug: string
  description: string | null
  parentId: string | null
  locationId: string | null
  startsAt: string | null
  endsAt: string | null
  timezone: string | null
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface EventStructureResponse {
  data?: {
    items?: EventStructureItem[]
  }
}

interface EventListeningPlanSummary {
  agendaSessionCount: number
  selectedSessionCount: number
  representedSessionCount: number
  selectedCoverageLabel: string
  evidenceCoverageLabel: string
}

const WORKSPACE_REQUEST_TIMEOUT_MS = 15_000

type WorkspaceSlice = 'event' | 'surveys' | 'structure' | 'listeningPlan' | 'attendeeExperience'
type OperationsSection = 'sessions' | 'speakers' | 'event-areas'

const ALL_WORKSPACE_SLICES: WorkspaceSlice[] = ['event', 'surveys', 'structure', 'listeningPlan', 'attendeeExperience']

async function fetchWorkspaceJson<T>(label: string, url: string, signal: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (signal.aborted) throw new Error(`${label} request timed out. Please retry.`)
    throw error
  }

  const body = await response.json().catch(() => ({})) as T & { success?: boolean; error?: string; message?: string }
  if (!response.ok || !body.success) {
    throw new Error(`${label}: ${body.error || body.message || 'Request failed'}`)
  }
  return body
}

// One lifecycle status per survey. Launchable state is not a second badge; it
// is represented through valid actions on the survey destination.
function surveyLifecycleStatus(survey: EventVoiceSurvey): { key: 'live' | 'draft' | 'completed' | 'archived'; label: string; tone: EventStatusTone } {
  if (survey.isArchived) return { key: 'archived', label: 'Archived', tone: 'muted' }
  if (survey.status === 'ACTIVE') return { key: 'live', label: 'Live', tone: 'live' }
  if (survey.status === 'COMPLETED') return { key: 'completed', label: 'Completed', tone: 'muted' }
  return { key: 'draft', label: 'Draft', tone: 'attention' }
}

function EventDetailContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = typeof params.eventId === 'string' ? params.eventId : ''
  const accountSlug = searchParams.get('account')
  const dashboardPath = (() => {
    const query = new URLSearchParams()
    if (accountSlug) query.set('account', accountSlug)
    const suffix = query.toString()
    return `/app/events/${eventId}/dashboard${suffix ? `?${suffix}` : ''}`
  })()
  const surveyEditPath = (surveyId: string) =>
    accountSlug
      ? `/app/events/${eventId}/edit?account=${accountSlug}&survey=${surveyId}`
      : `/app/events/${eventId}/edit?survey=${surveyId}`
  // Dedicated Events-only creation route. Survey creation no longer renders inline.
  const newSurveyPath = (structureItemId?: string) => {
    const query = new URLSearchParams()
    if (accountSlug) query.set('account', accountSlug)
    if (structureItemId) query.set('area', structureItemId)
    const queryString = query.toString()
    return `/app/events/${eventId}/surveys/new${queryString ? `?${queryString}` : ''}`
  }
  const attendeeExperiencePath = (() => {
    const query = new URLSearchParams()
    if (accountSlug) query.set('account', accountSlug)
    query.set('tab', 'consent')
    return `/app/settings/profile?${query.toString()}`
  })()
  const requestedTabValue = searchParams.get('tab')
  const requestedTab = parseEventSetupTab(requestedTabValue)
  const requestedAgendaView = searchParams.get('agendaView')
  const requestedOperationsView = searchParams.get('operationsView')
  const requestedOperationsSection = searchParams.get('operationsSection')
  const activeTab = requestedTab
  const activeOperationsView = requestedOperationsView === 'speakers'
    || (requestedTabValue === 'agenda' && requestedAgendaView === 'speakers')
    || requestedTabValue === 'speakers'
    ? 'speakers'
    : 'sessions'
  // Operations section selection is intentionally independent from old
  // Agenda/Event Area deep-link state. Loading either data set must never
  // decide which section is visible.
  const activeOperationsSection: OperationsSection = requestedOperationsSection === 'event-areas'
    ? 'event-areas'
    : activeOperationsView
  const selectSetupTab = (tab: EventSetupTab) => {
    const path = new URL(buildEventSetupTabPath(eventId, accountSlug, tab), window.location.origin)
    router.push(`${path.pathname}${path.search}`)
  }
  const selectOperationsSection = (section: OperationsSection) => {
    const path = new URL(buildEventSetupTabPath(eventId, accountSlug, 'operations'), window.location.origin)
    if (section === 'speakers') path.searchParams.set('operationsView', 'speakers')
    else path.searchParams.delete('operationsView')
    if (section === 'event-areas') path.searchParams.set('operationsSection', 'event-areas')
    else path.searchParams.delete('operationsSection')
    router.push(`${path.pathname}${path.search}`)
  }
  const startOperationsSpeakerAction = (action: 'library' | 'import' | 'new') => {
    const path = new URL(buildEventSetupTabPath(eventId, accountSlug, 'operations'), window.location.origin)
    path.searchParams.set('operationsView', 'speakers')
    path.searchParams.set('speakerAction', action)
    router.push(`${path.pathname}${path.search}`)
  }
  const startOperationsAgendaImport = () => {
    const path = new URL(buildEventSetupTabPath(eventId, accountSlug, 'operations'), window.location.origin)
    path.searchParams.set('agendaImport', 'new')
    router.push(`${path.pathname}${path.search}`)
  }
  const startOperationsSessionCreate = () => {
    const path = new URL(buildEventSetupTabPath(eventId, accountSlug, 'operations'), window.location.origin)
    path.searchParams.set('newSession', '1')
    router.push(`${path.pathname}${path.search}`)
  }

  const openTemplateManualSetup = () => {
    setShowAreaCreate(true)
    selectSetupTab('operations')
  }

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [accountBranding, setAccountBranding] = useState<AccountContext['branding'] | null>(null)
  const [surveys, setSurveys] = useState<EventVoiceSurvey[]>([])
  const [surveyDeployments, setSurveyDeployments] = useState<EventDeploymentSurvey[]>([])
  const [structureItems, setStructureItems] = useState<EventStructureItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAreaCreate, setShowAreaCreate] = useState(false)
  const [surveySearch, setSurveySearch] = useState('')
  const [surveyFilter, setSurveyFilter] = useState<string>('all')
  const [agendaImportState, setAgendaImportState] = useState<'IN_PROGRESS' | 'NEEDS_REVIEW' | null>(null)
  const [listeningPlanSummary, setListeningPlanSummary] = useState<EventListeningPlanSummary | null>(null)
  const [attendeeConsent, setAttendeeConsent] = useState<AttendeeExperienceConsent | null>(null)
  const [attendeeConsentConfigured, setAttendeeConsentConfigured] = useState(false)
  // A saved write must never look lost because a follow-up read failed. Refresh
  // failures surface through this notice instead of the workspace error state.
  const [refreshFailed, setRefreshFailed] = useState(false)
  const initialLoadKeyRef = useRef<string | null>(null)

  // Fetches only the requested workspace slices; each slice commits its own
  // state as soon as it arrives so a partial refresh still lands what succeeded.
  const fetchWorkspaceSlices = useCallback(async (slices: WorkspaceSlice[]) => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), WORKSPACE_REQUEST_TIMEOUT_MS)
    try {
      await Promise.all(slices.map(async (slice) => {
        if (slice === 'event') {
          const body = await fetchWorkspaceJson<{ success: true; event: EventDetail }>('Event details', `/api/app/events/${eventId}?account=${accountSlug}`, controller.signal)
          setEvent(body.event)
        } else if (slice === 'surveys') {
          const body = await fetchWorkspaceJson<EventVoiceSurveysResponse & { success: true }>('Event surveys', `/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`, controller.signal)
          setSurveys(body.data?.surveys ?? [])
          setSurveyDeployments(body.data?.deployments ?? body.data?.surveys ?? [])
        } else if (slice === 'structure') {
          const body = await fetchWorkspaceJson<EventStructureResponse & { success: true }>('Event structure', `/api/app/events/${eventId}/structure?account=${accountSlug}`, controller.signal)
          setStructureItems(body.data?.items ?? [])
        } else if (slice === 'attendeeExperience') {
          try {
            const body = await fetchWorkspaceJson<AccountSettingsResponse & { success: true }>('Attendee experience settings', `/api/app/account/settings?account=${accountSlug}`, controller.signal)
            setAttendeeConsent(body.settings?.consent ?? null)
            setAttendeeConsentConfigured(body.settings?.consentConfigured === true)
          } catch (error) {
            // A consent read failure must not make the operational workspace
            // unavailable; show this stage as needing setup and allow retry.
            console.warn('[Event Setup] Attendee experience settings unavailable', error)
            setAttendeeConsent(null)
            setAttendeeConsentConfigured(false)
          }
        } else {
          const body = await fetchWorkspaceJson<{ success: true; data?: { listeningPlan?: { summary?: EventListeningPlanSummary } } }>('Listening plan', `/api/app/events/${eventId}/agenda?account=${accountSlug}&summary=1`, controller.signal)
          setListeningPlanSummary(body.data?.listeningPlan?.summary ?? null)
        }
      }))
    } finally {
      window.clearTimeout(timeoutId)
    }
  }, [accountSlug, eventId])

  const loadEvent = useCallback(async (options: { forceAccountRefresh?: boolean } = {}) => {
    if (!accountSlug || !eventId) {
      setError('Missing account or event parameter.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const account = await loadAccountContext(accountSlug, { forceRefresh: options.forceAccountRefresh })
      if (!isEventsAccount(account.accountType)) {
        router.replace(dashboardPath)
        return
      }
      setAccountBranding(account.branding)

      await fetchWorkspaceSlices(ALL_WORKSPACE_SLICES)
      setRefreshFailed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event')
    } finally {
      setLoading(false)
    }
  }, [accountSlug, dashboardPath, eventId, fetchWorkspaceSlices, router])

  // Post-mutation revalidation. Never toggles the workspace loading state and
  // never clears loaded data: the mutation already succeeded, so a failed
  // follow-up read only marks the view as possibly stale.
  const refreshWorkspaceData = useCallback(async (slices: WorkspaceSlice[]) => {
    try {
      await fetchWorkspaceSlices(slices)
      setRefreshFailed(false)
      return true
    } catch (err) {
      console.error('[Event Setup] Workspace refresh failed after a saved change', err)
      setRefreshFailed(true)
      return false
    }
  }, [fetchWorkspaceSlices])

  useEffect(() => {
    const loadKey = `${accountSlug ?? ''}:${eventId}`
    if (initialLoadKeyRef.current === loadKey) return
    initialLoadKeyRef.current = loadKey
    void loadEvent()
  }, [accountSlug, eventId, loadEvent])

  useEffect(() => {
    if (!requestedTabValue || !['agenda', 'areas', 'speakers'].includes(requestedTabValue)) return
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', 'operations')
    if (requestedTabValue === 'speakers' || requestedAgendaView === 'speakers') query.set('operationsView', 'speakers')
    else query.delete('operationsView')
    if (requestedTabValue === 'areas') query.set('operationsSection', 'event-areas')
    else query.delete('operationsSection')
    query.delete('operationFocus')
    query.delete('agendaView')
    router.replace(`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`)
  }, [eventId, requestedAgendaView, requestedTabValue, router, searchParams])

  if (loading) {
    return (
      <EventWorkspaceShell
        accountSlug={accountSlug ?? ''}
        eventId={eventId}
        activeSection="setup"
        loading
      >
        <div />
      </EventWorkspaceShell>
    )
  }

  if (error || !event) {
    return (
      <EventWorkspaceShell
        accountSlug={accountSlug ?? ''}
        eventId={eventId}
        activeSection="setup"
        error={error || 'Event not found'}
        onRetry={() => { void loadEvent({ forceAccountRefresh: true }) }}
      >
        <div />
      </EventWorkspaceShell>
    )
  }

  const surveyCount = surveys.length
  const structureCount = structureItems.length
  const eventAreaCount = structureItems.filter((item) => item.kind !== 'SESSION').length
  const launchableSurveyCount = surveys.filter((survey) => survey.readiness.responseEligible).length
  const coveredStructureItemIds = new Set(
    surveys
      .map((survey) => survey.target?.eventStructureItemId)
      .filter((id): id is string => Boolean(id)),
  )
  const surveyByStructureItemId = new Map(
    surveys
      .filter((survey) => Boolean(survey.target?.eventStructureItemId))
      .map((survey) => [survey.target?.eventStructureItemId as string, survey]),
  )
  // The picker inventory is definition/event scoped. Assignment targets are
  // presentation context only: a survey already used by a Session, Speaker,
  // or another Event Area remains reusable by this Event Area.
  const availableAreaSurveys: SurveyLibraryItem[] = surveys
    .map((survey) => ({
      id: survey.id,
      name: survey.name,
      status: survey.status,
      targetType: survey.assignmentTargets?.some((target) => target.category === 'SESSION')
        ? 'SESSION' as const
        : survey.assignmentTargets?.some((target) => target.category === 'SPEAKER')
          ? 'SPEAKER' as const
          : survey.assignmentTargets?.length || survey.target
            ? 'AREA' as const
            : null,
      questionCount: survey.questions.length,
      eventId,
      eventName: event.name,
    }))
  const uncoveredStructureCount = structureItems.filter(
    (item) => !coveredStructureItemIds.has(item.id),
  ).length
  const coveredStructureCount = Math.max(structureCount - uncoveredStructureCount, 0)
  const agendaSessionItems = structureItems.filter((item) => item.kind === 'SESSION')
  const agendaSessionCount = agendaSessionItems.length
  const workspaceExperience = getEventWorkspaceExperience(event)
  const isCurrentEventFramework = isEventCreationType(event.eventType)
  const isTemplateEvent = workspaceExperience === 'TEMPLATE'
  const isSimpleEvent = workspaceExperience === 'SIMPLE'
  if (isSimpleEvent) {
    return (
      <EventWorkspaceShell
        accountSlug={accountSlug ?? ''}
        eventId={eventId}
        activeSection="setup"
        eventName={event.name}
        eventStatus={getEventDisplayStatus({ ...event, timezone: event.location?.timezone })}
      >
        {activeTab === 'deploy' ? <EventCard padding="md"><EventDeploymentWorkspace
          eventId={eventId}
          accountSlug={accountSlug ?? ''}
          eventName={event.name}
          surveys={surveyDeployments}
          accountBranding={accountBranding}
          initialSurveyId={searchParams.get('deploySurvey')}
          onSignageApplied={() => refreshWorkspaceData(['surveys'])}
          onDone={() => router.push(accountSlug ? `/app/events/${eventId}?account=${encodeURIComponent(accountSlug)}` : `/app/events/${eventId}`)}
        /></EventCard> : <SimpleEventWorkspace eventId={eventId} accountSlug={accountSlug ?? ''} surveys={surveys} />}
      </EventWorkspaceShell>
    )
  }
  const isTemplateAgendaSetup = isTemplateEvent && agendaSessionCount === 0
  const openTemplateAgendaImport = () => {
    const path = new URL(buildEventSetupTabPath(eventId, accountSlug, 'operations'), window.location.origin)
    path.searchParams.set('agendaImport', 'new')
    router.push(`${path.pathname}${path.search}`)
  }
  const attendeeChoiceSurveyCount = surveys.filter((survey) => survey.responseMode === 'VOICE_AND_TEXT').length
  const attendeeExperienceReady = attendeeConsentConfigured && isAttendeeExperienceConfigured(attendeeConsent)
  const setupReadiness = deriveEventSetupReadiness({
    hasEventDetails: Boolean(event.name.trim() && event.startDate && event.endDate),
    eventAreaCount: structureCount,
    agendaSessionCount,
    agendaImportState,
    surveyCount,
    attendeeExperienceReady,
    launchableSurveyCount,
    uncoveredEventAreaCount: uncoveredStructureCount,
  })

  const resolveFirstSetupGap = () => {
    if (!setupReadiness.eventDetailsReady) {
      router.push(`/app/settings/profile?account=${encodeURIComponent(accountSlug ?? '')}&tab=event-settings&event=${encodeURIComponent(eventId)}`)
      return
    }
    if (!setupReadiness.eventAreasReady) return selectSetupTab('operations')
    if (setupReadiness.agenda.status !== 'READY') return selectSetupTab('operations')
    if (!setupReadiness.surveysReady) return selectSetupTab('surveys')
    if (!setupReadiness.attendeeExperienceReady) return router.push(attendeeExperiencePath)
    return selectSetupTab('deploy')
  }

  const readinessItems: EventReadinessItem[] = [
    {
      id: 'event-details',
      label: 'Event details',
      description: setupReadiness.eventDetailsReady
        ? 'Event name and schedule are set.'
        : 'Add both start and end times so the team has a complete event schedule.',
      complete: setupReadiness.eventDetailsReady,
      statusLabel: setupReadiness.eventDetailsReady ? 'Ready' : 'Needs details',
      actionLabel: 'Review details',
      onAction: () => {
        router.push(`/app/settings/profile?account=${encodeURIComponent(accountSlug ?? '')}&tab=event-settings&event=${encodeURIComponent(eventId)}`)
      },
    },
    {
      id: 'event-areas',
      label: 'Event Areas / session surveys',
      description: structureCount > 0
        ? listeningPlanSummary
          ? `${listeningPlanSummary.selectedCoverageLabel}; ${listeningPlanSummary.evidenceCoverageLabel}.`
          : `${coveredStructureCount} of ${structureCount} event areas have survey coverage.`
        : 'Choose the event-wide, session, location, or custom points where feedback should be collected.',
      complete: setupReadiness.eventAreasReady,
      statusLabel: setupReadiness.eventAreasReady ? 'Ready' : 'Not started',
      actionLabel: 'Manage Event Areas',
      onAction: () => selectSetupTab('operations'),
    },
    {
      id: 'agenda',
      label: 'Agenda & sessions',
      description: setupReadiness.agenda.detail,
      complete: setupReadiness.agenda.status === 'READY',
      statusLabel: setupReadiness.agenda.label,
      statusTone: setupReadiness.agenda.status === 'IMPORT_IN_PROGRESS'
        ? 'progress'
        : setupReadiness.agenda.status === 'READY'
          ? 'ready'
          : 'attention',
      actionLabel: setupReadiness.agenda.actionLabel,
      onAction: () => selectSetupTab('operations'),
    },
    {
      id: 'surveys',
      label: 'Surveys',
      description: surveyCount > 0
        ? `${surveyCount} survey${surveyCount === 1 ? '' : 's'} configured for this event.`
        : 'Create the first attendee survey for this event.',
      complete: setupReadiness.surveysReady,
      statusLabel: setupReadiness.surveysReady ? 'Ready' : 'Not started',
      actionLabel: surveyCount > 0 ? 'Manage surveys' : 'Create survey',
      onAction: () => surveyCount > 0 ? selectSetupTab('surveys') : router.push(newSurveyPath()),
    },
    {
      id: 'attendee-experience',
      label: 'Attendee terms & experience',
      description: setupReadiness.attendeeExperienceReady
        ? attendeeChoiceSurveyCount > 0
          ? `Consent is configured. ${attendeeChoiceSurveyCount} survey${attendeeChoiceSurveyCount === 1 ? '' : 's'} let attendees choose Voice or Text at the start screen.`
          : 'Consent and required disclosure are configured. Response method is managed on each survey.'
        : 'Configure the attendee consent screen and required disclosure before collection.',
      complete: setupReadiness.attendeeExperienceReady,
      statusLabel: setupReadiness.attendeeExperienceReady ? 'Ready' : 'Needs setup',
      actionLabel: 'Configure attendee experience',
      onAction: () => router.push(attendeeExperiencePath),
    },
    {
      id: 'deployment',
      label: 'Public links, QR & signage',
      description: launchableSurveyCount > 0
        ? `${launchableSurveyCount} survey${launchableSurveyCount === 1 ? '' : 's'} can collect through a public link and QR.`
        : 'Publish a ready survey before preparing QR codes and printable signage.',
      complete: setupReadiness.deploymentReady,
      statusLabel: setupReadiness.deploymentReady ? 'Ready' : 'Needs deployment',
      actionLabel: 'Open Deploy',
      onAction: () => selectSetupTab('deploy'),
    },
    {
      id: 'collection',
      label: 'Collection readiness',
      description: setupReadiness.collectionReady
        ? 'The agenda, session surveys, and deployment are ready for attendee responses.'
        : 'Complete the remaining setup stages before relying on live collection.',
      complete: setupReadiness.collectionReady,
      statusLabel: setupReadiness.collectionReady ? 'Ready to collect' : 'Needs setup',
      actionLabel: setupReadiness.collectionReady ? 'Open Signals' : 'Resolve setup',
      onAction: () => setupReadiness.collectionReady ? router.push(dashboardPath) : resolveFirstSetupGap(),
    },
  ]
  const overviewSetupReady = setupReadiness.eventAreasReady && setupReadiness.agenda.status === 'READY'
  const overviewCurrentStep = !overviewSetupReady
    ? 'setup'
    : !setupReadiness.surveysReady
      ? 'surveys'
      : !attendeeExperienceReady
        ? 'terms'
        : 'launch'
  const overviewWorkflow = [
    { id: 'setup', number: 1, icon: 'setup' as const, label: 'Setup', helper: 'Build your event' },
    { id: 'surveys', number: 2, icon: 'surveys' as const, label: 'Surveys', helper: 'Create & attach surveys' },
    { id: 'terms', number: 3, icon: 'terms' as const, label: 'T&C', helper: 'Review terms' },
    { id: 'launch', number: 4, icon: 'launch' as const, label: 'Launch', helper: 'Publish & go live' },
  ]
  const overviewActionCards = [
    {
      id: 'setup', icon: 'setup' as const, label: 'Setup', status: overviewSetupReady ? 'Ready' : setupReadiness.agenda.status === 'IMPORT_IN_PROGRESS' ? 'In progress' : 'Needs setup', ready: overviewSetupReady,
      detail: 'Build your agenda, sessions, speakers, and event areas.', action: 'Continue in Setup', onAction: () => selectSetupTab('operations'),
    },
    {
      id: 'surveys', icon: 'surveys' as const, label: 'Surveys', status: setupReadiness.surveysReady ? 'Ready' : 'Needs setup', ready: setupReadiness.surveysReady,
      detail: 'Create surveys and attach them to sessions or areas.', action: 'Manage surveys', onAction: () => selectSetupTab('surveys'),
    },
    {
      id: 'terms', icon: 'terms' as const, label: 'T&C Setup', status: attendeeExperienceReady ? 'Ready' : 'Needs setup', ready: attendeeExperienceReady,
      detail: 'Review consent and attendee terms.', action: attendeeExperienceReady ? 'Review T&C' : 'Set up T&C', onAction: () => router.push(attendeeExperiencePath),
    },
    {
      id: 'launch', icon: 'launch' as const, label: 'Launch', status: launchableSurveyCount > 0 ? 'Ready' : 'Needs setup', ready: launchableSurveyCount > 0,
      detail: 'Publish links and QR codes when you’re ready.', action: 'QR, links & launch', onAction: () => selectSetupTab('deploy'),
    },
  ]
  const eventAreaStructureItems = structureItems.filter((item) => item.kind !== 'SESSION')
  // Surveys tab: compact management index over the canonical surveys.
  const surveySearchQuery = surveySearch.trim().toLowerCase()
  const filteredSurveys = surveys.filter((survey) => {
    const status = surveyLifecycleStatus(survey)
    if (surveyFilter !== 'all' && status.key !== surveyFilter) return false
    if (!surveySearchQuery) return true
    return (
      survey.name.toLowerCase().includes(surveySearchQuery) ||
      (survey.target?.name ?? 'Not assigned').toLowerCase().includes(surveySearchQuery)
    )
  })
  const liveSurveyCount = surveys.filter((survey) => surveyLifecycleStatus(survey).key === 'live').length
  const draftSurveyCount = surveys.filter((survey) => surveyLifecycleStatus(survey).key === 'draft').length
  const completedSurveyCount = surveys.filter((survey) => surveyLifecycleStatus(survey).key === 'completed').length
  const archivedSurveyCount = surveys.filter((survey) => surveyLifecycleStatus(survey).key === 'archived').length
  const surveyFilterChips = [
    { key: 'all', label: 'All', count: surveyCount },
    { key: 'live', label: 'Live', count: liveSurveyCount },
    { key: 'draft', label: 'Draft', count: draftSurveyCount },
    { key: 'completed', label: 'Completed', count: completedSurveyCount },
    { key: 'archived', label: 'Archived', count: archivedSurveyCount },
  ]
  const eventTabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'operations', label: 'Operations' },
    { key: 'surveys', label: 'Surveys', count: surveyCount },
    { key: 'deploy', label: 'Deploy' },
  ]
  return (
    <EventWorkspaceShell
      accountSlug={accountSlug ?? ''}
      eventId={eventId}
      activeSection="setup"
      eventName={event.name}
      eventStatus={getEventDisplayStatus({ ...event, timezone: event.location?.timezone })}
    >
      <div className="space-y-3">
        {refreshFailed && (
          <div role="status" className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            <p>
              <span className="font-semibold">Your change was saved.</span>{' '}
              Refreshing the workspace view failed, so some data shown may be out of date.
            </p>
            <button
              type="button"
              onClick={() => { void refreshWorkspaceData(ALL_WORKSPACE_SLICES) }}
              className="shrink-0 self-start font-semibold text-amber-900 underline underline-offset-2 sm:self-center dark:text-amber-200"
            >
              Refresh view
            </button>
          </div>
        )}
        <EventTabs
          tabs={eventTabs}
          activeKey={activeTab}
          onSelect={(key) => selectSetupTab(key as EventSetupTab)}
        />

        {activeTab === 'overview' && (isTemplateAgendaSetup ? (
          <section aria-labelledby="template-agenda-setup-title">
            <EventCard padding="md" className="overflow-hidden">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
                <div>
                  <p className="event-type-kicker text-indigo-600 dark:text-indigo-300">Event Template setup</p>
                  <h2 id="template-agenda-setup-title" className="event-type-page-title mt-2 text-zinc-950 dark:text-white">Set up your event</h2>
                  <p className="event-type-summary mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">Upload your agenda, then add Event Areas as needed.</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button type="button" onClick={openTemplateAgendaImport}>Upload agenda</Button>
                    <Button type="button" variant="secondary" onClick={openTemplateManualSetup}>Set up manually</Button>
                  </div>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                  <ol className="event-type-control space-y-3 text-zinc-700 dark:text-zinc-200">
                    {['Upload agenda & areas', 'Review sessions, speakers & areas', 'Confirm event setup'].map((label, index) => (
                      <li key={label} className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300">{index + 1}</span>{label}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </EventCard>
          </section>
        ) : isCurrentEventFramework ? (
          <section aria-labelledby="event-progress-title" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="event-type-kicker text-indigo-600 dark:text-indigo-300">Event overview</p>
                <h2 id="event-progress-title" className="event-type-page-title mt-1 text-zinc-950 dark:text-white">Bring your event from setup to launch</h2>
                <p className="event-type-summary mt-1 text-zinc-600 dark:text-zinc-400">Follow the workflow, then use the cards below to continue in each workspace.</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => router.push(dashboardPath)}>Open Signals</Button>
            </div>
            <EventCard padding="md" className="event-overview-responsive border-slate-200/80 shadow-none dark:border-zinc-800">
              <h3 id="event-workflow-title" className="event-type-section-title text-zinc-950 dark:text-white">How it works</h3>
              <ol aria-labelledby="event-workflow-title" data-testid="event-overview-workflow" className="event-overview-workflow mt-4 grid gap-3">
                {overviewWorkflow.flatMap((step, index) => [
                  <li key={step.id} className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">{step.number}</span>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><EventOverviewIcon name={step.icon} className="h-4 w-4" /></span>
                    <span className="min-w-0"><span className="event-type-row-title block text-zinc-950 dark:text-white">{step.label}</span><span className="event-type-meta block truncate text-zinc-500 dark:text-zinc-400">{step.helper}</span></span>
                  </li>,
                  index < overviewWorkflow.length - 1 ? <li key={`${step.id}-connector`} aria-hidden="true" className="event-overview-workflow-connector hidden text-slate-300 dark:text-zinc-700"><svg viewBox="0 0 36 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-9"><path d="M1 6h31m-5-4 5 4-5 4" strokeLinecap="round" strokeLinejoin="round" /></svg></li> : null,
                ])}
              </ol>
            </EventCard>
            <EventCard padding="md" className="event-overview-responsive" data-testid="event-overview-continue-setup">
              <h3 id="event-continue-setup-title" className="event-type-section-title text-zinc-950 dark:text-white">Continue setup</h3>
              <div aria-labelledby="event-continue-setup-title" aria-label="Event workflow actions" data-testid="event-overview-action-cards" className="event-overview-action-grid mt-4 grid gap-3">
                {overviewActionCards.map((step) => <section key={step.id} className={`flex min-h-64 flex-col rounded-2xl border p-4 ${overviewCurrentStep === step.id ? 'border-indigo-400 bg-indigo-50/40 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-950/20' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50'}`}>
                  <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><EventOverviewIcon name={step.icon} /></span><h3 className="event-type-section-title text-zinc-950 dark:text-white">{step.label}</h3></div><span className={`event-type-pill shrink-0 rounded-full px-2 py-0.5 ${step.ready ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : step.status === 'In progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'}`}>{step.status}</span></div>
                  <p className="event-type-summary mt-4 text-zinc-600 dark:text-zinc-400">{step.detail}</p>
                  {step.id === 'setup' && <div aria-label="Setup capabilities" className="mt-4 grid grid-cols-4 gap-1.5">{[
                    { label: 'Agenda', icon: 'agenda' as const }, { label: 'Sessions', icon: 'sessions' as const }, { label: 'Speakers', icon: 'speakers' as const }, { label: 'Event Areas', icon: 'areas' as const },
                  ].map((capability) => <div key={capability.label} className="rounded-lg border border-slate-200 bg-white px-1 py-2 text-center dark:border-zinc-800 dark:bg-zinc-950/30"><span className="mx-auto grid h-5 w-5 place-items-center text-indigo-600 dark:text-indigo-300"><EventOverviewIcon name={capability.icon} className="h-4 w-4" /></span><span className="event-type-pill mt-1 block text-zinc-600 dark:text-zinc-300">{capability.label}</span></div>)}
                  </div>}
                  <button type="button" onClick={step.onAction} className={`event-type-control mt-auto w-full rounded-lg border px-3 py-2.5 transition-colors ${overviewCurrentStep === step.id ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700' : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40'}`}>{step.action}</button>
                </section>)}
              </div>
              <div role="note" className="event-type-meta mt-5 flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200"><span className="grid h-5 w-5 place-items-center rounded-full border border-indigo-300 text-[11px] font-bold dark:border-indigo-700">i</span>Complete the steps in order to launch your event. You can save progress and return later.</div>
            </EventCard>
          </section>
        ) : (
          <section aria-labelledby="setup-overview-title" className="space-y-4">
            <div>
              <h2 id="setup-overview-title" className="event-type-section-title text-zinc-950 dark:text-white">Setup overview</h2>
              <p className="event-type-summary mt-1 text-zinc-600 dark:text-zinc-400">Review the connected steps required to collect useful attendee feedback.</p>
            </div>

            <div className="w-full">
              <EventCard padding="md">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-end">
                  <div>
                    <p className="event-type-kicker text-blue-700 dark:text-blue-300">Event readiness</p>
                    <h3 className="event-type-section-title mt-1 text-zinc-950 dark:text-white">
                      {setupReadiness.readyCount} of {setupReadiness.totalCount} stages ready
                    </h3>
                  </div>
                  <span className="event-type-control text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                    {Math.round((setupReadiness.readyCount / setupReadiness.totalCount) * 100)}%
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-[width]"
                    style={{ width: `${(setupReadiness.readyCount / setupReadiness.totalCount) * 100}%` }}
                  />
                </div>
                <EventReadinessList items={readinessItems} className="mt-3" />
              </EventCard>
            </div>
          </section>
        ))}

        {activeTab === 'operations' && (
        <section aria-labelledby="operations-title" className="space-y-4">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="operations-title" className="event-type-page-title text-zinc-950 dark:text-white">Operations</h2>
                <p className="event-type-summary mt-1 text-zinc-600 dark:text-zinc-400">Manage your event setup and agenda.</p>
              </div>
              {activeOperationsSection === 'sessions' && <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={startOperationsAgendaImport}>Import agenda</Button>
                <Button type="button" size="sm" onClick={startOperationsSessionCreate}>Add session</Button>
              </div>}
              {activeOperationsSection === 'speakers' && !isTemplateEvent && <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => startOperationsSpeakerAction('library')}>Add from speaker library</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => startOperationsSpeakerAction('import')}>Import speakers</Button>
                <Button type="button" size="sm" onClick={() => startOperationsSpeakerAction('new')}>Add speaker</Button>
              </div>}
              {activeOperationsSection === 'event-areas' && <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => setShowAreaCreate(true)}>Add Event Area</Button>
              </div>}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3" role="group" aria-label="Operations sections">
              {[
                { section: 'sessions' as const, label: 'Sessions', count: agendaSessionCount, icon: 'S', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' },
                { section: 'speakers' as const, label: 'Speakers', count: event._count?.assignedSpeakerCount ?? 0, icon: 'P', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
                { section: 'event-areas' as const, label: 'Event Areas', count: eventAreaCount, icon: 'A', tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300' },
              ].map((summary) => (
                <button
                  key={summary.label}
                  type="button"
                  aria-pressed={activeOperationsSection === summary.section}
                  data-testid={`operations-section-${summary.section}`}
                  onClick={() => selectOperationsSection(summary.section)}
                  className={`rounded-[18px] border bg-white p-4 text-left shadow-[0_1px_2px_rgba(11,22,56,0.04)] transition hover:border-indigo-300 hover:bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:bg-zinc-900/60 ${activeOperationsSection === summary.section ? 'border-indigo-400 bg-indigo-50/50 ring-1 ring-indigo-200 dark:border-indigo-700 dark:bg-indigo-950/30 dark:ring-indigo-900' : 'border-slate-200 dark:border-zinc-800'}`}
                >
                  <div className="flex items-center gap-3"><span aria-hidden="true" className={`event-type-control flex h-9 w-9 items-center justify-center rounded-lg ${summary.tone}`}>{summary.icon}</span><div><p className="event-type-section-title leading-none tabular-nums text-slate-950 dark:text-white">{summary.count}</p><p className="event-type-meta mt-1 text-slate-500 dark:text-zinc-400">{summary.label}</p></div></div>
                </button>
              ))}
            </div>
          </div>

          {activeOperationsSection !== 'event-areas' && <section aria-label={activeOperationsSection === 'sessions' ? 'Session management' : 'Speaker management'}>
            <EventAgendaWorkspace
              eventId={eventId}
              accountSlug={accountSlug ?? ''}
              workspace={activeOperationsView}
              templateEvent={isTemplateEvent}
              templateAgendaSetup={isTemplateAgendaSetup}
              onAgendaChanged={() => { void refreshWorkspaceData(ALL_WORKSPACE_SLICES) }}
              onAgendaImportStateChanged={setAgendaImportState}
            />
          </section>}

        {activeOperationsSection === 'event-areas' && <>
          <EventAreasWorkspace
            accountSlug={accountSlug ?? ''}
            eventId={eventId}
            items={eventAreaStructureItems}
            surveys={availableAreaSurveys.map((survey) => ({
              ...survey,
              structureItemIds: surveys.find((candidate) => candidate.id === survey.id)?.assignmentTargets
                ?.map((target) => target.eventStructureItemId)
                .filter((id): id is string => Boolean(id))
                ?? (surveys.find((candidate) => candidate.id === survey.id)?.target?.eventStructureItemId
                  ? [surveys.find((candidate) => candidate.id === survey.id)?.target?.eventStructureItemId as string]
                  : []),
            }))}
            openCreate={showAreaCreate}
            onCreateOpened={() => setShowAreaCreate(false)}
            onCreated={(item) => setStructureItems((current) => current.some((existing) => existing.id === item.id) ? current : [...current, item as EventStructureItem])}
            onChanged={() => refreshWorkspaceData(['surveys', 'structure', 'listeningPlan'])}
          />
          {/* Legacy generic structure editor is intentionally disconnected from the Event Areas route.
        <section id="event-areas" aria-label="Event Areas management" className="space-y-4">
          <EventCard padding="none">
          {structureFormError && (
            <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {structureFormError}
            </div>
          )}

          {showCreateStructure && (
            <div className="border-b border-slate-200 p-5 dark:border-zinc-800">
              <StructureItemForm
                form={structureForm}
                submitting={savingStructure}
                submitLabel="Add Event Area"
                onChange={setStructureForm}
                onSubmit={handleCreateStructureItem}
                onCancel={() => {
                  setShowCreateStructure(false)
                  setStructureForm(EMPTY_STRUCTURE_FORM)
                  setStructureFormError(null)
                }}
              />
            </div>
          )}

           <div className="p-4">
            <OperationsSearchToolbar
              entityLabel="event areas"
              selectedCount={selectedBulkAreaIds.length}
              hasResults={filteredAreaCount > 0}
              allSelected={filteredAreaCount > 0 && filteredStructureGroups.every((group) => group.items.every((item) => selectedBulkAreaIds.includes(item.id)))}
              onToggleAll={(checked) => setSelectedBulkAreaIds((current) => checked ? [...new Set([...current, ...filteredStructureGroups.flatMap((group) => group.items.map((item) => item.id))])] : current.filter((id) => !filteredStructureGroups.some((group) => group.items.some((item) => item.id === id))))}
              searchValue={areaSearch}
              onSearchChange={setAreaSearch}
              searchPlaceholder="Search event areas..."
              filters={<div className="flex flex-wrap items-center gap-2" aria-label="Event area filters">
                {areaFilterChips.map((chip) => {
                  const isActive = chip.key === areaFilter
                  return <button key={chip.key} type="button" onClick={() => setAreaFilter(chip.key)} aria-pressed={isActive} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${isActive ? 'border-[#0B1638] bg-[#0B1638] text-white' : 'border-[#e5e8ef] bg-white text-slate-600 hover:bg-slate-50'}`}>{chip.label}{typeof chip.count === 'number' && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{chip.count.toLocaleString()}</span>}</button>
                })}
              </div>}
            />
          </div>

          {filteredAreaCount === 0 ? (
            <div className="p-5">
              <EventEmptyState
                size="sm"
                title={eventAreaStructureItems.length === 0 ? 'No Event Areas yet' : 'No feedback points match your filters'}
                description={
                  eventAreaStructureItems.length === 0
                    ? 'Add an Event Area to collect feedback here.'
                    : 'Try a different search or filter, or clear them to see all feedback points.'
                }
                actions={
                  eventAreaStructureItems.length === 0
                    ? undefined
                    : [
                        {
                          label: 'Clear filters',
                          variant: 'secondary',
                          onClick: () => {
                            setAreaSearch('')
                            setAreaFilter('all')
                          },
                        },
                      ]
                }
              />
            </div>
          ) : (
          <div>
            {filteredStructureGroups.map((group) => (
              <section key={group.value} className="border-t border-slate-200 first:border-t-0 dark:border-zinc-800">
                <button
                  type="button"
                  aria-expanded={areaSearchQuery || areaFilter !== 'all' ? group.items.length > 0 : expandedAreaGroups[group.value]}
                  aria-controls={`event-area-group-${group.value}`}
                  onClick={() => setExpandedAreaGroups((current) => ({ ...current, [group.value]: !current[group.value] }))}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 dark:hover:bg-zinc-900/60"
                >
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                      {group.groupLabel} <span className="ml-1 text-zinc-400">{group.items.length}</span>
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{group.description}</p>
                  </div>
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${(areaSearchQuery || areaFilter !== 'all' ? group.items.length > 0 : expandedAreaGroups[group.value]) ? 'rotate-180' : ''}`}><path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>

                {(areaSearchQuery || areaFilter !== 'all' ? group.items.length > 0 : expandedAreaGroups[group.value]) && (group.items.length > 0 ? (
                  <div id={`event-area-group-${group.value}`}>
                    {group.items.map((item) => {
                      const startsAt = formatStructureDate(item.startsAt)
                      const endsAt = formatStructureDate(item.endsAt)
                      const isEditing = editingStructureItemId === item.id
                      const attachedSurvey = surveyByStructureItemId.get(item.id)
                      const rowActions = resolveEventRowActions({
                        survey: !attachedSurvey ? 'none' : attachedSurvey.status === 'DRAFT' ? 'draft' : 'active',
                        responseCount: attachedSurvey?.responseCount ?? 0,
                        surveysAvailable: true,
                      })

                      return (
                        <div
                          key={item.id}
                          className="border-t border-slate-100 px-5 py-3 first:border-t-0 dark:border-zinc-800"
                        >
                          {isEditing ? (
                            <StructureItemForm
                              form={editingStructureForm}
                              editingItemId={item.id}
                              submitting={savingStructure}
                              submitLabel="Save Changes"
                              onChange={setEditingStructureForm}
                              onSubmit={handleUpdateStructureItem}
                              onCancel={() => {
                                setEditingStructureItemId(null)
                                setEditingStructureForm(EMPTY_STRUCTURE_FORM)
                                setStructureFormError(null)
                              }}
                            />
                          ) : (
                            <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${selectedBulkAreaIds.includes(item.id) ? 'bg-indigo-50/50 -mx-5 px-5 py-2 dark:bg-indigo-950/20' : ''}`}>
                              <label className="flex shrink-0 items-center"><input type="checkbox" aria-label={`Select ${item.name} for feedback survey`} checked={selectedBulkAreaIds.includes(item.id)} onChange={(event) => setSelectedBulkAreaIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} /></label>
                              <button
                                type="button"
                                onClick={() => handleStartEditingStructureItem(item)}
                                className="-m-1 min-w-0 flex-1 rounded-lg p-1 text-left transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/40"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                                    {item.name}
                                  </h4>
                                </div>
                                {item.description && (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-zinc-400">
                                    {item.description}
                                  </p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400 dark:text-zinc-500">
                                  {(startsAt || endsAt) && <span>{[startsAt, endsAt].filter(Boolean).join(' – ')}</span>}
                                  {item.timezone && <span>{item.timezone}</span>}
                                </div>
                              </button>

                              <EventRowActions
                                actions={rowActions}
                                onSecondary={() => handleStartEditingStructureItem(item)}
                                primary={!selectedBulkAreaIds.includes(item.id) && rowActions.primary?.id === 'attach-survey' ? <EventSurveyLibraryPicker surveys={availableAreaSurveys} currentEventId={eventId} selectedSurveyId="" onSelect={(surveyId) => void applyBulkAreaSurvey(surveyId, [item.id], 'REPLACE_EXISTING')} onClear={() => undefined} triggerLabel="Attach survey" isSurveySelectable={(survey) => isSurveyAssignableToEventTarget(survey, eventId)} /> : !selectedBulkAreaIds.includes(item.id) && rowActions.primary?.id === 'finish-survey' && attachedSurvey ? <EventRowActionButton variant="primary" href={surveyEditPath(attachedSurvey.id)}>Finish survey</EventRowActionButton> : !selectedBulkAreaIds.includes(item.id) && rowActions.primary?.id === 'view-results' && attachedSurvey ? <EventRowActionButton variant="primary" href={surveyEditPath(attachedSurvey.id)}>View results</EventRowActionButton> : null}
                                overflow={<EventRowActionButton onClick={() => handleArchiveStructureItem(item)} disabled={savingStructure || Boolean(archivingStructureItemId)} className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30">{archivingStructureItemId === item.id ? 'Archiving...' : 'Archive'}</EventRowActionButton>}
                              ><EventRowStatus statuses={rowActions.statuses} /></EventRowActions>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div id={`event-area-group-${group.value}`} className="border-t border-slate-100 px-5 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    No {group.groupLabel.toLowerCase()} added yet.
                  </div>
                ))}
              </section>
            ))}
          </div>
          )}
          </EventCard>
          {selectedBulkAreaIds.length > 0 && <div className="fixed inset-x-0 bottom-5 z-40 mx-auto w-[min(820px,calc(100vw-32px))] rounded-[28px] bg-[#071d49] px-5 py-4 shadow-[0_20px_48px_rgba(7,29,73,0.34)]" role="region" aria-label="Bulk survey assignment" data-testid="bulk-area-survey-selection-bar"><div className="flex flex-wrap items-center justify-center gap-4 sm:justify-between"><div className="flex items-center gap-3 text-white"><span className="grid h-10 min-w-10 place-items-center rounded-full bg-[#2450ae] px-3 text-lg font-bold">{selectedBulkAreaIds.length}</span><p className="text-lg font-semibold">event area{selectedBulkAreaIds.length === 1 ? '' : 's'} selected</p></div><div className="flex items-center gap-4 border-l border-white/20 pl-4"><EventSurveyLibraryPicker surveys={availableAreaSurveys} currentEventId={eventId} selectedSurveyId={bulkAreaSurveyId} onSelect={setBulkAreaSurveyId} onClear={() => setBulkAreaSurveyId('')} triggerLabel="Attach survey" triggerTone="bulk" bulkContext={{ count: selectedBulkAreaIds.length, noun: `event area${selectedBulkAreaIds.length === 1 ? '' : 's'}`, confirmLabel: `Attach to ${selectedBulkAreaIds.length} event area${selectedBulkAreaIds.length === 1 ? '' : 's'}`, onConfirm: requestBulkAreaSurvey, overwriteCount: bulkAreaOverwriteCount }} isSurveySelectable={(survey) => isSurveyAssignableToEventTarget(survey, eventId)} /><button type="button" className="text-base font-semibold text-white/70 hover:text-white" onClick={() => setSelectedBulkAreaIds([])}>Clear</button></div></div></div>}
          <EventConfirmDialog open={Boolean(pendingAreaReplacement)} title="Some selected event areas already have a survey" body={pendingAreaReplacement ? <div className="space-y-3"><p>{pendingAreaReplacement.overwriteCount} of {pendingAreaReplacement.targetIds.length} already has a survey and will be replaced.</p><Button type="button" size="sm" variant="danger" disabled={bulkAreaSaving} onClick={() => void applyBulkAreaSurvey(pendingAreaReplacement.surveyId, pendingAreaReplacement.targetIds, 'REPLACE_EXISTING')}>Replace existing assignments</Button></div> : null} confirmLabel="Skip existing" busy={bulkAreaSaving} onConfirm={() => pendingAreaReplacement && void applyBulkAreaSurvey(pendingAreaReplacement.surveyId, pendingAreaReplacement.targetIds, 'SKIP_EXISTING')} onCancel={() => setPendingAreaReplacement(null)} />
        </section>*/}</>}
        </section>
        )}

        {activeTab === 'surveys' && (
          <EventTemplateSurveyWorkspace
            eventId={eventId}
            accountSlug={accountSlug ?? ''}
            onChanged={() => { void refreshWorkspaceData(ALL_WORKSPACE_SLICES) }}
          />
        )}

        {activeTab === 'deploy' && (
        <div className="space-y-4">
          <EventCard padding="md">
            <EventDeploymentWorkspace
              eventId={eventId}
              accountSlug={accountSlug ?? ''}
              eventName={event.name}
              surveys={surveyDeployments}
              accountBranding={accountBranding}
              initialSurveyId={searchParams.get('deploySurvey')}
              onSignageApplied={() => refreshWorkspaceData(['surveys'])}
            />
          </EventCard>
        </div>
        )}
      </div>
    </EventWorkspaceShell>
  )
}

export default function EventDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50" />
    }>
      <EventDetailContent />
    </Suspense>
  )
}
