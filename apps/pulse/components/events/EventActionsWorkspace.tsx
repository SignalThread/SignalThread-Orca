'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EventActionVoiceUpdateRecorder } from '@/components/events/EventActionVoiceUpdateRecorder'
import { EventThemeEvidencePanel } from '@/components/events/EventThemeEvidencePanel'
import { EventPostEventFollowThrough } from '@/components/events/EventPostEventFollowThrough'
import { StatusPill, type StatusPillTone } from '@/components/ui/StatusPill'
import {
  EVENT_ACTION_CLASSIFICATIONS,
  EVENT_ACTION_CLASSIFICATION_LABELS,
  EVENT_ACTION_STATUSES,
  EVENT_ACTION_STATUS_LABELS,
  canTransitionEventAction,
  type EventActionClassification,
  type EventActionStatus,
} from '@/lib/event-actions/contract'
import type { EventThemeEvidenceResult } from '@/lib/event-intelligence/theme-evidence'

type Owner = { id: string; email: string; firstName: string | null; lastName: string | null }

interface ActionRow {
  id: string
  eventId: string
  title: string
  summary: string | null
  taxonomyKey: string
  priorityLevel: string
  ownerUserId: string | null
  owner: Owner | null
  actionClassification: EventActionClassification
  actionStatus: EventActionStatus
  actionDueAt: string | null
  actionBlockedReason: string | null
  actionResolution: string | null
  lastSeenAt: string
  updatedAt: string
  _count: { evidence: number; actionUpdates: number }
}

interface AvailableFinding {
  id: string
  title: string
  summary: string | null
  taxonomyKey: string
  priorityLevel: string
  status: string
  ownerUserId: string | null
  owner: Owner | null
  evidenceCount: number
  lastSeenAt: string
}

interface ActionEvidence {
  id: string
  answerId: string
  responseId: string
  questionId: string | null
  transcriptSnippet: string
  sentimentScore: number | null
  createdAt: string
  answer: {
    id: string
    questionKey: string
    promptLabel: string
    answerTranscript: { text: string } | null
  }
  question: { id: string; label: string; type: string } | null
  response: {
    id: string
    anonymousId: string
    status: string
    startedAt: string
    completedAt: string | null
  }
  surveyTarget: {
    id: string
    name: string
    category: string
    eventStructureItem: { id: string; name: string } | null
    speakerAssignment: {
      id: string
      role: string
      speaker: { id: string; name: string }
    } | null
  } | null
}

interface ActionDetail extends Omit<ActionRow, '_count'> {
  evidence: ActionEvidence[]
  actionHistory: Array<{
    id: string
    actorUserId: string
    type: string
    fromValue: string | null
    toValue: string | null
    detailsJson: Record<string, unknown> | null
    createdAt: string
  }>
  actionUpdates: Array<{
    id: string
    authorUserId: string
    kind: 'WRITTEN' | 'VOICE'
    body: string | null
    voiceTranscript: string | null
    voiceTranscriptionStatus: string | null
    voiceFailureReason: string | null
    createdAt: string
  }>
  actionDeliveries: Array<{
    id: string
    recipientEmail: string
    recipientName: string | null
    status: 'PENDING' | 'SENT' | 'FAILED'
    provider: string | null
    providerMessageId: string | null
    attemptCount: number
    lastAttemptAt: string | null
    sentAt: string | null
    failureCode: string | null
    failureMessage: string | null
    deepLink: string
    createdAt: string
    attempts: Array<{
      id: string
      attemptNumber: number
      status: 'PENDING' | 'SENT' | 'FAILED'
      provider: string | null
      providerMessageId: string | null
      failureMessage: string | null
      attemptedAt: string
    }>
  }>
  availableOwners: Owner[]
}

type ActionView = 'open' | 'my' | 'all' | 'unassigned' | 'working' | 'blocked' | 'complete' | 'after-event' | 'next-event'
type ActionSort = 'due' | 'priority' | 'recent'

const VIEWS: Array<{ key: ActionView; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'my', label: 'My actions' },
  { key: 'all', label: 'All actions' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'working', label: 'Working' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'complete', label: 'Complete' },
  { key: 'after-event', label: 'After-event follow-up' },
  { key: 'next-event', label: 'Next-event learning' },
]

const PRIMARY_VIEWS: Array<{ key: ActionView; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'unassigned', label: 'Unclaimed' },
  { key: 'my', label: 'Mine' },
  { key: 'after-event', label: 'After event' },
  { key: 'complete', label: 'Complete' },
]

function isOpenAction(action: Pick<ActionRow, 'actionStatus'>) {
  return !['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(action.actionStatus)
}

function matchesActionView(action: ActionRow, view: ActionView, currentUserId: string) {
  return view === 'all'
    || (view === 'open' && isOpenAction(action))
    || (view === 'my' && action.ownerUserId === currentUserId)
    || (view === 'unassigned' && action.actionStatus === 'UNASSIGNED')
    || (view === 'working' && action.actionStatus === 'WORKING')
    || (view === 'blocked' && action.actionStatus === 'BLOCKED')
    || (view === 'complete' && action.actionStatus === 'COMPLETE')
    || (view === 'after-event' && action.actionClassification === 'AFTER_EVENT_FOLLOW_UP')
    || (view === 'next-event' && action.actionClassification === 'NEXT_EVENT_LEARNING')
}

const PRIORITY_RANK: Record<string, number> = { Immediate: 4, Soon: 3, Watch: 2, Informational: 1 }

function ownerName(owner: Owner | null) {
  if (!owner) return 'Unassigned'
  return [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email
}

function dateLabel(value: string | null) {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No due date'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function dueLabel(action: Pick<ActionRow, 'actionDueAt' | 'actionStatus'>) {
  const label = dateLabel(action.actionDueAt)
  if (!action.actionDueAt || ['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(action.actionStatus)) {
    return { label, overdue: false }
  }
  const due = new Date(action.actionDueAt)
  const overdue = !Number.isNaN(due.getTime()) && due.getTime() < Date.now()
  return { label: overdue ? `Overdue · ${label}` : `Due ${label}`, overdue }
}

function dateTimeLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function historyValueLabel(type: string, value: string | null, owners: Owner[]) {
  if (['ASSIGNED', 'REASSIGNED', 'UNASSIGNED'].includes(type)) {
    if (!value) return 'Unassigned'
    const owner = owners.find((candidate) => candidate.id === value)
    return owner ? ownerName(owner) : 'Former account member'
  }
  if (type === 'STATUS_CHANGED' && value && EVENT_ACTION_STATUSES.includes(value as EventActionStatus)) {
    return EVENT_ACTION_STATUS_LABELS[value as EventActionStatus]
  }
  if (type === 'CLASSIFICATION_CHANGED' && value && EVENT_ACTION_CLASSIFICATIONS.includes(value as EventActionClassification)) {
    return EVENT_ACTION_CLASSIFICATION_LABELS[value as EventActionClassification]
  }
  if (type === 'DUE_DATE_CHANGED' && value) return dateTimeLabel(value)
  return value
}

function dueInputValue(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function statusTone(status: EventActionStatus): StatusPillTone {
  if (status === 'BLOCKED') return 'blocking'
  if (status === 'COMPLETE' || status === 'WORKING') return 'healthy'
  if (status === 'DISMISSED' || status === 'CANCELLED') return 'lifecycle'
  return 'attention'
}

function evidenceSentiment(score: number | null) {
  if (score === null) return null
  if (score >= 0.35) return 'POSITIVE'
  if (score <= -0.25) return 'NEGATIVE'
  return 'MIXED'
}

function actionEvidence(detail: ActionDetail): EventThemeEvidenceResult {
  return {
    eventId: detail.eventId,
    themeKey: detail.taxonomyKey,
    themeLabel: detail.title,
    mentionCount: detail.evidence.length,
    evidence: detail.evidence.map((row) => ({
      themeKey: detail.taxonomyKey,
      themeLabel: detail.title,
      answerId: row.answerId,
      responseId: row.responseId,
      questionId: row.questionId,
      surveyTargetId: row.surveyTarget?.id ?? null,
      transcriptSnippet: row.transcriptSnippet,
      transcriptText: row.answer.answerTranscript?.text ?? null,
      question: {
        id: row.question?.id ?? null,
        key: row.answer.questionKey,
        label: row.question?.label ?? null,
        promptLabel: row.answer.promptLabel,
      },
      target: {
        id: row.surveyTarget?.id ?? null,
        name: row.surveyTarget?.name ?? null,
        category: row.surveyTarget?.category ?? null,
        session: row.surveyTarget?.eventStructureItem ?? null,
        speaker: row.surveyTarget?.speakerAssignment ? {
          assignmentId: row.surveyTarget.speakerAssignment.id,
          id: row.surveyTarget.speakerAssignment.speaker.id,
          name: row.surveyTarget.speakerAssignment.speaker.name,
          role: row.surveyTarget.speakerAssignment.role,
        } : null,
      },
      response: {
        id: row.response.id,
        anonymousId: row.response.anonymousId,
        status: row.response.status,
        startedAt: row.response.startedAt,
        completedAt: row.response.completedAt,
      },
      sentimentScore: row.sentimentScore,
      sentimentLabel: evidenceSentiment(row.sentimentScore),
      confidence: null,
      createdAt: row.createdAt,
    })),
  }
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.success) throw new Error(body.error || 'Action request failed')
  return body.data
}

export function EventActionsWorkspace({ eventId, accountSlug, isPostEvent = false }: { eventId: string; accountSlug: string; isPostEvent?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedView = searchParams.get('actionView') as ActionView | null
  const view = VIEWS.some((item) => item.key === requestedView) ? requestedView! : 'open'
  const selectedActionId = searchParams.get('actionId')?.trim() || null
  const [actions, setActions] = useState<ActionRow[]>([])
  const [findings, setFindings] = useState<AvailableFinding[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [detail, setDetail] = useState<ActionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ActionSort>('due')
  const [updateBody, setUpdateBody] = useState('')
  const [statusDraft, setStatusDraft] = useState<EventActionStatus | null>(null)
  const [statusContext, setStatusContext] = useState('')
  const [statusContextError, setStatusContextError] = useState<string | null>(null)
  const [newClassification, setNewClassification] = useState<EventActionClassification>('DURING_EVENT')
  const [showCreate, setShowCreate] = useState(false)
  const [showCompletedFollowThrough, setShowCompletedFollowThrough] = useState(false)
  const actionCloseRef = useRef<HTMLButtonElement | null>(null)
  const baseUrl = `/api/app/events/${encodeURIComponent(eventId)}/actions`
  const accountQuery = `account=${encodeURIComponent(accountSlug)}`

  const updateUrl = (updates: Record<string, string | null>) => {
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', 'actions')
    for (const [key, value] of Object.entries(updates)) {
      if (value) query.set(key, value)
      else query.delete(key)
    }
    router.replace(`/app/events/${encodeURIComponent(eventId)}/dashboard?${query.toString()}`)
  }

  useEffect(() => {
    if (!selectedActionId) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => actionCloseRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') updateUrl({ actionId: null })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [selectedActionId])

  const loadActions = async () => {
    const data = await jsonRequest(`${baseUrl}?${accountQuery}`)
    setActions(data.actions as ActionRow[])
    setFindings(data.availableFindings as AvailableFinding[])
    setOwners(data.availableOwners as Owner[])
    setCurrentUserId(data.currentUserId as string)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    jsonRequest(`${baseUrl}?${accountQuery}`)
      .then((data) => {
        if (cancelled) return
        setActions(data.actions as ActionRow[])
        setFindings(data.availableFindings as AvailableFinding[])
        setOwners(data.availableOwners as Owner[])
        setCurrentUserId(data.currentUserId as string)
      })
      .catch((currentError) => { if (!cancelled) setError(currentError instanceof Error ? currentError.message : 'Failed to load actions') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, eventId])

  useEffect(() => {
    if (!selectedActionId) {
      setDetail(null)
      setStatusDraft(null)
      setStatusContext('')
      setStatusContextError(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setMutationError(null)
    jsonRequest(`${baseUrl}/${encodeURIComponent(selectedActionId)}?${accountQuery}`)
      .then((data) => { if (!cancelled) { setDetail(data as ActionDetail); setStatusDraft(null); setStatusContext(''); setStatusContextError(null) } })
      .catch((currentError) => { if (!cancelled) { setDetail(null); setMutationError(currentError instanceof Error ? currentError.message : 'Failed to load action') } })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, eventId, selectedActionId])

  useEffect(() => {
    if (!selectedActionId || !detail?.actionUpdates.some((item) => item.kind === 'VOICE' && ['UPLOADED', 'TRANSCRIBING'].includes(item.voiceTranscriptionStatus ?? ''))) return
    const timer = window.setTimeout(() => {
      jsonRequest(`${baseUrl}/${encodeURIComponent(selectedActionId)}?${accountQuery}`)
        .then((data) => setDetail(data as ActionDetail))
        .catch(() => undefined)
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [accountQuery, baseUrl, detail, selectedActionId])

  const visibleActions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en-US')
    const filtered = actions.filter((action) => {
      if (!matchesActionView(action, view, currentUserId)) return false
      return !query || [action.title, action.summary, action.taxonomyKey, ownerName(action.owner)]
        .some((value) => value?.toLocaleLowerCase('en-US').includes(query))
    })
    return [...filtered].sort((left, right) => {
      if (sort === 'priority') return (PRIORITY_RANK[right.priorityLevel] ?? 0) - (PRIORITY_RANK[left.priorityLevel] ?? 0)
      if (sort === 'recent') return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      if (!left.actionDueAt) return right.actionDueAt ? 1 : 0
      if (!right.actionDueAt) return -1
      return new Date(left.actionDueAt).getTime() - new Date(right.actionDueAt).getTime()
    })
  }, [actions, currentUserId, search, sort, view])

  const postEventActions = useMemo(() => actions
    .filter((action) => {
      const futureWork = action.actionClassification === 'AFTER_EVENT_FOLLOW_UP' || action.actionClassification === 'NEXT_EVENT_LEARNING'
      return (isOpenAction(action) || futureWork) && (showCompletedFollowThrough || isOpenAction(action))
    })
    .sort((left, right) => {
      if (!left.actionDueAt) return right.actionDueAt ? 1 : 0
      if (!right.actionDueAt) return -1
      return new Date(left.actionDueAt).getTime() - new Date(right.actionDueAt).getTime()
    }), [actions, showCompletedFollowThrough])

  const mutate = async (payload: Record<string, unknown>, method: 'PATCH' | 'POST' = 'PATCH') => {
    if (!selectedActionId) return false
    setSaving(true)
    setMutationError(null)
    try {
      await jsonRequest(`${baseUrl}/${encodeURIComponent(selectedActionId)}?${accountQuery}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey: crypto.randomUUID() }),
      })
      await loadActions()
      const refreshed = await jsonRequest(`${baseUrl}/${encodeURIComponent(selectedActionId)}?${accountQuery}`)
      setDetail(refreshed as ActionDetail)
      return true
    } catch (currentError) {
      setMutationError(currentError instanceof Error ? currentError.message : 'Failed to update action')
      return false
    } finally {
      setSaving(false)
    }
  }

  const refreshSelectedAction = async () => {
    if (!selectedActionId) return
    await loadActions()
    const refreshed = await jsonRequest(`${baseUrl}/${encodeURIComponent(selectedActionId)}?${accountQuery}`)
    setDetail(refreshed as ActionDetail)
  }

  const convertFinding = async (finding: AvailableFinding) => {
    setSaving(true)
    setMutationError(null)
    try {
      const action = await jsonRequest(`${baseUrl}?${accountQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: finding.id,
          classification: newClassification,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      await loadActions()
      updateUrl({ actionId: action.id, actionView: 'all' })
    } catch (currentError) {
      setMutationError(currentError instanceof Error ? currentError.message : 'Failed to create action')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div data-testid="actions-loading" className="grid gap-4 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl bg-slate-100" />)}</div>
  if (error) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>

  const selectedEvidence = detail ? actionEvidence(detail) : null
  const latestDelivery = detail?.actionDeliveries?.[0] ?? null
  const countForView = (candidateView: ActionView) => actions.filter((action) => matchesActionView(action, candidateView, currentUserId)).length
  const linkedEvidenceCount = actions.reduce((total, action) => total + action._count.evidence, 0)
  const isPostEventActionsWorkspace = isPostEvent
  const queueActions = isPostEventActionsWorkspace ? postEventActions : visibleActions
  const followThroughActions = actions.map((action) => ({
    id: action.id,
    title: action.title,
    status: action.actionStatus,
    owner: ownerName(action.owner),
    dueAt: action.actionDueAt,
    classification: action.actionClassification,
  }))

  return (
    <div className="mx-auto max-w-[1176px] space-y-4 pt-1.5 text-slate-950" data-testid="signals-actions-workspace">
      {!isPostEventActionsWorkspace && <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-[18px] font-semibold leading-6 tracking-[-0.015em]">Action queue</h2><p className="mt-1 text-[12px] text-slate-500">Only what someone deliberately decided to own. {actions.length} actions from {linkedEvidenceCount} linked evidence items.</p></div>
        <div className="flex gap-2"><details className="relative"><summary className="flex h-10 cursor-pointer list-none items-center rounded-[10px] border border-slate-200 bg-white px-4 text-[11px] font-bold text-slate-700 shadow-sm">Filters</summary><div className="absolute right-0 top-full z-30 mt-2 w-[min(520px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]"><label><span className="sr-only">Search actions</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actions, source findings, or owners" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label><label><span className="sr-only">Sort actions</span><select value={sort} onChange={(event) => setSort(event.target.value as ActionSort)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="due">Due date</option><option value="priority">Priority</option><option value="recent">Recently updated</option></select></label></div><div className="mt-3 flex flex-wrap gap-2">{VIEWS.filter((item) => item.key !== 'open' && item.key !== 'complete').map((item) => <button key={item.key} type="button" aria-pressed={view === item.key} onClick={() => updateUrl({ actionView: item.key, actionId: null })} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${view === item.key ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 text-slate-600'}`}>{item.label}</button>)}</div></div></details><button type="button" onClick={() => setShowCreate((current) => !current)} aria-expanded={showCreate} className="h-10 rounded-[10px] bg-[#111a3a] px-4 text-[11px] font-bold text-white shadow-sm">New action</button></div>
      </header>}

      {isPostEventActionsWorkspace && <EventPostEventFollowThrough actions={followThroughActions} />}

      {isPostEventActionsWorkspace ? <section aria-labelledby="follow-through-records-heading" className="pt-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="follow-through-records-heading" className="text-[18px] font-semibold leading-6 tracking-[-0.015em]">Follow-through records</h2><p className="mt-1 text-[12px] text-slate-500">Open and future work from the closing record. Open any item to assign an owner, update its status, or set its due date.</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => setShowCompletedFollowThrough((current) => !current)} aria-pressed={showCompletedFollowThrough} className="h-10 rounded-[10px] border border-slate-200 bg-white px-4 text-[11px] font-bold text-slate-700 shadow-sm">{showCompletedFollowThrough ? 'Hide completed' : 'Show completed'}</button><button type="button" onClick={() => setShowCreate((current) => !current)} aria-expanded={showCreate} className="h-10 rounded-[10px] bg-[#111a3a] px-4 text-[11px] font-bold text-white shadow-sm">New follow-through</button></div>
        </div>
      </section> : <nav aria-label="Action views" className="flex gap-2 overflow-x-auto">
        {PRIMARY_VIEWS.map((item) => <button key={item.key} type="button" aria-pressed={view === item.key} onClick={() => updateUrl({ actionView: item.key === 'open' ? null : item.key, actionId: null })} className={`flex min-w-[90px] shrink-0 items-center justify-between gap-4 rounded-lg border px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${view === item.key ? 'border-[#111a3a] bg-[#111a3a] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}><span>{item.label}</span><span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[10px]">{countForView(item.key)}</span></button>)}
      </nav>}

      {mutationError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{mutationError}</div>}

      <div>
        <section className="self-start overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.04)]" aria-label={isPostEventActionsWorkspace ? 'Post-event follow-through records' : 'Event actions'}>
          {queueActions.length === 0 ? <div className="p-8 text-center"><p className="text-sm font-bold text-slate-900">{isPostEventActionsWorkspace ? 'No follow-through records to manage' : 'No actions match this view'}</p><p className="mt-1 text-xs text-slate-500">{isPostEventActionsWorkspace ? 'Open action work is complete; include completed records if you need to review them.' : 'Choose another view or convert an evidence-backed finding below.'}</p></div> : queueActions.map((action) => (
            <button key={action.id} type="button" aria-pressed={selectedActionId === action.id} onClick={() => updateUrl({ actionId: action.id })} className={`min-h-[100px] w-full min-w-0 border-b border-slate-100 px-5 py-4 text-left last:border-b-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300 ${selectedActionId === action.id ? 'bg-indigo-50/60' : ''}`}>
              <div className="grid gap-3 sm:grid-cols-[92px_minmax(0,1fr)_150px]"><div><StatusPill label={EVENT_ACTION_STATUS_LABELS[action.actionStatus]} tone={statusTone(action.actionStatus)} /></div><div className="min-w-0"><h3 className="text-[14px] font-bold text-slate-950">{action.title}</h3><p className="mt-1 text-[11px] text-slate-500">{ownerName(action.owner)} · {EVENT_ACTION_CLASSIFICATION_LABELS[action.actionClassification]}</p><p className="mt-2 line-clamp-1 text-[11px] text-slate-500">{action.summary || `Created from ${action.taxonomyKey.replaceAll('_', ' ')} · ${action._count.evidence} linked evidence`}</p></div><div className="text-left sm:text-right"><p className={`text-[11px] font-semibold ${dueLabel(action).overdue ? 'text-rose-700' : 'text-slate-600'}`}>{dueLabel(action).label}</p><p className="mt-2 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{isPostEventActionsWorkspace ? 'Follow-through' : 'From intelligence'}</p></div></div>
            </button>
          ))}
        </section>

        {selectedActionId && <><button type="button" aria-label="Close action detail" onClick={() => updateUrl({ actionId: null })} className="!m-0 fixed inset-0 z-40 cursor-default bg-slate-950/35 backdrop-blur-[1px]" /><aside className="!m-0 fixed inset-y-0 right-0 z-50 w-[min(560px,100vw)] overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-[-18px_0_48px_rgba(15,23,42,0.16)]" data-testid="action-detail" role="dialog" aria-modal="true" aria-label="Action detail">
          {detailLoading ? <div className="h-64 animate-pulse rounded-lg bg-slate-100" /> : detail ? <>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><StatusPill label={EVENT_ACTION_STATUS_LABELS[detail.actionStatus]} tone={statusTone(detail.actionStatus)} /><span className={`rounded-md border px-2 py-1 text-[9px] font-bold ${detail.actionClassification === 'NEXT_EVENT_LEARNING' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>{EVENT_ACTION_CLASSIFICATION_LABELS[detail.actionClassification]}</span></div><h3 className="mt-3 text-[20px] font-bold leading-7 text-slate-950">{detail.title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-400">{ownerName(detail.owner)} · {dueLabel(detail).label}</p></div><button ref={actionCloseRef} type="button" aria-label="Close" onClick={() => updateUrl({ actionId: null })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">×</button></div>
            <dl className="mt-6 grid grid-cols-3 gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Source intelligence</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{detail.taxonomyKey.replaceAll('_', ' ')}</dd></div><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Who reported it</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{new Set(detail.evidence.map((item) => item.responseId)).size} responses</dd></div><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">How it was collected</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{[...new Set(detail.evidence.map((item) => item.surveyTarget?.category).filter(Boolean))].map((item) => item!.toLocaleLowerCase()).join(', ') || 'Collection context unavailable'}</dd></div></dl>
            {detail.summary && <div className="mt-5"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">What the organizer asked for</p><p className="mt-2 text-[13px] leading-6 text-slate-600">{detail.summary}</p></div>}
            {detail.evidence[0] && <div className="mt-5"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">What people said</p><blockquote className="mt-2 rounded-xl border border-slate-200 border-l-indigo-200 p-4 text-[13px] leading-6 text-slate-600">“{detail.evidence[0].transcriptSnippet}”<footer className="mt-2 text-[10px] text-slate-400">{detail.evidence[0].surveyTarget?.name || 'Event response'} · {dateTimeLabel(detail.evidence[0].createdAt)}</footer></blockquote></div>}

            <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Owner<select disabled={saving} value={detail.ownerUserId ?? ''} onChange={async (event) => { const ownerUserId = event.target.value || null; const ok = await mutate({ operation: 'ASSIGN', ownerUserId }); if (ok && view === 'my' && ownerUserId !== currentUserId) updateUrl({ actionView: 'all' }) }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="">Unassigned</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{ownerName(owner)}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Status<select disabled={saving} value={statusDraft ?? detail.actionStatus} onChange={(event) => { setStatusDraft(event.target.value as EventActionStatus); setStatusContext(''); setStatusContextError(null) }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold">{EVENT_ACTION_STATUSES.map((status) => <option key={status} value={status} disabled={status !== detail.actionStatus && !canTransitionEventAction(detail.actionStatus, status)}>{EVENT_ACTION_STATUS_LABELS[status]}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Priority<select disabled={saving} value={detail.priorityLevel} onChange={(event) => mutate({ operation: 'SET_PRIORITY', priority: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold">{['Immediate', 'Soon', 'Watch', 'Informational'].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Due date<input disabled={saving} type="datetime-local" value={dueInputValue(detail.actionDueAt)} onChange={(event) => mutate({ operation: 'SET_DUE_DATE', dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
              <label className="text-xs font-bold text-slate-600 sm:col-span-2 xl:col-span-1 2xl:col-span-2">Classification<select disabled={saving} value={detail.actionClassification} onChange={(event) => mutate({ operation: 'SET_CLASSIFICATION', classification: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold">{EVENT_ACTION_CLASSIFICATIONS.map((classification) => <option key={classification} value={classification}>{EVENT_ACTION_CLASSIFICATION_LABELS[classification]}</option>)}</select></label>
            </div>

            <div className="mt-5" aria-label="Quick status actions">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Move it along</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {detail.actionStatus !== 'WORKING' && canTransitionEventAction(detail.actionStatus, 'WORKING') && <button type="button" disabled={saving} onClick={() => { setStatusDraft('WORKING'); setStatusContext(''); setStatusContextError(null) }} className="min-h-11 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-700">Mark working</button>}
                {detail.actionStatus !== 'BLOCKED' && canTransitionEventAction(detail.actionStatus, 'BLOCKED') && <button type="button" disabled={saving} onClick={() => { setStatusDraft('BLOCKED'); setStatusContext(''); setStatusContextError(null) }} className="min-h-11 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Mark blocked</button>}
                {detail.actionStatus !== 'COMPLETE' && canTransitionEventAction(detail.actionStatus, 'COMPLETE') && <button type="button" disabled={saving} onClick={() => { setStatusDraft('COMPLETE'); setStatusContext(''); setStatusContextError(null) }} className="min-h-11 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">Mark complete</button>}
                {['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(detail.actionStatus) && canTransitionEventAction(detail.actionStatus, 'OPEN') && <button type="button" disabled={saving} onClick={() => { setStatusDraft('OPEN'); setStatusContext(''); setStatusContextError(null) }} className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Reopen</button>}
              </div>
            </div>

            {statusDraft && statusDraft !== detail.actionStatus && <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3"><label className="block text-xs font-bold text-slate-700">{statusDraft === 'BLOCKED' ? 'Blocked reason' : ['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(statusDraft) ? 'Resolution or reason' : 'Status change'}{(statusDraft === 'BLOCKED' || ['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(statusDraft)) && <textarea value={statusContext} onChange={(event) => { setStatusContext(event.target.value); if (event.target.value.trim()) setStatusContextError(null) }} aria-invalid={Boolean(statusContextError)} aria-describedby={statusContextError ? 'action-status-context-error' : undefined} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder={statusDraft === 'BLOCKED' ? 'Explain what is blocking progress' : 'Record the outcome or reason'} />}</label>{statusContextError && <p id="action-status-context-error" role="alert" className="mt-2 text-xs font-semibold text-rose-700">{statusContextError}</p>}<div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => { setStatusDraft(null); setStatusContext(''); setStatusContextError(null) }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button><button type="button" disabled={saving} onClick={async () => { const requiresContext = statusDraft === 'BLOCKED' || ['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(statusDraft); if (requiresContext && !statusContext.trim()) { setStatusContextError(statusDraft === 'BLOCKED' ? 'Enter a blocked reason before saving.' : 'Enter a resolution or reason before saving.'); return } const ok = await mutate({ operation: 'TRANSITION', status: statusDraft, blockedReason: statusDraft === 'BLOCKED' ? statusContext : null, resolution: ['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(statusDraft) ? statusContext : null }); if (ok) { setStatusDraft(null); setStatusContext(''); setStatusContextError(null) } }} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Save status</button></div></div>}

            {(detail.actionBlockedReason || detail.actionResolution) && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">{detail.actionBlockedReason ? `Blocked: ${detail.actionBlockedReason}` : `Resolution: ${detail.actionResolution}`}</div>}

            {latestDelivery && <section className={`mt-5 rounded-xl border p-4 ${latestDelivery.status === 'FAILED' ? 'border-rose-200 bg-rose-50' : latestDelivery.status === 'SENT' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} aria-label="Assignment email delivery">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs font-black uppercase tracking-[0.1em] ${latestDelivery.status === 'FAILED' ? 'text-rose-800' : latestDelivery.status === 'SENT' ? 'text-emerald-800' : 'text-amber-800'}`}>{latestDelivery.status === 'FAILED' ? 'Email not sent' : latestDelivery.status === 'SENT' ? 'Email sent' : 'Assignment email pending'}</p>
                  <p className="mt-1 break-words text-[11px] text-slate-600">Assigned to {ownerName(detail.owner)} · {latestDelivery.recipientEmail}</p>
                  {latestDelivery.failureMessage && <p className="mt-1 text-[11px] leading-5 text-rose-700">{latestDelivery.failureMessage}</p>}
                </div>
                {latestDelivery.status === 'FAILED' ? <button type="button" disabled={saving} onClick={() => mutate({ operation: 'RETRY_ASSIGNMENT_EMAIL', deliveryId: latestDelivery.id })} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Retry email</button> : latestDelivery.status === 'SENT' ? <a href={latestDelivery.deepLink} className="shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100">See the email they got</a> : null}
              </div>
              {latestDelivery.attempts.length > 0 && <ol className="mt-2 space-y-1 border-t border-current/10 pt-2" aria-label="Delivery attempts">{latestDelivery.attempts.map((attempt) => <li key={attempt.id} className="flex flex-wrap justify-between gap-2 text-[10px] text-slate-500"><span>Attempt {attempt.attemptNumber} · {attempt.status.toLocaleLowerCase()}</span><span>{dateTimeLabel(attempt.attemptedAt)}{attempt.providerMessageId ? ` · ${attempt.providerMessageId}` : ''}</span></li>)}</ol>}
            </section>}

            <div className="mt-5 border-t border-slate-200 pt-5"><h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Add an update</h4><textarea value={updateBody} onChange={(event) => setUpdateBody(event.target.value)} rows={3} placeholder="Type a short update…" className="mt-2 min-w-0 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving || !updateBody.trim()} onClick={async () => { if (await mutate({ kind: 'WRITTEN', body: updateBody }, 'POST')) setUpdateBody('') }} className="min-h-10 rounded-lg bg-[#111a3a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Send update</button>
              <EventActionVoiceUpdateRecorder endpoint={`${baseUrl}/${encodeURIComponent(selectedActionId)}/voice?${accountQuery}`} disabled={saving} onComplete={refreshSelectedAction} /></div>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-5"><h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Updates and history</h4><div className="mt-3 space-y-3 border-l border-slate-200 pl-4">{[...detail.actionHistory.filter((item) => item.type !== 'NO_CHANGE').map((item) => ({ id: item.id, createdAt: item.createdAt, label: item.type.replaceAll('_', ' ').toLocaleLowerCase(), detail: [historyValueLabel(item.type, item.fromValue, detail.availableOwners), historyValueLabel(item.type, item.toValue, detail.availableOwners)].filter(Boolean).join(' → ') })), ...detail.actionUpdates.map((item) => ({ id: item.id, createdAt: item.createdAt, label: item.kind === 'VOICE' ? 'Voice update' : 'Written update', detail: item.body || item.voiceTranscript || item.voiceFailureReason || item.voiceTranscriptionStatus?.toLocaleLowerCase() || 'Processing' }))].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).map((item) => <div key={`${item.label}-${item.id}`} className="relative min-w-0"><span className="absolute -left-[21px] top-1.5 flex h-3 w-3 rounded-full border-2 border-white bg-slate-300" /><div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><p className="text-[11px] font-bold capitalize text-slate-800">{item.label}</p><p className="text-[10px] text-slate-400">{dateTimeLabel(item.createdAt)}</p></div>{item.detail && <p className="mt-1 break-words text-xs leading-5 text-slate-600">{item.detail}</p>}</div>)}{detail.actionHistory.length === 0 && detail.actionUpdates.length === 0 && <p className="text-xs text-slate-500">No history has been recorded.</p>}</div></div>
          </> : <p className="text-sm text-slate-500">Select an action to view its detail.</p>}
          {detail && selectedEvidence && <div className="mt-5 border-t border-slate-200 pt-5"><EventThemeEvidencePanel loading={false} error={null} detail={selectedEvidence} fallbackTheme={{ label: detail.title, count: detail.evidence.length, sentimentLabel: null }} heading="Linked Evidence" onClear={() => updateUrl({ actionId: null })} /></div>}
        </aside></>}
      </div>

      {showCreate && findings.length > 0 && <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.04)]" aria-label="Available source findings"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-sm font-black text-slate-950">Create from a source finding</h3><p className="mt-1 text-xs text-slate-500">Conversion is explicit; the finding and its canonical evidence remain intact.</p></div><label className="text-xs font-bold text-slate-600">Classification<select value={newClassification} onChange={(event) => setNewClassification(event.target.value as EventActionClassification)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold sm:w-56">{EVENT_ACTION_CLASSIFICATIONS.map((classification) => <option key={classification} value={classification}>{EVENT_ACTION_CLASSIFICATION_LABELS[classification]}</option>)}</select></label></div><div className="mt-3 grid gap-2 lg:grid-cols-2">{findings.map((finding) => <article key={finding.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-bold text-slate-900">{finding.title}</p><p className="mt-1 text-xs text-slate-500">{finding.priorityLevel} · {finding.evidenceCount} evidence · {ownerName(finding.owner)}</p></div><button type="button" disabled={saving} onClick={() => convertFinding(finding)} className="shrink-0 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">Create action</button></article>)}</div></section>}
    </div>
  )
}
