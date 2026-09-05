'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { EventCard, EventEmptyState, EventStatusPill, OperationsSearchToolbar } from '@/components/app/events'
import { EventConfirmDialog } from '@/components/events/EventConfirmDialog'
import { EventAgendaImportWorkspace } from '@/components/events/EventAgendaImportWorkspace'
import { EventWorkspaceDrawer } from '@/components/events/EventEvidenceDrawer'
import { EventSurveyAssignmentControl } from '@/components/events/EventSurveyAssignmentControl'
import { EventEntityCard, EventEntityListShell } from '@/components/events/EventEntityCard'
import {
  EventSessionDateTimePicker,
  applyStartDateSelection,
  hasCompleteSessionDateTime,
  isSessionEndAfterStart,
  sessionDateTimeParts,
} from '@/components/events/EventSessionDateTimePicker'
import { EventSurveyLibraryPicker, isSurveyAssignableToEventTarget, type SurveyLibraryItem } from '@/components/events/EventSurveyLibraryPicker'
import { eventLocalDateTimeToIso } from '@/lib/event-agenda-time'

export { hasCompleteSessionDateTime, sessionDateTimeParts, updateSessionDateTimePart } from '@/components/events/EventSessionDateTimePicker'

const AGENDA_REQUEST_TIMEOUT_MS = 15_000

type AgendaView = 'sessions' | 'speakers'

interface AgendaAssignment {
  id: string
  role: 'SPEAKER' | 'MODERATOR' | 'HOST' | 'PANELIST'
  sortOrder: number
  speaker: { id: string; name: string; title: string | null; organization: string | null }
  session?: { id: string; name: string; startsAt: string | null; isActive: boolean }
}

interface AgendaSession {
  id: string
  name: string
  description: string | null
  startsAt: string | null
  endsAt: string | null
  timezone: string | null
  metadata: {
    room?: string | null
    track?: string | null
    format?: string | null
    externalId?: string | null
    capacity?: number | null
    tags?: string[]
  }
  speakerAssignments: AgendaAssignment[]
  reviewState: 'COMPLETE' | 'NEEDS_REVIEW'
  reviewIssues: string[]
  _count: { surveyTargets: number }
}

interface AgendaSpeaker {
  id: string
  name: string
  title: string | null
  organization: string | null
  email: string | null
  phone: string | null
  biography: string | null
  headshotState: 'NONE' | 'PENDING' | 'READY' | 'FAILED'
  isAssignedToEvent: boolean
  sessionCount: number
  profileState: 'COMPLETE' | 'MISSING_DETAILS'
  missingFields: string[]
  possibleDuplicate: boolean
  sessionAssignments: AgendaAssignment[]
  survey: { id: string; name: string; status: string; questionCount: number; kioskPath: string; isActive: boolean } | null
}

interface SpeakerLibraryItem {
  id: string
  name: string
  title: string | null
  organization: string | null
  email: string | null
}

interface AgendaWorkspaceData {
  eventStatus: string
  eventLifecyclePhase: 'PRE_EVENT' | 'IN_EVENT' | 'POST_EVENT'
  summary: {
    sessionCount: number
    speakerCount: number
    assignedSpeakerCount: number
    sessionsNeedingReview: number
  }
  sessions: AgendaSession[]
  speakers: AgendaSpeaker[]
  listeningPlan: {
    summary: {
      agendaSessionCount: number
      selectedSessionCount: number
      representedSessionCount: number
      selectedCoverageLabel: string
      evidenceCoverageLabel: string
      sessionSurveyCount: number
      sessionSurveyResponseCount: number
    }
    sessions: Array<{
      sessionId: string
      targetId: string | null
      state: 'NOT_SELECTED' | 'NEEDS_SURVEY' | 'SURVEY_ATTACHED' | 'READY_TO_COLLECT' | 'COLLECTING' | 'LOW_RESPONSE' | 'REPRESENTED' | 'CLOSED'
      responseCount: number
      survey: { id: string; name: string; status: string; responseMode: string; questionCount: number } | null
      publicLink: { id: string; kioskPath: string; isActive: boolean } | null
      readiness: { responseEligible: boolean; availability: { state: string; message: string }; issues: string[] } | null
    }>
    surveys: Array<{ id: string; name: string; status: string; responseMode: string; _count: { questions: number } }>
    availableSurveys: Array<{ id: string; name: string; status: string; responseMode: string; targetType: 'SESSION' | 'SPEAKER' | null; eventId: string; eventName?: string | null; _count: { questions: number } }>
  }
}

interface BulkAssignmentCounts {
  requested: number
  attached: number
  alreadyAttached: number
  skipped: number
  replaced: number
  failed: number
}

interface SessionFormState {
  title: string
  description: string
  startsAt: string
  endsAt: string
  timezone: string
  room: string
  track: string
  format: string
  externalId: string
  capacity: string
  tags: string
}

interface SpeakerFormState {
  name: string
  title: string
  organization: string
  email: string
  phone: string
  biography: string
}

const EMPTY_SESSION: SessionFormState = {
  title: '', description: '', startsAt: '', endsAt: '', timezone: 'America/New_York',
  room: '', track: '', format: '', externalId: '', capacity: '', tags: '',
}
const EMPTY_SPEAKER: SpeakerFormState = {
  name: '', title: '', organization: '', email: '', phone: '', biography: '',
}

function toDateTimeInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function formatSessionTime(value: string | null) {
  if (!value) return 'Time not set'
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function formatSessionDay(value: string | null) {
  if (!value) return 'Unscheduled sessions'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unscheduled sessions'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

const LISTENING_STATE_LABELS: Record<AgendaWorkspaceData['listeningPlan']['sessions'][number]['state'], string> = {
  NOT_SELECTED: 'No survey',
  NEEDS_SURVEY: 'No survey',
  SURVEY_ATTACHED: 'Draft survey',
  READY_TO_COLLECT: 'Live survey',
  COLLECTING: 'Live survey',
  LOW_RESPONSE: 'Live survey',
  REPRESENTED: 'Live survey',
  CLOSED: 'Closed survey',
}

function listeningTone(state: AgendaWorkspaceData['listeningPlan']['sessions'][number]['state']) {
  if (state === 'REPRESENTED' || state === 'READY_TO_COLLECT') return 'positive' as const
  if (state === 'COLLECTING') return 'live' as const
  if (state === 'NEEDS_SURVEY' || state === 'LOW_RESPONSE') return 'attention' as const
  return 'muted' as const
}

function sessionDetailStatusLabel(issue: string): string | null {
  if (issue === 'Missing start time' || issue === 'Missing end time') return 'Unscheduled'
  if (issue === 'End time must be after start time') return 'Check session times'
  if (issue === 'Missing timezone') return 'Missing timezone'
  if (issue === 'Missing room' || issue === 'Missing track') return 'Missing info'
  if (issue === 'Missing format') return null
  return 'Check session details'
}

function missingOptionalSessionMetadata(session: AgendaSession): string[] {
  return [
    !session.metadata.room ? 'Room' : null,
    !session.metadata.track ? 'Track' : null,
  ].filter((label): label is string => Boolean(label))
}

function sessionToForm(session: AgendaSession): SessionFormState {
  return {
    title: session.name,
    description: session.description ?? '',
    startsAt: toDateTimeInput(session.startsAt),
    endsAt: toDateTimeInput(session.endsAt),
    timezone: session.timezone ?? 'America/New_York',
    room: session.metadata.room ?? '',
    track: session.metadata.track ?? '',
    format: session.metadata.format ?? '',
    externalId: session.metadata.externalId ?? '',
    capacity: session.metadata.capacity == null ? '' : String(session.metadata.capacity),
    tags: session.metadata.tags?.join(', ') ?? '',
  }
}

function speakerToForm(speaker: AgendaSpeaker): SpeakerFormState {
  return {
    name: speaker.name,
    title: speaker.title ?? '',
    organization: speaker.organization ?? '',
    email: speaker.email ?? '',
    phone: speaker.phone ?? '',
    biography: speaker.biography ?? '',
  }
}

function AgendaField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-xs font-semibold text-slate-600 dark:text-zinc-300 ${className}`}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  )
}

export function speakerMissingDetailsLabel(missingFields: string[]) {
  const fields = ['title', 'organization', 'email'].filter((field) => missingFields.includes(field))
  if (fields.length === 0) return null
  if (fields.length === 1) return `Missing ${fields[0]}`
  return `Missing ${fields.slice(0, -1).join(', ')} and ${fields.at(-1)}`
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

export function EventAgendaWorkspace({
  eventId,
  accountSlug,
  workspace,
  onAgendaChanged,
  onAgendaImportStateChanged,
  templateAgendaSetup = false,
  templateEvent = false,
}: {
  eventId: string
  accountSlug: string
  workspace: AgendaView
  onAgendaChanged?: () => void
  onAgendaImportStateChanged?: (state: 'IN_PROGRESS' | 'NEEDS_REVIEW' | null) => void
  templateAgendaSetup?: boolean
  /** TEMPLATE events expose speakers only as a session-driven Agenda subview. */
  templateEvent?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeView: AgendaView = workspace
  const importJobId = searchParams.get('agendaImport')
  const requestedNewSession = searchParams.get('newSession') === '1'
  const requestedSessionId = searchParams.get('sessionId')?.trim() || null
  const requestedSpeakerId = searchParams.get('speakerId')?.trim() || null
  const requestedSpeakerAction = searchParams.get('speakerAction')
  const [data, setData] = useState<AgendaWorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const archiveSpeakerInFlightRef = useRef<string | null>(null)
  // Canonical confirmation dialog state for schedule-change workflows; the
  // dialog replaces browser confirmations so Cancel/Escape/outside-click
  // never mutate and the primary action names the specific change.
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    body: ReactNode
    confirmLabel: string
    destructive?: boolean
    onConfirm: () => void
  } | null>(null)
  const [search, setSearch] = useState('')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [room, setRoom] = useState('all')
  const [track, setTrack] = useState('all')
  const [format, setFormat] = useState('all')
  const [sort, setSort] = useState('chronological')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sessionForm, setSessionForm] = useState<SessionFormState>(EMPTY_SESSION)
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null)
  const [speakerForm, setSpeakerForm] = useState<SpeakerFormState>(EMPTY_SPEAKER)
  const [creatingSession, setCreatingSession] = useState(false)
  const [creatingSpeaker, setCreatingSpeaker] = useState(false)
  const [speakerLibraryOpen, setSpeakerLibraryOpen] = useState(false)
  const [speakerLibrary, setSpeakerLibrary] = useState<SpeakerLibraryItem[]>([])
  const [speakerLibraryLoading, setSpeakerLibraryLoading] = useState(false)
  const [speakerLibrarySearch, setSpeakerLibrarySearch] = useState('')
  const [pendingAssignmentSpeakerIds, setPendingAssignmentSpeakerIds] = useState<string[]>([])
  const [assignmentRole, setAssignmentRole] = useState<AgendaAssignment['role']>('SPEAKER')
  const [speakerAssignmentPickerOpen, setSpeakerAssignmentPickerOpen] = useState(false)
  const [speakerAssignmentSearch, setSpeakerAssignmentSearch] = useState('')
  const [creatingSessionSpeaker, setCreatingSessionSpeaker] = useState(false)
  const [selectedListeningSessionIds, setSelectedListeningSessionIds] = useState<string[]>([])
  const [selectedBulkSessionIds, setSelectedBulkSessionIds] = useState<string[]>([])
  const [selectedBulkSpeakerIds, setSelectedBulkSpeakerIds] = useState<string[]>([])
  const [bulkSurveyId, setBulkSurveyId] = useState('')
  const [bulkAssignmentMessage, setBulkAssignmentMessage] = useState<string | null>(null)
  const [pendingBulkConflict, setPendingBulkConflict] = useState<{
    targetType: 'SESSION' | 'SPEAKER'
    targetIds: string[]
    surveyId: string
    counts: Pick<BulkAssignmentCounts, 'requested' | 'alreadyAttached' | 'skipped'>
  } | null>(null)
  const [listeningSetupOpen, setListeningSetupOpen] = useState(false)
  const [listeningMode, setListeningMode] = useState<'select' | 'attach' | 'create' | 'remove'>('select')
  const [listeningSurveyId, setListeningSurveyId] = useState('')
  const [listeningSurveyName, setListeningSurveyName] = useState('Session feedback')
  const [listeningQuestion, setListeningQuestion] = useState('What should the event team know about this session?')
  const [listeningPublish, setListeningPublish] = useState(false)
  const [listeningAvailabilityMode, setListeningAvailabilityMode] = useState<'OPEN_IMMEDIATELY' | 'CUSTOM_WINDOW' | 'RELATIVE_TO_EVENT_AREA'>('OPEN_IMMEDIATELY')
  const [listeningOpensAt, setListeningOpensAt] = useState('')
  const [listeningClosesAt, setListeningClosesAt] = useState('')
  const [listeningTimezone, setListeningTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const initialLoadEndpointRef = useRef<string | null>(null)
  const sessionTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const dismissedSessionIdRef = useRef<string | null>(null)
  const endDateWasChangedRef = useRef(false)
  const dismissedSpeakerIdRef = useRef<string | null>(null)
  const previousSelectedSpeakerIdRef = useRef<string | null>(null)

  const endpoint = `/api/app/events/${encodeURIComponent(eventId)}/agenda?account=${encodeURIComponent(accountSlug)}`
  const speakerLibraryEndpoint = `/api/app/events/${encodeURIComponent(eventId)}/speaker-library?account=${encodeURIComponent(accountSlug)}`
  // refresh mode revalidates after a successful mutation: it keeps the loaded
  // agenda visible and reports failure as a stale-view notice, never as a
  // failed save.
  const loadAgenda = useCallback(async (options: { refresh?: boolean } = {}): Promise<boolean> => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), AGENDA_REQUEST_TIMEOUT_MS)
    try {
      if (!options.refresh) {
        setLoading(true)
        setError(null)
      }
      const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.success) throw new Error(body.error || 'Failed to load agenda')
      setData(body.data)
      setRefreshFailed(false)
      return true
    } catch (currentError) {
      const message = controller.signal.aborted
        ? 'Agenda request timed out. Please retry.'
        : currentError instanceof Error ? currentError.message : 'Failed to load agenda'
      if (options.refresh) {
        console.error('[Agenda] Refresh after a saved change failed', currentError)
        setRefreshFailed(true)
      } else {
        setError(message)
      }
      return false
    } finally {
      window.clearTimeout(timeoutId)
      if (!options.refresh) setLoading(false)
    }
  }, [endpoint])

  const loadSpeakerLibrary = useCallback(async () => {
    setSpeakerLibraryLoading(true)
    try {
      const response = await fetch(speakerLibraryEndpoint, { credentials: 'include', cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.success) throw new Error(body.error || 'Failed to load speaker library')
      setSpeakerLibrary(body.data.speakers)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to load speaker library')
    } finally {
      setSpeakerLibraryLoading(false)
    }
  }, [speakerLibraryEndpoint])

  const openSpeakerLibrary = () => {
    setSpeakerLibraryOpen(true)
    setSpeakerLibrarySearch('')
    void loadSpeakerLibrary()
  }

  useEffect(() => {
    if (initialLoadEndpointRef.current === endpoint) return
    initialLoadEndpointRef.current = endpoint
    void loadAgenda()
  }, [endpoint, loadAgenda])

  useEffect(() => {
    if (!requestedNewSession || activeView !== 'sessions') return
    endDateWasChangedRef.current = false
    setCreatingSession(true)
    setSelectedSessionId(null)
    setSessionForm(EMPTY_SESSION)
    const query = new URLSearchParams(searchParams.toString())
    query.delete('newSession')
    router.replace(`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`)
  }, [activeView, eventId, requestedNewSession, router, searchParams])

  useEffect(() => {
    if (activeView !== 'speakers' || templateEvent || !requestedSpeakerAction) return
    if (requestedSpeakerAction === 'library') openSpeakerLibrary()
    if (requestedSpeakerAction === 'import') setImportJob('new')
    if (requestedSpeakerAction === 'new') {
      setCreatingSpeaker(true)
      setSelectedSpeakerId(null)
      setSpeakerForm(EMPTY_SPEAKER)
    }
    const query = new URLSearchParams(searchParams.toString())
    query.delete('speakerAction')
    router.replace(`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`)
  }, [activeView, eventId, requestedSpeakerAction, router, searchParams, templateEvent])

  const setImportJob = (jobId: string | null) => {
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', 'operations')
    if (activeView === 'speakers') query.set('operationsView', 'speakers')
    else query.delete('operationsView')
    query.delete('agendaView')
    if (jobId) query.set('agendaImport', jobId)
    else query.delete('agendaImport')
    router.push(`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`)
  }

  const openManualEntry = () => {
    setImportJob(null)
    if (activeView === 'speakers') {
      setCreatingSpeaker(true)
      setSelectedSpeakerId(null)
      setSpeakerForm(EMPTY_SPEAKER)
    } else {
      endDateWasChangedRef.current = false
      setCreatingSession(true)
      setSelectedSessionId(null)
      setSessionForm(EMPTY_SESSION)
    }
  }

  const mutate = async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
    const response = await fetch(endpoint, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      const agendaError = new Error(result.error || 'Agenda update failed') as Error & { code?: string; details?: unknown }
      agendaError.code = result.code
      agendaError.details = result.details
      throw agendaError
    }
    return result.data
  }

  const afterMutation = async () => {
    const refreshed = await loadAgenda({ refresh: true })
    onAgendaChanged?.()
    return refreshed
  }

  const listeningBySession = useMemo(() => new Map((data?.listeningPlan.sessions ?? []).map((session) => [session.sessionId, session])), [data?.listeningPlan.sessions])

  const buildListeningAvailability = () => {
    if (listeningAvailabilityMode === 'OPEN_IMMEDIATELY') return { mode: 'OPEN_IMMEDIATELY' }
    if (listeningAvailabilityMode === 'CUSTOM_WINDOW') {
      if (!listeningOpensAt || !listeningClosesAt) throw new Error('Opening and closing times are required for a custom availability window.')
      return { mode: 'CUSTOM_WINDOW', timezone: listeningTimezone, opensAt: eventLocalDateTimeToIso(listeningOpensAt, listeningTimezone), closesAt: eventLocalDateTimeToIso(listeningClosesAt, listeningTimezone) }
    }
    return { mode: 'RELATIVE_TO_EVENT_AREA', timezone: listeningTimezone, openAnchor: 'START', closeAnchor: 'END', openOffsetMinutes: -15, closeOffsetMinutes: 15 }
  }

  const applyListeningSetup = async () => {
    if (busy || selectedListeningSessionIds.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const surveyMode = listeningSurveyId ? 'attach' : listeningMode
      if (surveyMode === 'remove') {
        await mutate('DELETE', { action: 'REMOVE_LISTENING_POINTS', sessionIds: selectedListeningSessionIds })
      } else if (surveyMode === 'select') {
        await mutate('POST', { action: 'ADD_LISTENING_POINTS', sessionIds: selectedListeningSessionIds })
      } else if (surveyMode === 'attach') {
        await mutate('POST', { action: 'ATTACH_LISTENING_SURVEY', sessionIds: selectedListeningSessionIds, surveyId: listeningSurveyId, availability: buildListeningAvailability() })
      } else {
        await mutate('POST', { action: 'CREATE_LISTENING_SURVEY', sessionIds: selectedListeningSessionIds, surveyName: listeningSurveyName, questionPrompt: listeningQuestion, publish: listeningPublish, availability: buildListeningAvailability() })
      }
      setSelectedListeningSessionIds([])
      setListeningSetupOpen(false)
      await afterMutation()
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to update the listening plan')
    } finally { setBusy(false) }
  }

  const selectedSession = data?.sessions.find((session) => session.id === selectedSessionId) ?? null
  const selectedSessionListening = selectedSessionId ? listeningBySession.get(selectedSessionId) ?? null : null
  const selectedSpeaker = data?.speakers.find((speaker) => speaker.id === selectedSpeakerId) ?? null

  const sessionOptions = useMemo(() => {
    const values = (key: 'room' | 'track' | 'format') => [...new Set((data?.sessions ?? []).map((session) => session.metadata[key]).filter((value): value is string => Boolean(value)))].sort()
    return { rooms: values('room'), tracks: values('track'), formats: values('format') }
  }, [data])

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en-US')
    return [...(data?.sessions ?? [])]
      .filter((session) => !query || [session.name, session.description, session.metadata.room, session.metadata.track, session.metadata.format]
        .some((value) => value?.toLocaleLowerCase('en-US').includes(query)))
      .filter((session) => sessionFilter === 'all'
        || (sessionFilter === 'review' && session.reviewState === 'NEEDS_REVIEW')
        || (sessionFilter === 'collecting' && listeningBySession.get(session.id)?.state === 'COLLECTING'))
      .filter((session) => room === 'all' || session.metadata.room === room)
      .filter((session) => track === 'all' || session.metadata.track === track)
      .filter((session) => format === 'all' || session.metadata.format === format)
      .sort((left, right) => sort === 'title'
        ? left.name.localeCompare(right.name)
        : (left.startsAt ?? '').localeCompare(right.startsAt ?? '') || left.name.localeCompare(right.name))
  }, [data, format, listeningBySession, room, search, sessionFilter, sort, track])

  const filteredSpeakers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en-US')
    return (data?.speakers ?? []).filter((speaker) => !query || [speaker.name, speaker.title, speaker.organization, speaker.email]
      .some((value) => value?.toLocaleLowerCase('en-US').includes(query)))
  }, [data, search])

  const filteredSpeakerLibrary = useMemo(() => {
    const query = speakerLibrarySearch.trim().toLocaleLowerCase('en-US')
    return speakerLibrary.filter((speaker) => !query || [speaker.name, speaker.title, speaker.organization, speaker.email]
      .some((value) => value?.toLocaleLowerCase('en-US').includes(query)))
  }, [speakerLibrary, speakerLibrarySearch])

  const selectedBulkIds = activeView === 'sessions' ? selectedBulkSessionIds : selectedBulkSpeakerIds
  const selectedBulkCount = selectedBulkIds.length
  // This is deliberately the same survey library used by individual rows. Bulk
  // selection only changes the confirmation scope; it does not introduce a
  // second assignment workflow.
  const availableBulkSurveys = useMemo<SurveyLibraryItem[]>(() => (data?.listeningPlan.availableSurveys ?? []).map((survey) => ({
    id: survey.id,
    name: survey.name,
    status: survey.status,
    targetType: survey.targetType,
    questionCount: survey._count.questions,
    eventId: survey.eventId,
    eventName: survey.eventName,
  })), [data?.listeningPlan.availableSurveys])
  const bulkOverwriteCount = useMemo(() => {
    if (!bulkSurveyId) return 0
    return selectedBulkIds.filter((id) => {
      const assignedSurveyId = activeView === 'sessions'
        ? listeningBySession.get(id)?.survey?.id
        : data?.speakers.find((speaker) => speaker.id === id)?.survey?.id
      return Boolean(assignedSurveyId && assignedSurveyId !== bulkSurveyId)
    }).length
  }, [activeView, bulkSurveyId, data?.speakers, listeningBySession, selectedBulkIds])
  const setBulkSelection = (ids: string[]) => {
    if (activeView === 'sessions') setSelectedBulkSessionIds([...new Set(ids)])
    else setSelectedBulkSpeakerIds([...new Set(ids)])
  }

  const createSessionSurveyFor = (sessionIds: string[]) => {
    setSelectedListeningSessionIds(sessionIds)
    setListeningMode('create')
    setListeningSetupOpen(true)
  }

  const applyBulkSurvey = async (input: { targetType: 'SESSION' | 'SPEAKER'; targetIds: string[]; surveyId: string; conflictMode: 'SKIP_EXISTING' | 'REPLACE_EXISTING' }) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await mutate('PATCH', {
        action: 'BULK_ASSIGN_EXISTING_SURVEY',
        targetType: input.targetType,
        targetIds: input.targetIds,
        surveyId: input.surveyId,
        conflictMode: input.conflictMode,
      }) as { counts: BulkAssignmentCounts }
      const counts = result.counts
      const changed = counts.attached + counts.replaced > 0
      const assignmentMessage = input.targetIds.length === 1
        ? changed ? (counts.replaced > 0 ? 'Survey changed' : 'Survey assigned') : 'Survey already assigned'
        : `${counts.attached} attached · ${counts.alreadyAttached} already attached · ${counts.skipped} skipped · ${counts.replaced} replaced`
      setPendingBulkConflict(null)
      if (input.targetType === 'SESSION') setSelectedBulkSessionIds([])
      else setSelectedBulkSpeakerIds([])
      const refreshed = await afterMutation()
      // Attach/Swap is derived from the agenda payload. Announce success only
      // once the persisted assignment has been fetched into that payload.
      if (refreshed) setBulkAssignmentMessage(assignmentMessage)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to apply the survey')
    } finally {
      setBusy(false)
    }
  }

  const attachSessionSurvey = (sessionId: string, surveyId: string) => {
    return applyBulkSurvey({ targetType: 'SESSION', targetIds: [sessionId], surveyId, conflictMode: 'REPLACE_EXISTING' })
  }
  const attachSpeakerSurvey = (speakerId: string, surveyId: string) => {
    return applyBulkSurvey({ targetType: 'SPEAKER', targetIds: [speakerId], surveyId, conflictMode: 'REPLACE_EXISTING' })
  }
  const detachSurvey = async (targetType: 'SESSION' | 'SPEAKER', targetId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await mutate('PATCH', { action: 'CLEAR_EXISTING_SURVEY_ASSIGNMENT', targetType, targetIds: [targetId] })
      if (await afterMutation()) setBulkAssignmentMessage('Survey detached')
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to detach survey')
    } finally {
      setBusy(false)
    }
  }
  const createSurveyFromLibrary = () => {
    router.push(`/app/events/${encodeURIComponent(eventId)}/surveys/new?${new URLSearchParams({ account: accountSlug }).toString()}`)
  }
  const surveyEditorHref = (surveyId: string) => `/app/events/${encodeURIComponent(eventId)}/surveys/new?${new URLSearchParams({ account: accountSlug, survey: surveyId }).toString()}`
  const requestBulkSurveyApply = () => {
    if (!bulkSurveyId || selectedBulkIds.length === 0) return
    const targetType = activeView === 'sessions' ? 'SESSION' as const : 'SPEAKER' as const
    const selectedSurvey = bulkSurveyId
    const currentAssignments = selectedBulkIds.map((id) => targetType === 'SESSION'
      ? listeningBySession.get(id)?.survey?.id ?? null
      : data?.speakers.find((speaker) => speaker.id === id)?.survey?.id ?? null)
    const alreadyAttached = currentAssignments.filter((id) => id === selectedSurvey).length
    const hasOtherAssignment = currentAssignments.filter((id) => Boolean(id && id !== selectedSurvey)).length
    if (hasOtherAssignment > 0) {
      setPendingBulkConflict({ targetType, targetIds: selectedBulkIds, surveyId: selectedSurvey, counts: { requested: selectedBulkIds.length, alreadyAttached, skipped: hasOtherAssignment } })
      return
    }
    void applyBulkSurvey({ targetType, targetIds: selectedBulkIds, surveyId: selectedSurvey, conflictMode: 'SKIP_EXISTING' })
  }

  const openSession = (session: AgendaSession) => {
    dismissedSessionIdRef.current = null
    endDateWasChangedRef.current = false
    setCreatingSession(false)
    setSelectedSessionId(session.id)
    setSessionForm(sessionToForm(session))
    setPendingAssignmentSpeakerIds([])
    setSpeakerAssignmentPickerOpen(false)
    setSpeakerAssignmentSearch('')
    setError(null)
    if (templateEvent) void loadSpeakerLibrary()
    if (requestedSessionId !== session.id) {
      const query = new URLSearchParams(searchParams.toString())
      query.set('tab', 'operations')
      query.delete('operationsView')
      query.delete('agendaView')
      query.set('sessionId', session.id)
      query.delete('speakerId')
      router.replace(`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`)
    }
  }

  const sessionFormIsDirty = useMemo(() => {
    const baseline = selectedSession ? sessionToForm(selectedSession) : EMPTY_SESSION
    return JSON.stringify(sessionForm) !== JSON.stringify(baseline)
  }, [selectedSession, sessionForm])

  const dismissSession = useCallback(() => {
    const previousSessionId = selectedSessionId
    dismissedSessionIdRef.current = previousSessionId
    setCreatingSession(false)
    setSelectedSessionId(null)
    endDateWasChangedRef.current = false
    setSessionForm(EMPTY_SESSION)
    setPendingAssignmentSpeakerIds([])
    setSpeakerAssignmentPickerOpen(false)
    setSpeakerAssignmentSearch('')
    setError(null)
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', 'operations')
    query.delete('operationsView')
    query.delete('agendaView')
    query.delete('sessionId')
    router.replace(`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`)
    if (previousSessionId) window.requestAnimationFrame(() => sessionTriggerRefs.current[previousSessionId]?.focus())
  }, [eventId, router, searchParams, selectedSessionId])

  const closeSession = useCallback((force = false) => {
    if (!force && sessionFormIsDirty) {
      setPendingConfirm({
        title: 'Discard unsaved session changes?',
        body: 'Your changes have not been saved.',
        confirmLabel: 'Discard changes',
        destructive: true,
        onConfirm: dismissSession,
      })
      return
    }
    dismissSession()
  }, [dismissSession, sessionFormIsDirty])
  const openSpeaker = (speaker: AgendaSpeaker) => {
    dismissedSpeakerIdRef.current = null
    setCreatingSpeaker(false)
    setSelectedSpeakerId(speaker.id)
    setSpeakerForm(speakerToForm(speaker))
    setError(null)
    if (requestedSpeakerId !== speaker.id) {
      const query = new URLSearchParams(searchParams.toString())
      query.set('tab', 'operations')
      query.set('operationsView', 'speakers')
      query.delete('agendaView')
      query.set('speakerId', speaker.id)
      query.delete('sessionId')
      router.replace(`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`)
    }
  }

  const dismissSpeaker = useCallback(() => {
    setCreatingSpeaker(false)
    setSelectedSpeakerId(null)
    setSpeakerForm(EMPTY_SPEAKER)
    setError(null)
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', 'operations')
    query.set('operationsView', 'speakers')
    query.delete('agendaView')
    query.delete('speakerId')
    router.replace(`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`)
  }, [eventId, router, searchParams, templateEvent])

  useEffect(() => {
    if (!requestedSessionId) {
      dismissedSessionIdRef.current = null
      return
    }
    if (!data || selectedSessionId === requestedSessionId || dismissedSessionIdRef.current === requestedSessionId) return
    const requestedSession = data.sessions.find((session) => session.id === requestedSessionId)
    if (!requestedSession) return
    endDateWasChangedRef.current = false
    setCreatingSession(false)
    setSelectedSessionId(requestedSession.id)
    setSessionForm(sessionToForm(requestedSession))
    setPendingAssignmentSpeakerIds([])
    setSpeakerAssignmentPickerOpen(false)
    setSpeakerAssignmentSearch('')
    setError(null)
    if (templateEvent) void loadSpeakerLibrary()
  }, [data, loadSpeakerLibrary, requestedSessionId, selectedSessionId, templateEvent])

  useEffect(() => {
    const previous = previousSelectedSpeakerIdRef.current
    if (previous && !selectedSpeakerId && requestedSpeakerId === previous) dismissedSpeakerIdRef.current = previous
    previousSelectedSpeakerIdRef.current = selectedSpeakerId
  }, [requestedSpeakerId, selectedSpeakerId])

  useEffect(() => {
    if (!requestedSpeakerId || !data || selectedSpeakerId === requestedSpeakerId || dismissedSpeakerIdRef.current === requestedSpeakerId) return
    const requestedSpeaker = data.speakers.find((speaker) => speaker.id === requestedSpeakerId)
    if (!requestedSpeaker) return
    setCreatingSpeaker(false)
    setSelectedSpeakerId(requestedSpeaker.id)
    setSpeakerForm(speakerToForm(requestedSpeaker))
    setError(null)
  }, [data, requestedSpeakerId, selectedSpeakerId])

  useEffect(() => {
    if (!selectedSpeakerId) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') dismissSpeaker() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dismissSpeaker, selectedSpeakerId])

  const saveSession = async (confirmWarnings = false, liveEditConfirmed = false) => {
    if (busy) return
    if (!hasCompleteSessionDateTime(sessionForm.startsAt) || !hasCompleteSessionDateTime(sessionForm.endsAt)) {
      setError('Start and end date/time are required.')
      return
    }
    if (!isSessionEndAfterStart(sessionForm.startsAt, sessionForm.endsAt)) {
      setError('End must be later than Start.')
      return
    }
    if (!liveEditConfirmed && data?.eventLifecyclePhase === 'IN_EVENT') {
      setPendingConfirm({
        title: 'Confirm schedule change?',
        body: 'This event is live. Saving updates the published schedule for attendees immediately.',
        confirmLabel: selectedSessionId ? 'Update session' : 'Add session',
        onConfirm: () => void saveSession(confirmWarnings, true),
      })
      return
    }
    const confirmLiveEdit = true
    setBusy(true)
    setError(null)
    try {
      const session = {
        ...(selectedSessionId ? { sessionId: selectedSessionId } : {}),
        title: sessionForm.title,
        description: sessionForm.description || null,
        startsAt: eventLocalDateTimeToIso(sessionForm.startsAt, sessionForm.timezone),
        endsAt: eventLocalDateTimeToIso(sessionForm.endsAt, sessionForm.timezone),
        timezone: sessionForm.timezone,
        room: sessionForm.room || null,
        track: sessionForm.track || null,
        format: sessionForm.format || null,
        externalId: sessionForm.externalId || null,
        capacity: sessionForm.capacity === '' ? null : Number(sessionForm.capacity),
        tags: sessionForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        confirmWarnings,
        confirmLiveEdit,
      }
      await mutate(selectedSessionId ? 'PATCH' : 'POST', {
        action: selectedSessionId && pendingAssignmentSpeakerIds.length > 0
          ? 'UPDATE_SESSION_WITH_SPEAKER_ASSIGNMENTS'
          : selectedSessionId ? 'UPDATE_SESSION' : 'CREATE_SESSION',
        session,
        ...(selectedSessionId && pendingAssignmentSpeakerIds.length > 0 ? {
          speakerIds: pendingAssignmentSpeakerIds,
          assignment: {
            role: assignmentRole,
            sortOrder: selectedSession?.speakerAssignments.length ?? 0,
          },
        } : {}),
      })
      setPendingAssignmentSpeakerIds([])
      closeSession(true)
      await afterMutation()
    } catch (currentError) {
      const agendaError = currentError as Error & { code?: string; details?: { warnings?: Array<{ message: string }> } }
      if (agendaError.code === 'SESSION_REVIEW_CONFIRMATION_REQUIRED') {
        const warningText = agendaError.details?.warnings?.map((warning) => warning.message).join(' ') ?? agendaError.message
        setPendingConfirm({
          title: 'Save session with warnings?',
          body: warningText,
          confirmLabel: 'Save anyway',
          onConfirm: () => void saveSession(true, true),
        })
        return
      }
      setError(agendaError.message)
    } finally {
      setBusy(false)
    }
  }

  const archiveSession = (session: AgendaSession) => {
    if (busy) return
    const history = session._count.surveyTargets > 0 ? ` ${session._count.surveyTargets} listening target(s) will be preserved.` : ''
    const live = data?.eventLifecyclePhase === 'IN_EVENT'
    setPendingConfirm({
      title: 'Archive this session?',
      body: `“${session.name}” will be removed from the agenda.${history}${live ? ' This event is live, so the published schedule updates immediately.' : ''}`,
      confirmLabel: 'Archive session',
      destructive: true,
      onConfirm: () => void performArchiveSession(session),
    })
  }

  const performArchiveSession = async (session: AgendaSession) => {
    if (busy) return
    setBusy(true)
    try {
      await mutate('DELETE', { action: 'ARCHIVE_SESSION', sessionId: session.id, confirmLiveEdit: true })
      closeSession(true)
      await afterMutation()
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to archive session')
    } finally { setBusy(false) }
  }

  const saveSpeaker = async (confirmDuplicate = false) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const profile = {
        name: speakerForm.name,
        title: speakerForm.title || null,
        organization: speakerForm.organization || null,
        email: speakerForm.email || null,
        phone: speakerForm.phone || null,
        biography: speakerForm.biography || null,
      }
      await mutate(selectedSpeakerId ? 'PATCH' : 'POST', {
        action: selectedSpeakerId ? 'UPDATE_SPEAKER' : templateEvent && selectedSessionId ? 'CREATE_AND_ASSIGN_SPEAKER' : 'CREATE_SPEAKER',
        ...(selectedSpeakerId ? { speakerId: selectedSpeakerId } : {}),
        ...(!selectedSpeakerId && templateEvent && selectedSessionId ? {
          sessionId: selectedSessionId,
          assignment: { role: assignmentRole, sortOrder: selectedSession?.speakerAssignments.length ?? 0 },
        } : {}),
        profile,
        confirmDuplicate,
      })
      setCreatingSpeaker(false)
      setSelectedSpeakerId(null)
      setSpeakerForm(EMPTY_SPEAKER)
      setCreatingSessionSpeaker(false)
      await afterMutation()
    } catch (currentError) {
      const agendaError = currentError as Error & { code?: string }
      if (agendaError.code === 'SPEAKER_DUPLICATE_CONFIRMATION_REQUIRED') {
        setPendingConfirm({
          title: 'Keep this speaker profile separate?',
          body: agendaError.message,
          confirmLabel: 'Keep separate',
          onConfirm: () => void saveSpeaker(true),
        })
        return
      }
      setError(agendaError.message)
    } finally { setBusy(false) }
  }

  const archiveSpeaker = (speaker: AgendaSpeaker) => {
    if (busy) return
    setPendingConfirm({
      title: 'Archive this speaker?',
      body: `“${speaker.name}” will be archived. Session records will not be deleted.`,
      confirmLabel: 'Archive speaker',
      destructive: true,
      onConfirm: () => void performArchiveSpeaker(speaker),
    })
  }

  const performArchiveSpeaker = async (speaker: AgendaSpeaker) => {
    if (busy || archiveSpeakerInFlightRef.current === speaker.id) return
    archiveSpeakerInFlightRef.current = speaker.id
    setBusy(true)
    setError(null)
    try {
      await mutate('DELETE', { action: 'ARCHIVE_SPEAKER', speakerId: speaker.id })
      setSelectedSpeakerId(null)
      await afterMutation()
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to archive speaker')
    } finally {
      archiveSpeakerInFlightRef.current = null
      setBusy(false)
    }
  }

  const addAssignment = async () => {
    if (busy || !selectedSessionId || pendingAssignmentSpeakerIds.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await mutate('POST', {
        action: 'ASSIGN_SPEAKERS',
        sessionId: selectedSessionId,
        speakerIds: pendingAssignmentSpeakerIds,
        assignment: { role: assignmentRole, sortOrder: selectedSession?.speakerAssignments.length ?? 0 },
      })
      setPendingAssignmentSpeakerIds([])
      setSpeakerAssignmentPickerOpen(false)
      setSpeakerAssignmentSearch('')
      await afterMutation()
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to assign speaker')
    } finally { setBusy(false) }
  }

  const addExistingSpeakerToEvent = async (speakerId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await mutate('POST', { action: 'ADD_EXISTING_SPEAKER', speakerId })
      setSpeakerLibrary((current) => current.filter((speaker) => speaker.id !== speakerId))
      await afterMutation()
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to add speaker to event')
    } finally {
      setBusy(false)
    }
  }

  const removeAssignment = async (speakerId: string) => {
    if (busy || !selectedSessionId) return
    setBusy(true)
    try {
      await mutate('DELETE', { action: 'REMOVE_ASSIGNMENT', sessionId: selectedSessionId, speakerId })
      await afterMutation()
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Failed to remove speaker')
    } finally { setBusy(false) }
  }

  if (loading && !data) return <EventCard padding="md"><p className="text-sm text-slate-500">Loading agenda…</p></EventCard>
  if (error && !data) return <EventCard padding="md"><EventEmptyState title="Agenda unavailable" description={error} actions={[{ label: 'Try again', onClick: () => void loadAgenda() }]} /></EventCard>
  if (!data) return null

  const sessionFormOpen = creatingSession || Boolean(selectedSessionId)
  const speakerFormOpen = creatingSpeaker || Boolean(selectedSpeakerId)
  const speakersAvailableForSession = templateEvent ? speakerLibrary : data.speakers
  const assignedSessionSpeakerIds = new Set(selectedSession?.speakerAssignments.map((assignment) => assignment.speaker.id) ?? [])
  const pendingAssignmentSpeakers = speakersAvailableForSession.filter((speaker) => pendingAssignmentSpeakerIds.includes(speaker.id))
  const normalizedSpeakerAssignmentSearch = speakerAssignmentSearch.trim().toLocaleLowerCase()
  const filteredSpeakerAssignmentOptions = speakersAvailableForSession.filter((speaker) => {
    if (!normalizedSpeakerAssignmentSearch) return true
    return [speaker.name, speaker.title, speaker.organization]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalizedSpeakerAssignmentSearch))
  })
  const togglePendingSpeakerAssignment = (speakerId: string) => {
    if (assignedSessionSpeakerIds.has(speakerId)) return
    setPendingAssignmentSpeakerIds((current) => current.includes(speakerId)
      ? current.filter((id) => id !== speakerId)
      : [...current, speakerId])
  }

  return (
    <section aria-label={activeView === 'sessions' ? 'Session management' : 'Speaker management'} className="space-y-4">
      {selectedBulkCount > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 mx-auto w-[min(820px,calc(100vw-32px))] rounded-[28px] bg-[#071d49] px-5 py-4 shadow-[0_20px_48px_rgba(7,29,73,0.34)]" role="region" aria-label="Bulk survey assignment" data-testid="bulk-survey-selection-bar">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-between">
            <div className="flex items-center gap-3 text-white"><span className="grid h-10 min-w-10 place-items-center rounded-full bg-[#2450ae] px-3 text-lg font-bold">{selectedBulkCount}</span><p className="text-lg font-semibold">{activeView === 'sessions' ? 'session' : 'speaker'}{selectedBulkCount === 1 ? '' : 's'} selected</p></div>
            <div className="flex items-center gap-4 border-l border-white/20 pl-4"><EventSurveyLibraryPicker surveys={availableBulkSurveys} currentEventId={eventId} selectedSurveyId={bulkSurveyId} onSelect={setBulkSurveyId} onClear={() => setBulkSurveyId('')} triggerLabel="Attach survey" triggerTone="bulk" bulkContext={{ count: selectedBulkCount, noun: `${activeView === 'sessions' ? 'session' : 'speaker'}${selectedBulkCount === 1 ? '' : 's'}`, confirmLabel: `Attach to ${selectedBulkCount} ${activeView === 'sessions' ? 'session' : 'speaker'}${selectedBulkCount === 1 ? '' : 's'}`, onConfirm: requestBulkSurveyApply, overwriteCount: bulkOverwriteCount }} isSurveySelectable={(survey) => isSurveyAssignableToEventTarget(survey, eventId)} /><button type="button" className="text-base font-semibold text-white/70 hover:text-white" onClick={() => setBulkSelection([])}>Clear</button></div>
          </div>
        </div>
      )}
      {importJobId ? (activeView === 'speakers' && !templateEvent ? (
        <EventWorkspaceDrawer open title="Import speakers" eyebrow="Speaker roster" summary="Upload, map, review, and add reusable account speaker profiles." onClose={() => setImportJob(null)} testId="speaker-import-drawer" ariaLabel="Import speakers">
          <EventAgendaImportWorkspace
            eventId={eventId}
            accountSlug={accountSlug}
            importJobId={importJobId}
            speakers={data.speakers.map((speaker) => ({ id: speaker.id, name: speaker.name, email: speaker.email }))}
            eventIsActive={data.eventLifecyclePhase === 'IN_EVENT'}
            speakerRosterOnly
            onImportJobChanged={(jobId, status) => {
              if (jobId !== importJobId) setImportJob(jobId)
              onAgendaImportStateChanged?.(status === 'NEEDS_REVIEW' || status === 'FAILED' ? 'NEEDS_REVIEW' : status === 'COMPLETED' ? null : 'IN_PROGRESS')
            }}
            onManualEntry={openManualEntry}
            onOpenSessions={() => { setImportJob(null); void afterMutation() }}
            onDiscard={() => { setImportJob(null); onAgendaImportStateChanged?.(null) }}
          />
        </EventWorkspaceDrawer>
      ) : <EventAgendaImportWorkspace
          eventId={eventId}
          accountSlug={accountSlug}
          importJobId={importJobId}
          speakers={data.speakers.map((speaker) => ({ id: speaker.id, name: speaker.name, email: speaker.email }))}
          eventIsActive={data.eventLifecyclePhase === 'IN_EVENT'}
          agendaOnly={templateEvent || templateAgendaSetup}
          onImportJobChanged={(jobId, status) => {
            if (jobId !== importJobId) setImportJob(jobId)
            onAgendaImportStateChanged?.(status === 'NEEDS_REVIEW' || status === 'FAILED' ? 'NEEDS_REVIEW' : status === 'COMPLETED' ? null : 'IN_PROGRESS')
          }}
          onManualEntry={openManualEntry}
          onOpenSessions={(nextFilter) => { if (nextFilter) setSessionFilter(nextFilter); setImportJob(null); void afterMutation() }}
          onDiscard={() => { setImportJob(null); onAgendaImportStateChanged?.(null) }}
        />) : <>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {bulkAssignmentMessage && <div role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900">{bulkAssignmentMessage}</div>}

      {refreshFailed && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <p><span className="font-semibold">Your change was saved.</span> Refreshing the agenda failed, so this view may be out of date.</p>
          <button type="button" onClick={() => { void loadAgenda({ refresh: true }) }} className="shrink-0 self-start font-semibold text-amber-900 underline underline-offset-2 sm:self-center">
            Refresh view
          </button>
        </div>
      )}

      {activeView === 'speakers' && !templateEvent && <EventWorkspaceDrawer open={speakerLibraryOpen} title="Add from speaker library" eyebrow="Reusable speaker profiles" summary="Select a reusable account speaker to add them to this event." onClose={() => setSpeakerLibraryOpen(false)} testId="speaker-library-drawer" ariaLabel="Add from speaker library">
        <div className="space-y-3">
          <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => setSpeakerLibraryOpen(false)}>Close</Button></div>
          <input aria-label="Search speaker library" className={inputClass} value={speakerLibrarySearch} onChange={(event) => setSpeakerLibrarySearch(event.target.value)} placeholder="Search speaker library…" />
          {speakerLibraryLoading ? <p className="text-sm text-slate-500">Loading speaker library…</p> : filteredSpeakerLibrary.length === 0 ? <EventEmptyState size="sm" title="No reusable speakers available" description={speakerLibrary.length === 0 ? 'All reusable speakers in this account are already assigned to this event.' : 'No reusable speakers match this search.'} /> : <div className="space-y-2">{filteredSpeakerLibrary.map((speaker) => <div key={speaker.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-zinc-800"><div className="min-w-0"><p className="font-semibold text-slate-950 dark:text-white">{speaker.name}</p><p className="mt-1 text-xs text-slate-500">{[speaker.title, speaker.organization].filter(Boolean).join(' · ') || speaker.email || 'Profile details incomplete'}</p></div><Button type="button" size="sm" disabled={busy} onClick={() => void addExistingSpeakerToEvent(speaker.id)}>Add to event</Button></div>)}</div>}
        </div>
      </EventWorkspaceDrawer>}

      {activeView === 'sessions' ? (
        <div>
          <EventEntityListShell>
            <div>
              <OperationsSearchToolbar entityLabel="sessions" selectedCount={selectedBulkSessionIds.length} hasResults={filteredSessions.length > 0} allSelected={filteredSessions.length > 0 && filteredSessions.every((session) => selectedBulkSessionIds.includes(session.id))} onToggleAll={(checked) => setSelectedBulkSessionIds((current) => checked ? [...new Set([...current, ...filteredSessions.map((session) => session.id)])] : current.filter((id) => !filteredSessions.some((session) => session.id === id)))} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search sessions, rooms, tracks..." filters={<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Session filters">
                {[['Room', room, setRoom, sessionOptions.rooms], ['Track', track, setTrack, sessionOptions.tracks], ['Format', format, setFormat, sessionOptions.formats]].map(([label, value, setter, options]) => (
                  <label key={label as string} className="text-xs font-semibold text-slate-500">{label as string}<select value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className={`${inputClass} mt-1`}><option value="all">All</option>{(options as string[]).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                ))}
                <label className="text-xs font-semibold text-slate-500">Sort<select value={sort} onChange={(event) => setSort(event.target.value)} className={`${inputClass} mt-1`}><option value="chronological">Chronological</option><option value="title">Title</option></select></label>
              </div>} />
            </div>
            <div className="mt-4 space-y-3">
              {filteredSessions.length === 0 ? <EventEmptyState size="sm" title={data.sessions.length === 0 ? 'No agenda sessions yet' : 'No sessions match these filters'} description={data.sessions.length === 0 ? 'Add a session or import your agenda.' : 'Clear or change the filters to see more sessions.'} actions={data.sessions.length === 0 ? [{ label: 'Add session', onClick: () => { endDateWasChangedRef.current = false; setCreatingSession(true); setSessionForm(EMPTY_SESSION) } }] : [{ label: 'Clear filters', variant: 'secondary', onClick: () => { setSearch(''); setSessionFilter('all'); setRoom('all'); setTrack('all'); setFormat('all') } }]} /> : filteredSessions.map((session, index) => {
                const listening = listeningBySession.get(session.id)
                const missingInfo = session.reviewIssues.map(sessionDetailStatusLabel).find((status): status is string => Boolean(status))
                const isNewDay = index === 0 || formatSessionDay(filteredSessions[index - 1].startsAt) !== formatSessionDay(session.startsAt)
                return <div key={session.id}>{isNewDay && <div className="px-1 pt-2"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-zinc-300">{formatSessionDay(session.startsAt)}</h3></div>}<EventEntityCard selected={selectedSessionId === session.id} className="group relative mt-2 flex items-start gap-3 pr-[10.5rem] hover:bg-[#f7f9fe] [&:has(.event-survey-assignment-toolbar[data-open=true])]:bg-[#f7f9fe]">
                  <label className="mt-1 flex shrink-0 items-center"><input type="checkbox" aria-label={`Select ${session.name} for feedback survey`} checked={selectedBulkSessionIds.includes(session.id)} onChange={(event) => setSelectedBulkSessionIds((current) => event.target.checked ? [...new Set([...current, session.id])] : current.filter((id) => id !== session.id))} /></label>
                  <button ref={(node) => { sessionTriggerRefs.current[session.id] = node }} type="button" onClick={() => openSession(session)} aria-pressed={selectedSessionId === session.id} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><div><p className="font-semibold text-slate-950 dark:text-white">{session.name}</p><p className="mt-1 text-xs text-slate-500">{formatSessionTime(session.startsAt)} · {session.metadata.room || 'Room not set'}</p></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{session.metadata.track || 'Track not set'}</span><span>{session.metadata.format || 'Format not set'}</span><span>{session.speakerAssignments.length} speaker{session.speakerAssignments.length === 1 ? '' : 's'}</span>{listening?.survey && <span>{listening.survey.name} · {listening.responseCount} response{listening.responseCount === 1 ? '' : 's'}</span>}</div></button>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{missingInfo && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{missingInfo}</span>}{!selectedBulkSessionIds.includes(session.id) && <EventSurveyAssignmentControl entityName={session.name} surveys={availableBulkSurveys} currentEventId={eventId} assignedSurvey={listening?.survey ? { ...listening.survey, targetType: 'SESSION', eventId } : null} onAssign={(surveyId) => attachSessionSurvey(session.id, surveyId)} onDetach={() => detachSurvey('SESSION', session.id)} onCreateSurvey={createSurveyFromLibrary} previewHref={listening?.survey ? surveyEditorHref(listening.survey.id) : undefined} isSurveySelectable={(survey) => isSurveyAssignableToEventTarget(survey, eventId)} disabled={busy} />}</div>
                </EventEntityCard></div>
              })}
            </div>
          </EventEntityListShell>
          {sessionFormOpen && (
            <EventWorkspaceDrawer open title={selectedSessionId ? 'Session detail' : 'Add session'} eyebrow="Agenda" onClose={closeSession} testId="session-detail-drawer" ariaLabel="Session detail">
              <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => closeSession()}>Close</Button></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AgendaField label="Title" className="sm:col-span-2"><input className={inputClass} value={sessionForm.title} onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })} /></AgendaField>
                <EventSessionDateTimePicker
                  label="Starts"
                  value={sessionForm.startsAt}
                  onChange={(value) => setSessionForm((current) => {
                    const previousDate = sessionDateTimeParts(current.startsAt).date
                    const nextDate = sessionDateTimeParts(value).date
                    if (nextDate !== previousDate) {
                      const next = applyStartDateSelection(current.startsAt, current.endsAt, nextDate, endDateWasChangedRef.current)
                      return { ...current, ...next }
                    }
                    return { ...current, startsAt: value }
                  })}
                />
                <EventSessionDateTimePicker
                  label="Ends"
                  value={sessionForm.endsAt}
                  minValue={sessionForm.startsAt}
                  align="end"
                  onChange={(value) => setSessionForm((current) => {
                    if (sessionDateTimeParts(value).date !== sessionDateTimeParts(current.endsAt).date) endDateWasChangedRef.current = true
                    return { ...current, endsAt: value }
                  })}
                />
                {([['Timezone', 'timezone'], ['Room', 'room'], ['Track', 'track'], ['External / source ID', 'externalId']] as const).map(([label, key]) => <AgendaField key={key} label={label}><input className={inputClass} value={sessionForm[key]} onChange={(event) => setSessionForm({ ...sessionForm, [key]: event.target.value })} /></AgendaField>)}
              </div>
              {selectedSession && missingOptionalSessionMetadata(selectedSession).length > 0 && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"><h4 className="text-xs font-bold uppercase tracking-wide">Missing info</h4><p className="mt-1 text-sm font-semibold">{missingOptionalSessionMetadata(selectedSession).join(' · ')}</p></div>}
              {selectedSession && (
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Speakers and roles</h4>
                  <div className="mt-2 space-y-2">{selectedSession.speakerAssignments.map((assignment) => <div key={assignment.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span><strong>{assignment.speaker.name}</strong> · {assignment.role.toLocaleLowerCase()}</span><button type="button" className="text-xs font-semibold text-red-600" onClick={() => void removeAssignment(assignment.speaker.id)}>Remove</button></div>)}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="relative">
                      <button type="button" aria-label="Choose speakers to assign" aria-expanded={speakerAssignmentPickerOpen} className={`${inputClass} flex min-h-10 items-center justify-between gap-3 text-left`} onClick={() => {
                        setSpeakerAssignmentPickerOpen((open) => !open)
                        if (!speakerAssignmentPickerOpen) setSpeakerAssignmentSearch('')
                      }}>
                        <span className="truncate">{pendingAssignmentSpeakers.length ? `${pendingAssignmentSpeakers.length} speaker${pendingAssignmentSpeakers.length === 1 ? '' : 's'} selected` : speakerLibraryLoading && templateEvent ? 'Loading speakers…' : 'Choose speakers'}</span>
                        <span aria-hidden="true" className="text-slate-400">⌄</span>
                      </button>
                      {speakerAssignmentPickerOpen && <div className="absolute z-20 mt-2 w-full min-w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
                        <input autoFocus aria-label="Search speakers to assign" className={inputClass} value={speakerAssignmentSearch} onChange={(event) => setSpeakerAssignmentSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSpeakerAssignmentPickerOpen(false) }} placeholder="Search speakers…" />
                        <div className="mt-2 max-h-60 overflow-y-auto" role="listbox" aria-multiselectable="true">
                          {filteredSpeakerAssignmentOptions.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No speakers match your search.</p> : filteredSpeakerAssignmentOptions.map((speaker) => {
                            const assigned = assignedSessionSpeakerIds.has(speaker.id)
                            const pending = pendingAssignmentSpeakerIds.includes(speaker.id)
                            return <label key={speaker.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${assigned ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/30'}`}>
                              <input type="checkbox" checked={pending || assigned} disabled={assigned} onChange={() => togglePendingSpeakerAssignment(speaker.id)} />
                              <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-900 dark:text-white">{speaker.name}</span><span className="block truncate text-xs text-slate-500">{assigned ? 'Already assigned' : [speaker.title, speaker.organization].filter(Boolean).join(' · ') || 'Profile details incomplete'}</span></span>
                            </label>
                          })}
                        </div>
                      </div>}
                    </div>
                    <select aria-label="Speaker role" className={inputClass} value={assignmentRole} onChange={(event) => setAssignmentRole(event.target.value as AgendaAssignment['role'])}>{['SPEAKER', 'MODERATOR', 'HOST', 'PANELIST'].map((roleValue) => <option key={roleValue} value={roleValue}>{roleValue[0]}{roleValue.slice(1).toLocaleLowerCase()}</option>)}</select>
                    <Button type="button" size="sm" variant="secondary" disabled={pendingAssignmentSpeakerIds.length === 0 || busy} onClick={() => void addAssignment()}>Assign</Button>
                  </div>
                  {pendingAssignmentSpeakers.length > 0 && <div className="mt-2 flex flex-wrap gap-2" aria-label="Pending speaker selections">{pendingAssignmentSpeakers.map((speaker) => <span key={speaker.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">{speaker.name}<button type="button" aria-label={`Remove pending ${speaker.name}`} className="ml-0.5 text-indigo-500 hover:text-indigo-800" onClick={() => togglePendingSpeakerAssignment(speaker.id)}>×</button></span>)}</div>}
                  {templateEvent && <div className="mt-3 flex flex-wrap items-end gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => { setCreatingSessionSpeaker((current) => !current); setSpeakerForm(EMPTY_SPEAKER) }}>{creatingSessionSpeaker ? 'Cancel new speaker' : 'Create speaker'}</Button>{creatingSessionSpeaker && <><input aria-label="New speaker name" className={`${inputClass} min-w-52 flex-1`} placeholder="Speaker name" value={speakerForm.name} onChange={(event) => setSpeakerForm({ ...speakerForm, name: event.target.value })} /><Button type="button" size="sm" disabled={busy || !speakerForm.name.trim()} onClick={() => void saveSpeaker()}>{busy ? 'Adding…' : 'Add to session'}</Button></>}</div>}
                </div>
              )}
              <div className="mt-5 flex flex-wrap justify-between gap-2">{selectedSession ? <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => void archiveSession(selectedSession)}>Archive session</Button> : <span /> }<Button type="button" size="sm" disabled={busy || !sessionForm.title} onClick={() => void saveSession()}>{busy ? 'Saving…' : 'Save session'}</Button></div>
            </EventWorkspaceDrawer>
          )}
        </div>
      ) : (
        <div className={`grid gap-4 ${speakerFormOpen ? 'xl:grid-cols-[minmax(0,1fr)_minmax(360px,.72fr)]' : ''}`}>
          <EventEntityListShell>
            <OperationsSearchToolbar entityLabel="speakers" selectedCount={selectedBulkSpeakerIds.length} hasResults={filteredSpeakers.length > 0} allSelected={filteredSpeakers.length > 0 && filteredSpeakers.every((speaker) => selectedBulkSpeakerIds.includes(speaker.id))} onToggleAll={(checked) => setSelectedBulkSpeakerIds((current) => checked ? [...new Set([...current, ...filteredSpeakers.map((speaker) => speaker.id)])] : current.filter((id) => !filteredSpeakers.some((speaker) => speaker.id === id)))} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search speakers, organizations..." filters={<p className="text-xs text-slate-500">No additional speaker filters.</p>} />
            <div className="mt-4 space-y-3">{filteredSpeakers.length === 0 ? <EventEmptyState size="sm" title={data.speakers.length === 0 ? 'No speakers yet' : 'No speakers match your search'} description={data.speakers.length === 0 ? templateEvent ? 'Add speakers to sessions from the Agenda.' : 'No speakers have been added to this event yet.' : 'Clear the search to see every speaker.'} actions={data.speakers.length === 0 ? templateEvent ? [] : [{ label: 'Add from speaker library', variant: 'secondary', onClick: openSpeakerLibrary }, { label: 'Import speakers', variant: 'secondary', onClick: () => setImportJob('new') }, { label: 'Add speaker', onClick: () => { setCreatingSpeaker(true); setSpeakerForm(EMPTY_SPEAKER) } }] : [{ label: 'Clear search', variant: 'secondary', onClick: () => setSearch('') }]} /> : filteredSpeakers.map((speaker) => {
              const missingDetailsLabel = speakerMissingDetailsLabel(speaker.missingFields)
              return <EventEntityCard key={speaker.id} selected={selectedSpeakerId === speaker.id} className="group relative flex items-start gap-3 pr-[10.5rem] hover:bg-[#f7f9fe] [&:has(.event-survey-assignment-toolbar[data-open=true])]:bg-[#f7f9fe]"><label className="mt-1 flex shrink-0 items-center"><input type="checkbox" aria-label={`Select ${speaker.name} for feedback survey`} checked={selectedBulkSpeakerIds.includes(speaker.id)} onChange={(event) => setSelectedBulkSpeakerIds((current) => event.target.checked ? [...new Set([...current, speaker.id])] : current.filter((id) => id !== speaker.id))} /></label><button type="button" onClick={() => openSpeaker(speaker)} aria-pressed={selectedSpeakerId === speaker.id} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><div><p className="font-semibold text-slate-950 dark:text-white">{speaker.name}</p><p className="mt-1 text-xs text-slate-500">{[speaker.title, speaker.organization].filter(Boolean).join(' · ') || 'Profile details incomplete'}</p></div><p className="mt-2 text-xs text-slate-500">{speaker.sessionCount === 0 ? 'Assigned to this event · No sessions yet' : `${speaker.sessionCount} session${speaker.sessionCount === 1 ? '' : 's'} in this event`} · Headshot {speaker.headshotState.toLocaleLowerCase()}{speaker.survey ? ` · ${speaker.survey.name}` : ''}</p></button><div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{speaker.profileState === 'MISSING_DETAILS' && missingDetailsLabel && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{missingDetailsLabel}</span>}{!selectedBulkSpeakerIds.includes(speaker.id) && <EventSurveyAssignmentControl entityName={speaker.name} surveys={availableBulkSurveys} currentEventId={eventId} assignedSurvey={speaker.survey ? { ...speaker.survey, targetType: 'SPEAKER', eventId } : null} onAssign={(surveyId) => attachSpeakerSurvey(speaker.id, surveyId)} onDetach={() => detachSurvey('SPEAKER', speaker.id)} onCreateSurvey={createSurveyFromLibrary} previewHref={speaker.survey ? surveyEditorHref(speaker.survey.id) : undefined} isSurveySelectable={(survey) => isSurveyAssignableToEventTarget(survey, eventId)} disabled={busy} />}</div></EventEntityCard>
            })}</div>
          </EventEntityListShell>
          {speakerFormOpen && <EventCard padding="md" className="self-start xl:sticky xl:top-4"><div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-950 dark:text-white">{selectedSpeakerId ? 'Speaker detail' : 'Add speaker'}</h3>{selectedSpeaker && <p className="mt-1 text-xs text-slate-500">Headshot state: {selectedSpeaker.headshotState.toLocaleLowerCase()}</p>}</div><Button type="button" size="sm" variant="ghost" onClick={dismissSpeaker}>Close</Button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{([['Name', 'name'], ['Title', 'title'], ['Organization', 'organization'], ['Email', 'email'], ['Phone', 'phone']] as const).map(([label, key]) => <AgendaField key={key} label={label} className={key === 'name' ? 'sm:col-span-2' : ''}><input type={key === 'email' ? 'email' : 'text'} className={inputClass} value={speakerForm[key]} onChange={(event) => setSpeakerForm({ ...speakerForm, [key]: event.target.value })} /></AgendaField>)}<AgendaField label="Biography" className="sm:col-span-2"><textarea rows={5} className={inputClass} value={speakerForm.biography} onChange={(event) => setSpeakerForm({ ...speakerForm, biography: event.target.value })} /></AgendaField></div>{selectedSpeaker && <><div className="mt-5 border-t border-slate-200 pt-4"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Assigned sessions</h4><div className="mt-2 space-y-1 text-sm text-slate-700">{selectedSpeaker.sessionAssignments.length ? selectedSpeaker.sessionAssignments.map((assignment) => <p key={assignment.id}>{assignment.session?.name} · {assignment.role.toLocaleLowerCase()}</p>) : <p>No sessions assigned.</p>}</div></div><div className="mt-5 border-t border-slate-200 pt-4"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Speaker survey</h4>{selectedSpeaker.survey && <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><p className="font-semibold text-slate-900">{selectedSpeaker.survey.name}</p><p className="mt-1 text-xs text-slate-500">{selectedSpeaker.survey.questionCount} question{selectedSpeaker.survey.questionCount === 1 ? '' : 's'} · {selectedSpeaker.survey.isActive ? 'Link active' : 'Link inactive'}</p><a className="mt-2 inline-block text-xs font-semibold text-indigo-700 underline" href={selectedSpeaker.survey.kioskPath} target="_blank" rel="noreferrer">Open speaker survey</a></div>}<div className="mt-3"><EventSurveyAssignmentControl entityName={selectedSpeaker.name} surveys={availableBulkSurveys} currentEventId={eventId} assignedSurvey={selectedSpeaker.survey ? { ...selectedSpeaker.survey, targetType: 'SPEAKER', eventId } : null} onAssign={(surveyId) => attachSpeakerSurvey(selectedSpeaker.id, surveyId)} onDetach={() => detachSurvey('SPEAKER', selectedSpeaker.id)} onCreateSurvey={createSurveyFromLibrary} previewHref={selectedSpeaker.survey ? surveyEditorHref(selectedSpeaker.survey.id) : undefined} isSurveySelectable={(survey) => isSurveyAssignableToEventTarget(survey, eventId)} disabled={busy} /></div></div>{!selectedSpeaker.isAssignedToEvent && <div className="mt-5 border-t border-slate-200 pt-4"><Button type="button" size="sm" disabled={busy} onClick={() => void addExistingSpeakerToEvent(selectedSpeaker.id)}>Add to this event</Button></div>}</>}<div className="mt-5 flex flex-wrap justify-between gap-2">{selectedSpeaker ? <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => void archiveSpeaker(selectedSpeaker)}>Archive speaker</Button> : <span />}<Button type="button" size="sm" disabled={busy || !speakerForm.name} onClick={() => void saveSpeaker()}>{busy ? 'Saving…' : 'Save speaker'}</Button></div></EventCard>}
        </div>
      )}
      </>}

      <EventConfirmDialog
        open={Boolean(pendingBulkConflict)}
        title="Some selected targets already have a survey"
        body={pendingBulkConflict ? <div className="space-y-3"><p>{pendingBulkConflict.counts.requested} selected {pendingBulkConflict.targetType === 'SESSION' ? 'session' : 'speaker'}{pendingBulkConflict.counts.requested === 1 ? '' : 's'} requested. {pendingBulkConflict.counts.alreadyAttached} already use this survey and will remain unchanged. {pendingBulkConflict.counts.skipped} use a different survey.</p><p className="text-sm text-slate-600 dark:text-zinc-300">Skip existing assignments keeps their current survey. Replacing deactivates the current assignment and attaches the selected survey; it does not publish or change survey questions.</p><Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => pendingBulkConflict && void applyBulkSurvey({ targetType: pendingBulkConflict.targetType, targetIds: pendingBulkConflict.targetIds, surveyId: pendingBulkConflict.surveyId, conflictMode: 'REPLACE_EXISTING' })}>Replace existing assignments</Button></div> : ''}
        confirmLabel="Skip existing assignments"
        busy={busy}
        onCancel={() => setPendingBulkConflict(null)}
        onConfirm={() => pendingBulkConflict && void applyBulkSurvey({ targetType: pendingBulkConflict.targetType, targetIds: pendingBulkConflict.targetIds, surveyId: pendingBulkConflict.surveyId, conflictMode: 'SKIP_EXISTING' })}
      />

      <EventConfirmDialog
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? ''}
        body={pendingConfirm?.body ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Confirm'}
        destructive={pendingConfirm?.destructive}
        busy={busy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          const confirmed = pendingConfirm
          setPendingConfirm(null)
          confirmed?.onConfirm()
        }}
      />
    </section>
  )
}
