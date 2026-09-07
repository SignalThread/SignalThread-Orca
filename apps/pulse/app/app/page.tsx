'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { FirstSurveyHero } from '@/components/admin/onboarding/FirstSurveyHero'
import { isInitialSeedSurvey } from '@/lib/events'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SurveyQrCard } from '@/components/ui/SurveyQrCard'
import { KPICard } from '@/components/admin/dashboard/KPICard'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { isRetailAccount } from '@/lib/account-product-mode'
import {
  ArrowRight,
  BarChart3,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import {
  EventCard,
  EventStatusPill,
  EventEmptyState,
} from '@/components/app/events'
import { type InferredSatisfactionSummary } from '@/lib/analytics/satisfaction'
import { groupEventsForHome } from '@/lib/events-home-groups'

const LOCATION_TEAM_TOOLTIP =
  'A Location or Team is where feedback is collected. For example, a store, office, or crew.'

const EVENT_WORKSPACE_TOOLTIP =
  'An Event Workspace organizes where attendee feedback is collected for Events.'

interface Location {
  id: string
  name: string
  city: string | null
  state: string | null
  isActive: boolean
  events: Event[]
}

interface Event {
  id: string
  name: string
  status: string
  eventType: string
  startDate: string | null
  endDate: string | null
  isActive: boolean
  questionsJson?: unknown[] | null
  template?: string | null
}

interface EventHomeMetric {
  responses: number
  responsesToday: number
  surveyCount: number
  liveSurveyCount?: number
  draftSurveyCount?: number
  openAttentionCount: number
  satisfaction: InferredSatisfactionSummary | null
  topOpenIssue: {
    id: string
    title: string
    summary: string | null
    priorityLevel: string
  } | null
  launch?: {
    token: string
    surveyId: string
    kioskPath: string
  } | null
}

interface AccountData {
  account: {
    id: string
    name: string
    accountType: string
    tier: string
  }
  locations: Location[]
  metrics: {
    totalEvents: number
    totalResponses: number
    avgSentiment: number | null
    /** Completed responses today across the account's events. */
    responsesToday?: number
    /** Open attention items across live events. */
    needActionCount?: number
    /** Live events count (server-derived). */
    liveCount?: number
  }
  /** Per-event truthful metrics keyed by event id (EVENTS accounts). */
  eventMetrics?: Record<string, EventHomeMetric>
}

interface CopySurveyState {
  event: Event
  sourceLocationId: string
}

type EventsHomeFilter = 'all' | 'live' | 'upcoming' | 'past'

const neutralActionButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100/90 hover:text-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800/90 dark:hover:text-zinc-200 dark:disabled:hover:bg-transparent'

function formatEventDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  const fmt = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const startLabel = start ? fmt(start) : null
  const endLabel = end ? fmt(end) : null
  if (startLabel && endLabel) return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`
  return startLabel || endLabel
}

function getLocationLabel(location: Location | null): string {
  if (!location) return 'Venue TBD'
  const place = [location.city, location.state].filter(Boolean).join(', ')
  return place ? `${location.name} · ${place}` : location.name
}

function EventsHomeSummaryStrip({
  liveCount,
  responsesTodayCount,
  needActionCount,
}: {
  liveCount: number
  responsesTodayCount: number
  needActionCount: number
}) {
  const metrics = [
    { label: 'Live now', value: liveCount, tone: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'Responses today', value: responsesTodayCount, tone: 'text-slate-950 dark:text-zinc-50' },
    { label: 'Need action', value: needActionCount, tone: needActionCount > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-950 dark:text-zinc-50' },
  ]
  return (
    <section aria-label="Event overview" className="mb-5 overflow-hidden rounded-xl border border-[#e8ebf2] bg-white shadow-[0_1px_2px_rgba(11,22,56,0.04)]">
      <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-zinc-800">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 sm:px-5">
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">{metric.label}</span>
            <span className={`text-lg font-bold tabular-nums ${metric.tone}`}>{metric.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function EventsHomeBrowser({
  liveEvents,
  upcomingEvents,
  pastEvents,
  eventsByLocation,
  eventMetrics,
  accountSlug,
  createEventPath,
  filter,
  query,
  onFilterChange,
  onQueryChange,
  onDeleteEvent,
}: {
  liveEvents: Event[]
  upcomingEvents: Event[]
  pastEvents: Event[]
  eventsByLocation: Map<string, Location>
  eventMetrics: Record<string, EventHomeMetric>
  accountSlug: string | null
  createEventPath: string
  filter: EventsHomeFilter
  query: string
  onFilterChange: (filter: EventsHomeFilter) => void
  onQueryChange: (query: string) => void
  onDeleteEvent: (event: Event) => void
}) {
  const router = useRouter()
  const eventRows = [
    ...liveEvents.map((event) => ({ event, bucket: 'live' as const })),
    ...upcomingEvents.map((event) => ({ event, bucket: 'upcoming' as const })),
    ...pastEvents.map((event) => ({ event, bucket: 'past' as const })),
  ]
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = eventRows.filter(({ event, bucket }) => {
    if (filter !== 'all' && filter !== bucket) return false
    if (!normalizedQuery) return true
    const location = eventsByLocation.get(event.id) ?? null
    return [
      event.name,
      event.status,
      bucket,
      getLocationLabel(location),
      formatEventDateRange(event.startDate, event.endDate) ?? '',
    ].some((value) => value.toLowerCase().includes(normalizedQuery))
  })
  const tabs: Array<{ value: EventsHomeFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: eventRows.length },
    { value: 'live', label: 'Live', count: liveEvents.length },
    { value: 'upcoming', label: 'Upcoming', count: upcomingEvents.length },
    { value: 'past', label: 'Past', count: pastEvents.length },
  ]

  const hasEvents = eventRows.length > 0

  return (
    <EventCard padding="none" className="overflow-hidden" data-testid="events-home-browser">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between sm:px-5">
        <div>
          <h2 className="text-sm font-bold text-slate-950 dark:text-zinc-50">Events</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            Browse and open every event in this account.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-800" role="tablist" aria-label="Event status filter">
            {tabs.map((tab) => {
              const selected = filter === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onFilterChange(tab.value)}
                  className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition ${
                    selected
                      ? 'bg-white text-slate-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                      : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  {tab.label}
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>
          <label className="relative block min-w-0 sm:w-56">
            <span className="sr-only">Search events</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search events"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        </div>
      </div>
      {!hasEvents ? (
        <div className="p-3">
          <EventEmptyState
            size="sm"
            title="No events yet"
            description="Create your first event to start collecting attendee feedback."
            actions={[{ label: 'New event', href: createEventPath, variant: 'primary' }]}
          />
        </div>
      ) : filteredRows.length > 0 ? (
        <div className="divide-y divide-slate-100 dark:divide-zinc-800" data-testid="events-home-all-events-list">
          {filteredRows.map(({ event, bucket }) => {
            const location = eventsByLocation.get(event.id) ?? null
            const metric = eventMetrics[event.id] ?? null
            const href = `/app/events/${event.id}?account=${accountSlug}`
            const dashboardHref = `/app/events/${event.id}/dashboard?account=${accountSlug}`
            // One canonical lifecycle rule: the bucket is date-derived, so the
            // badge never leaks raw DRAFT/ACTIVE storage status for future events.
            const statusLabel = bucket === 'live' ? 'Live now' : bucket === 'past' ? 'Completed' : 'Upcoming'
            return (
              <div
                key={event.id}
                data-testid="events-home-event-entry"
                role="link"
                tabIndex={0}
                aria-label={`Open ${event.name}`}
                onClick={() => router.push(href)}
                onKeyDown={(interaction) => {
                  if (interaction.target !== interaction.currentTarget) return
                  if (interaction.key === 'Enter' || interaction.key === ' ') {
                    interaction.preventDefault()
                    router.push(href)
                  }
                }}
                className="grid cursor-pointer gap-3 px-4 py-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-zinc-900 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className="truncate text-[15px] font-bold text-slate-950 dark:text-zinc-50">
                      {event.name.replace(/^SignalThread\s+/i, '')}
                    </span>
                    <EventStatusPill status={statusLabel} size="sm" />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-zinc-400">
                    <span>{formatEventDateRange(event.startDate, event.endDate) ?? 'Date TBD'}</span>
                    <span aria-hidden>·</span>
                    <span>{getLocationLabel(location)}</span>
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    <span>{metric?.surveyCount ?? 0} surveys</span>
                    {(metric?.surveyCount ?? 0) > 0 && <><span aria-hidden>·</span><span>{metric?.liveSurveyCount ?? 0} live</span><span aria-hidden>·</span><span>{metric?.draftSurveyCount ?? 0} draft</span></>}
                    <span aria-hidden>·</span>
                    <span>{metric?.responses ?? 0} responses</span>
                    <span aria-hidden>·</span>
                    <span className={metric?.openAttentionCount ? 'text-rose-600 dark:text-rose-300' : ''}>{metric?.openAttentionCount ?? 0} attention</span>
                  </span>
                </span>

                <span className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap md:justify-end" data-tour="survey-actions">
                  <a
                    href={dashboardHref}
                    onClick={(interaction) => interaction.stopPropagation()}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                  >
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                    Signals
                  </a>
                  <button
                    type="button"
                    data-testid="events-home-delete-event"
                    aria-label={`Delete ${event.name}`}
                    title={`Delete ${event.name}`}
                    onClick={(interaction) => {
                      interaction.stopPropagation()
                      onDeleteEvent(event)
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-400 text-red-600 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-500/80 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <a
                    href={href}
                    onClick={(interaction) => interaction.stopPropagation()}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-blue-800 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-900"
                  >
                    Open event
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="p-3">
          <EventEmptyState
            size="sm"
            title="No events match"
            description="Try a different search or status filter."
          />
        </div>
      )}
    </EventCard>
  )
}

function CustomerAdminHomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const accountSlug = searchParams.get('account')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AccountData | null>(null)
  const [statusUpdatingEventId, setStatusUpdatingEventId] = useState<string | null>(null)
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<Event | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  const [eventDeleteError, setEventDeleteError] = useState<string | null>(null)
  const [copySurveyState, setCopySurveyState] = useState<CopySurveyState | null>(null)
  const [copySurveyName, setCopySurveyName] = useState('')
  const [copyTargetLocationId, setCopyTargetLocationId] = useState('')
  const [copyingEventId, setCopyingEventId] = useState<string | null>(null)
  const [copySurveyError, setCopySurveyError] = useState<string | null>(null)
  const [eventsHomeFilter, setEventsHomeFilter] = useState<EventsHomeFilter>('all')
  const [eventsHomeQuery, setEventsHomeQuery] = useState('')

  const loadAccountData = async (signal?: AbortSignal) => {
    if (!accountSlug) {
      setError('No account specified. Please select an account from the login page.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/app/account?account=${accountSlug}`, { signal })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(response.status === 404 ? 'Account not found' : (body?.error || response.statusText))
      }
      setData(body)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to load account data')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadAccountData(controller.signal)
    return () => controller.abort()
  }, [accountSlug])

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-zinc-400">Loading account data...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Card className="max-w-md">
            <div className="text-center">
              <div className="text-red-500 text-4xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2">
                {error === 'Account not found' ? 'Account Not Found' : 'Error Loading Account'}
              </h2>
              <p className="text-zinc-400 mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </Card>
        </div>
      </AdminLayout>
    )
  }

  const { account, locations, metrics } = data

  // Build account-scoped URLs
  const accountPath = `/app?account=${accountSlug}`

  const isRetail = isRetailAccount(account.accountType)
  const surveyLabel = isRetail ? 'Survey' : 'Event'
  const surveysLabel = isRetail ? 'Surveys' : 'Events'
  const workspacePluralLabel = isRetail ? 'Locations/Teams' : 'Event Workspaces'
  const workspaceSingularLabel = isRetail ? 'Location/Team' : 'Event Workspace'
  const workspaceTooltip = isRetail ? LOCATION_TEAM_TOOLTIP : EVENT_WORKSPACE_TOOLTIP
  const collectionSectionLabel = isRetail ? 'Surveys' : 'Event Containers'
  const copyActionLabel = isRetail ? 'Copy Survey' : 'Copy Event'
  const deleteActionLabel = isRetail ? 'Delete Survey' : 'Delete Event'
  const getStatusActionLabel = (event: Event) => {
    if (isRetail) {
      return event.status === 'ACTIVE' ? 'Stop Survey' : event.status === 'COMPLETED' ? 'Reopen Survey' : 'Start Survey'
    }
    return event.status === 'ACTIVE' ? 'Pause Event Feedback' : event.status === 'COMPLETED' ? 'Reopen Event Feedback' : 'Activate Event Feedback'
  }

  // Exclude auto-created seed surveys for hero gating
  const allEvents = locations.flatMap((loc) => loc.events)
  const realEvents = isRetail ? allEvents.filter((e) => !isInitialSeedSurvey(e)) : allEvents

  // Find first event for analytics link
  const firstEvent = locations.flatMap((loc) => loc.events).find((e) => e.status === 'ACTIVE') ||
    locations.flatMap((loc) => loc.events)[0]
  const hasEvent = Boolean(firstEvent)
  const createEventPath = `/app/events/new?account=${accountSlug}`
  const primaryEventPath = firstEvent
    ? `/app/events/${firstEvent.id}?account=${accountSlug}`
    : accountPath
  const createOrOpenSurveyPath = isRetail
    ? `/app/surveys/create?account=${accountSlug}`
    : createEventPath
  const createOrOpenSurveyLabel = isRetail
    ? `Create ${surveyLabel}`
    : `Create ${surveyLabel}`

  // EVENTS Home command-hub derivations (events-only; real, event-scoped data
  // from /api/app/account eventMetrics — never account-wide or legacy values).
  const eventMetrics = data.eventMetrics ?? {}
  const eventsByLocation = new Map<string, Location>()
  locations.forEach((location) => {
    location.events.forEach((event) => eventsByLocation.set(event.id, location))
  })
  const eventBuckets = groupEventsForHome(realEvents)
  const liveEvents = eventBuckets.live
  const upcomingEvents = eventBuckets.upcoming
  const pastEvents = eventBuckets.past

  // Top summary cards — event-scoped, correctly labeled.
  const responsesTodayCount = metrics.responsesToday ?? 0
  const needActionCount = metrics.needActionCount ?? 0

  const handleSurveyStatusChange = async (event: Event) => {
    if (!accountSlug || statusUpdatingEventId) return
    const newStatus = event.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE'
    setStatusUpdatingEventId(event.id)
    try {
      const res = await fetch(`/api/app/events/${event.id}?account=${accountSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to update')
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          locations: prev.locations.map((loc) => ({
            ...loc,
            events: loc.events.map((e) =>
              e.id === event.id ? { ...e, status: newStatus } : e
            ),
          })),
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update survey status')
    } finally {
      setStatusUpdatingEventId(null)
    }
  }

  const handleDeleteSurvey = async (event: Event) => {
    if (!accountSlug || deletingEventId) return
    setDeletingEventId(event.id)
    try {
      const res = await fetch(`/api/app/events/${event.id}?account=${accountSlug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationName: event.name }),
      })
      const json = await res.json()
      if (!res.ok || (!isRetail && !json?.success)) throw new Error(json.error || 'Failed to delete')
      setDeleteConfirmEvent(null)
      if (!isRetail) setEventDeleteError(null)
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          locations: prev.locations.map((loc) => ({
            ...loc,
            events: loc.events.filter((e) => e.id !== event.id),
          })),
        }
      })
    } catch (err) {
      if (isRetail) setError(err instanceof Error ? err.message : 'Failed to delete survey')
      else setEventDeleteError(err instanceof Error ? err.message : 'Failed to delete event')
    } finally {
      setDeletingEventId(null)
    }
  }

  const openEventDeleteModal = (event: Event) => {
    setEventDeleteError(null)
    setDeleteConfirmEvent(event)
  }

  const openCopySurveyModal = (event: Event, sourceLocationId: string) => {
    setCopySurveyError(null)
    setCopySurveyState({ event, sourceLocationId })
    setCopySurveyName(`Copy of ${event.name}`)
    setCopyTargetLocationId(sourceLocationId)
  }

  const closeCopySurveyModal = () => {
    setCopySurveyState(null)
    setCopySurveyError(null)
    setCopySurveyName('')
    setCopyTargetLocationId('')
  }

  const handleCopySurvey = async () => {
    if (!accountSlug || !copySurveyState || copyingEventId) return

    const trimmedName = copySurveyName.trim()
    if (!trimmedName) {
      setCopySurveyError(isRetail ? 'Survey name is required' : 'Event name is required')
      return
    }

    if (!copyTargetLocationId) {
      setCopySurveyError(isRetail ? 'Choose a target Location/Team' : 'Choose a target Event Workspace')
      return
    }

    setCopyingEventId(copySurveyState.event.id)
    setCopySurveyError(null)

    try {
      const res = await fetch(`/api/app/events/${copySurveyState.event.id}/copy?account=${accountSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          locationId: copyTargetLocationId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to copy survey')
      }

      closeCopySurveyModal()
      const copiedEventId = json.event?.id
      if (copiedEventId) {
        router.push(
          isRetail
            ? `/app/surveys/${copiedEventId}/edit?account=${accountSlug}`
            : `/app/events/${copiedEventId}/edit?account=${accountSlug}`,
        )
        return
      }

      await loadAccountData()
    } catch (err) {
      setCopySurveyError(err instanceof Error ? err.message : 'Failed to copy survey')
    } finally {
      setCopyingEventId(null)
    }
  }

  return (
    <AdminLayout
      homePath={accountPath}
      fullWidthContent={!isRetail}
    >
      {!isRetail && (
        <div className="min-h-screen bg-slate-50 py-5 text-slate-950 dark:bg-zinc-950 dark:text-zinc-50">
          <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-zinc-50 sm:text-3xl">Your events</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                  Manage live, upcoming, and completed event feedback in one place.
                </p>
              </div>
              <button
                type="button"
                data-tour="create-survey-button"
                onClick={() => router.push(createEventPath)}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-800 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 sm:w-auto"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New event
              </button>
            </header>

            <EventsHomeSummaryStrip
              liveCount={liveEvents.length}
              responsesTodayCount={responsesTodayCount}
              needActionCount={needActionCount}
            />

            <section className="mb-6">
              <EventsHomeBrowser
                liveEvents={liveEvents}
                upcomingEvents={upcomingEvents}
                pastEvents={pastEvents}
                eventsByLocation={eventsByLocation}
                eventMetrics={eventMetrics}
                accountSlug={accountSlug}
                createEventPath={createEventPath}
                filter={eventsHomeFilter}
                query={eventsHomeQuery}
                onFilterChange={setEventsHomeFilter}
                onQueryChange={setEventsHomeQuery}
                onDeleteEvent={openEventDeleteModal}
              />
            </section>
          </div>
        </div>
      )}

      {isRetail && (
      <>
      <PageHeader
        title={account.name}
        subtitle="Manage your feedback collection points"
      />

      {/* ── Hero Action Row (retail keeps the generic quick-action cards) ── */}
      {isRetail && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mb-10">
        {/* Account Setup */}
        <button
          data-tour="account-setup-card"
          onClick={() => router.push(`/app/settings/profile?account=${accountSlug}`)}
          className="text-left rounded-lg border-2 border-sky-200 dark:border-sky-800/60 bg-white dark:bg-zinc-900 shadow-md dark:shadow-sm p-6 sm:p-7 hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-lg transition-all group flex flex-col"
        >
          <div className="w-12 h-12 rounded-xl bg-sky-500 flex items-center justify-center mb-8 sm:mb-10 text-white group-hover:bg-sky-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Account Setup</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-snug">
            {isRetail
              ? 'Configure your profile, locations/teams, and preferences'
              : 'Configure your Event profile, workspaces, and preferences'}
          </p>
        </button>

        {/* Create Survey */}
        <button
          data-tour="create-survey-button"
          onClick={() => router.push(createOrOpenSurveyPath)}
          className="text-left rounded-lg border-2 border-sky-200 dark:border-sky-800/60 bg-white dark:bg-zinc-900 shadow-md dark:shadow-sm p-6 sm:p-7 hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-lg transition-all group flex flex-col"
        >
          <div className="flex items-start justify-between mb-8 sm:mb-10">
            <div className="w-12 h-12 rounded-xl bg-sky-500 flex items-center justify-center text-white group-hover:bg-sky-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{createOrOpenSurveyLabel}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-snug">
            {isRetail ? 'Set up a new feedback kiosk' : 'Create a new Event container'}
          </p>
        </button>

        {/* View Analytics / Open Event */}
        <button
          onClick={() => {
            if (firstEvent) {
              router.push(`/app/events/${firstEvent.id}?account=${accountSlug}`)
            }
          }}
          disabled={!firstEvent}
          className="text-left rounded-lg border-2 border-sky-200 dark:border-sky-800/60 bg-white dark:bg-zinc-900 shadow-md dark:shadow-sm p-6 sm:p-7 hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-lg transition-all group flex flex-col disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md disabled:hover:border-sky-200 dark:disabled:hover:border-sky-800/60"
        >
          <div className="w-12 h-12 rounded-xl bg-sky-500 flex items-center justify-center mb-8 sm:mb-10 text-white group-hover:bg-sky-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            {isRetail ? 'View Analytics' : 'Open Event'}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-snug">
            {isRetail
              ? `See responses and insights across all ${surveysLabel.toLowerCase()}`
              : 'Open the event detail workspace'}
          </p>
        </button>
      </div>
      )}

      {/* ── Onboarding Hero (only when zero real events; ignores seed surveys) ── */}
      {realEvents.length === 0 && (
        <FirstSurveyHero
          accountSlug={accountSlug}
          isRetail={isRetail}
          eventPath={isRetail ? undefined : primaryEventPath}
          eventCreatePath={isRetail ? undefined : createEventPath}
          hasEvent={hasEvent}
        />
      )}

      {/* ── Overall Statistics (retail; EVENTS shows these in the command hub strip) ── */}
      {isRetail && (
      <section className="mb-10">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">Overall Statistics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            label={`Active ${surveysLabel}`}
            value={metrics.totalEvents}
          />
          <KPICard
            label="Total Responses"
            value={metrics.totalResponses}
          />
          <KPICard
            label="Avg Sentiment"
            value={metrics.avgSentiment ? `${(metrics.avgSentiment * 100).toFixed(0)}%` : 'N/A'}
            variant={metrics.avgSentiment && metrics.avgSentiment >= 0.6 ? 'success' : 'default'}
            change={metrics.avgSentiment ? { value: '↗', trend: metrics.avgSentiment >= 0.6 ? 'up' : 'neutral' } : undefined}
          />
        </div>
      </section>
      )}

      {/* ── Workspaces and collections ── */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {workspacePluralLabel}
              </h2>
              <InfoTooltip content={workspaceTooltip} />
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {isRetail
                ? 'Manage where feedback is collected and the surveys running there.'
                : 'Organize Event workspaces and the Event containers they hold.'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(createOrOpenSurveyPath)}
            className="w-full sm:w-auto"
          >
            {isRetail ? `+ Create ${surveyLabel}` : createOrOpenSurveyLabel}
          </Button>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4" />

        {locations.length === 0 ? (
          <Card>
            <div className="text-center py-8 sm:py-12">
              <div className="text-4xl mb-4">📍</div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                {isRetail ? 'No Locations/Teams Yet' : 'No Event Workspaces Yet'}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                {isRetail
                  ? 'Create a Location or Team to start collecting feedback.'
                  : 'Create an Event Workspace to organize Events and attendee feedback.'}
              </p>
              <Button onClick={() => router.push(`/app/locations/new?account=${accountSlug}`)}>
                {isRetail ? 'Create Location/Team' : 'Create Event Workspace'}
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-5" data-tour="locations-surveys-list">
            {locations.map((location) => {
              const activeCount = location.events.filter((e) => e.status === 'ACTIVE').length
              const isPhysicalLocation = Boolean(location.city || location.state)

              return (
                <Card key={location.id} padding="none" className="overflow-hidden border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm">
                  {/* Workspace header */}
                  <div className="px-4 sm:px-6 py-5 bg-zinc-50/90 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {isPhysicalLocation ? (
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 21h18M5 21V7.8c0-.84 0-1.26.163-1.58a2 2 0 01.874-.874C6.36 5.18 6.78 5.18 7.62 5.18h8.76c.84 0 1.26 0 1.583.165a2 2 0 01.872.872C19 6.54 19 6.96 19 7.8V21M9 10h.01M9 14h.01M9 18h.01M15 10h.01M15 14h.01M15 18h.01" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 11a4 4 0 10-8 0 4 4 0 008 0zm-9 9a5 5 0 0110 0M20 18a4 4 0 00-3-3.87M17 5.13a4 4 0 010 7.75" />
                          </svg>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                          {location.name}
                          {!location.isActive && (
                            <span className="ml-2 rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                              Inactive
                            </span>
                          )}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${activeCount > 0 ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                          <span>
                            {activeCount > 0
                              ? `${activeCount} active ${activeCount === 1 ? surveyLabel.toLowerCase() : surveysLabel.toLowerCase()}`
                              : `No active ${surveysLabel.toLowerCase()}`}
                          </span>
                          {location.city || location.state ? (
                            <span className="text-zinc-400 dark:text-zinc-500">
                              {location.city}{location.city && location.state ? ', ' : ''}{location.state}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                          {isRetail ? (isPhysicalLocation ? 'Physical location' : 'Team / Crew') : 'Event workspace'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Nested collection section */}
                  <div className="px-4 sm:px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/30">
                    <div className="flex items-center gap-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {collectionSectionLabel}
                      </h4>
                    </div>
                  </div>

                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {location.events.length === 0 ? (
                      !isRetail ? (
                        <div className="px-4 py-5 sm:px-6">
                          <EventEmptyState
                            size="sm"
                            title="No events in this workspace yet"
                            description="Create an event to start collecting attendee feedback."
                            actions={[{ label: 'Create Event', href: createEventPath, variant: 'primary' }]}
                          />
                        </div>
                      ) : (
                        <div className="px-4 py-6 sm:px-6">
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            No {surveysLabel.toLowerCase()} for this {workspaceSingularLabel.toLowerCase()}
                          </p>
                        </div>
                      )
                    ) : (
                      location.events.map((event) => (
                        <div
                          key={event.id}
                          data-tour="survey-row"
                          className="flex flex-col gap-3 px-4 py-4 sm:px-6 sm:flex-row sm:items-center sm:justify-between"
                        >
                          {/* Collection info */}
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                              <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7.5 3.75h6.879c.398 0 .78.158 1.061.439l3.871 3.871c.281.281.439.663.439 1.061V18A2.25 2.25 0 0117.5 20.25h-10.5A2.25 2.25 0 014.75 18V6A2.25 2.25 0 017 3.75h.5zm0 5.5h9m-9 4h9m-9 4h5.5" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{event.name}</span>
                                {event.status === 'ACTIVE' ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                    ACTIVE
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                    {event.status}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                {isRetail
                                  ? event.eventType
                                    ? `${event.eventType.charAt(0)}${event.eventType.slice(1).toLowerCase()} survey`
                                    : 'Voice survey'
                                  : 'Event container'}
                              </p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5" data-tour="survey-actions">
                            {/* Analytics / Open Event */}
                            <div className="relative group">
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                                {isRetail ? 'Analytics' : 'Open Event'}
                              </span>
                              <button
                                type="button"
                                data-tour="survey-action-analytics"
                                aria-label={isRetail ? 'Analytics' : 'Open Event'}
                                title={isRetail ? 'Analytics' : 'Open Event'}
                                className={neutralActionButtonClass}
                                onClick={() => router.push(`/app/events/${event.id}?account=${accountSlug}`)}
                              >
                                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v18h18M7 14v4m5-8v8m5-12v12" />
                                </svg>
                              </button>
                            </div>

                            {/* Edit */}
                            <div className="relative group">
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                                Edit
                              </span>
                              <button
                                type="button"
                                data-tour="survey-action-edit"
                                aria-label="Edit"
                                title="Edit"
                                className={neutralActionButtonClass}
                                onClick={() => router.push(
                                  isRetail
                                    ? `/app/surveys/${event.id}/edit?account=${accountSlug}`
                                    : `/app/events/${event.id}/edit?account=${accountSlug}`
                                )}
                              >
                                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                </svg>
                              </button>
                            </div>

                            {/* Copy */}
                            <div className="relative group">
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                                {copyActionLabel}
                              </span>
                              <button
                                type="button"
                                data-tour="survey-action-copy"
                                data-testid="survey-action-copy"
                                aria-label={copyActionLabel}
                                title={copyActionLabel}
                                disabled={copyingEventId === event.id}
                                className={neutralActionButtonClass}
                                onClick={() => openCopySurveyModal(event, location.id)}
                              >
                                {copyingEventId === event.id ? (
                                  <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" aria-hidden="true" />
                                ) : (
                                  <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.25 8.25h6.5A2.25 2.25 0 0118 10.5V17a2.25 2.25 0 01-2.25 2.25h-6.5A2.25 2.25 0 017 17v-6.5a2.25 2.25 0 012.25-2.25z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.25 8.25V7A2.25 2.25 0 0013 4.75H6.5A2.25 2.25 0 004.25 7v6.5A2.25 2.25 0 006.5 15.75h1.25" />
                                  </svg>
                                )}
                              </button>
                            </div>

                            {/* Start / stop / reopen collection status via PATCH */}
                            <div className="relative group">
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                                {getStatusActionLabel(event)}
                              </span>
                              <button
                                type="button"
                                data-tour="survey-action-status"
                                aria-label={getStatusActionLabel(event)}
                                title={getStatusActionLabel(event)}
                                disabled={statusUpdatingEventId === event.id}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                  event.status === 'ACTIVE'
                                    ? 'text-red-500 hover:bg-red-50/90 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300'
                                    : 'text-emerald-600 hover:bg-emerald-50/90 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300'
                                }`}
                                onClick={() => handleSurveyStatusChange(event)}
                              >
                                {statusUpdatingEventId === event.id ? (
                                  <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" aria-hidden="true" />
                                ) : event.status === 'ACTIVE' ? (
                                  /* Stop / square icon */
                                  <svg className="h-4.5 w-4.5" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="6" width="12" height="12" rx="2" />
                                  </svg>
                                ) : (
                                  /* Play / triangle icon */
                                  <svg className="h-4.5 w-4.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
                                  </svg>
                                )}
                              </button>
                            </div>

                            {/* Kiosk view */}
                            <div className="relative group">
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                                {isRetail ? 'Kiosk View' : 'Event Feedback Kiosk'}
                              </span>
                              <button
                                type="button"
                                data-tour="survey-action-kiosk"
                                aria-label={isRetail ? 'Kiosk View' : 'Event Feedback Kiosk'}
                                title={isRetail ? 'Kiosk View' : 'Event Feedback Kiosk'}
                                disabled={!event.isActive || event.status !== 'ACTIVE'}
                                className={neutralActionButtonClass}
                                onClick={() => {
                                  if (event.isActive && event.status === 'ACTIVE') {
                                    window.open(`/kiosk?eventId=${event.id}`, '_blank')
                                  }
                                }}
                              >
                                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>

                            <SurveyQrCard
                              surveyName={event.name}
                              path={`/kiosk?eventId=${event.id}`}
                              fileName={`survey-qr-${event.id}.png`}
                              showInlineActions={false}
                              renderTrigger={({ open, disabled }) => (
                                <div className="relative group">
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                                    QR Code
                                  </span>
                                  <button
                                    type="button"
                                    data-tour="survey-action-qr"
                                    aria-label="QR Code"
                                    title="QR Code"
                                    disabled={disabled}
                                    className={neutralActionButtonClass}
                                    onClick={open}
                                  >
                                    <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                      <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3.25" strokeWidth={1.45} />
                                      <rect x="7" y="7" width="2.65" height="2.65" rx="0.45" fill="currentColor" stroke="none" />
                                      <rect x="14.35" y="7" width="2.65" height="2.65" rx="0.45" fill="currentColor" stroke="none" />
                                      <rect x="7" y="14.35" width="2.65" height="2.65" rx="0.45" fill="currentColor" stroke="none" />
                                      <rect x="14.35" y="14.35" width="1.6" height="1.6" rx="0.3" fill="currentColor" stroke="none" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.45} d="M17.25 14.35v2.9h-2.9M17.25 17.25h-1.3M17.25 17.25v1.1" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            />

                            {/* Retail surveys retain their existing list deletion flow. Events delete from Event Settings. */}
                            {isRetail && <div className="relative group">
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                                {deleteActionLabel}
                              </span>
                              <button
                                type="button"
                                data-tour="survey-action-delete"
                                data-testid="survey-action-delete"
                                aria-label={deleteActionLabel}
                                title={deleteActionLabel}
                                disabled={deletingEventId === event.id}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-red-50/90 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                                onClick={() => setDeleteConfirmEvent(event)}
                              >
                                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Copy confirmation modal */}
      <Modal
        isOpen={!!copySurveyState}
        onClose={closeCopySurveyModal}
        title={copyActionLabel}
      >
        {copySurveyState && (
          <>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              {isRetail ? (
                <>
                  Duplicate <span className="font-semibold text-zinc-900 dark:text-zinc-100">{copySurveyState.event.name}</span> into another
                  {' '}Location/Team within this account. Responses, answers, and insights will not be copied.
                </>
              ) : (
                <>
                  Duplicate <span className="font-semibold text-zinc-900 dark:text-zinc-100">{copySurveyState.event.name}</span> into another
                  {' '}Event Workspace within this account. Responses, answers, and event intelligence will not be copied.
                </>
              )}
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="copy-survey-name" className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {isRetail ? 'Survey Name' : 'Event Name'}
                </label>
                <input
                  id="copy-survey-name"
                  type="text"
                  value={copySurveyName}
                  onChange={(e) => setCopySurveyName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  placeholder={isRetail ? 'Copy of survey' : 'Copy of event'}
                />
              </div>

              <div>
                <label htmlFor="copy-survey-location" className="mb-2 flex items-center gap-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <span>{isRetail ? 'Target Location/Team' : 'Target Event Workspace'}</span>
                  <InfoTooltip content={workspaceTooltip} />
                </label>
                <select
                  id="copy-survey-location"
                  value={copyTargetLocationId}
                  onChange={(e) => setCopyTargetLocationId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {copySurveyError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
                {copySurveyError}
              </div>
            )}

            <div className="mt-6 flex gap-3 justify-end">
              <Button variant="secondary" onClick={closeCopySurveyModal}>
                Cancel
              </Button>
              <Button
                onClick={handleCopySurvey}
                disabled={copyingEventId === copySurveyState.event.id}
              >
                {copyingEventId === copySurveyState.event.id ? 'Creating Copy…' : 'Create Copy'}
              </Button>
            </div>
          </>
        )}
      </Modal>

      </>
      )}

      <Modal
        isOpen={!!deleteConfirmEvent}
        onClose={() => {
          setDeleteConfirmEvent(null)
          if (!isRetail) setEventDeleteError(null)
        }}
        title={deleteActionLabel}
      >
        {deleteConfirmEvent && (
          <>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              {isRetail
                ? `Are you sure you want to delete "${deleteConfirmEvent.name}"? This will permanently remove all responses, answers, and related data. This cannot be undone.`
                : `Are you sure you want to delete "${deleteConfirmEvent.name}"? This will permanently remove this Event container, attendee responses, answers, and event intelligence. This cannot be undone.`}
            </p>
            {!isRetail && eventDeleteError && <p role="alert" className="mb-4 text-sm font-medium text-red-700 dark:text-red-300">{eventDeleteError}</p>}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => {
                setDeleteConfirmEvent(null)
                if (!isRetail) setEventDeleteError(null)
              }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDeleteSurvey(deleteConfirmEvent)}
                disabled={deletingEventId === deleteConfirmEvent.id}
              >
                {deletingEventId === deleteConfirmEvent.id ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </AdminLayout>
  )
}

export default function CustomerAdminHomePage() {
  return (
    <Suspense fallback={
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-zinc-400">Loading account data...</p>
          </div>
        </div>
      </AdminLayout>
    }>
      <CustomerAdminHomeContent />
    </Suspense>
  )
}
