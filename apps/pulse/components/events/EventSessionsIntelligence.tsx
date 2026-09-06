'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EventThemeEvidencePanel } from '@/components/events/EventThemeEvidencePanel'
import { EventEvidenceDrawer } from '@/components/events/EventEvidenceDrawer'
import { StatusPill, type StatusPillTone } from '@/components/ui/StatusPill'
import type { EventSessionIntelligenceResult } from '@/lib/event-session-intelligence'
import type { EventThemeEvidenceResult } from '@/lib/event-intelligence/theme-evidence'
import { formatSurveyCount } from '@/lib/event-survey-count'
import {
  EventActionableItem,
  resolveEventActionSource,
  useEventActionData,
} from '@/components/events/EventActionComposer'

type SessionView = 'all' | 'selected' | 'represented' | 'underrepresented' | 'awaiting-responses' | 'not-collecting' | 'needs-survey' | 'needs-review' | 'not-selected' | 'needs-attention' | 'strong' | 'needs-more-feedback'
type SessionRow = EventSessionIntelligenceResult['sessions'][number]

type SessionDisplayState = 'strong' | 'needs-attention' | 'needs-more-feedback' | 'no-clear-conclusion'

const VIEWS: Array<{ key: SessionView; label: string }> = [
  { key: 'all', label: 'All agenda sessions' },
  { key: 'selected', label: 'Currently collecting' },
  { key: 'represented', label: 'Collecting · 3+ responses' },
  { key: 'underrepresented', label: 'Underrepresented' },
  { key: 'awaiting-responses', label: 'Awaiting responses' },
  { key: 'not-collecting', label: 'Not collecting' },
  { key: 'needs-survey', label: 'Needs survey' },
  { key: 'needs-review', label: 'Missing details' },
]

const PRIMARY_VIEWS: Array<{ key: Extract<SessionView, 'all' | 'needs-attention' | 'strong' | 'needs-more-feedback'>; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'needs-attention', label: 'Needs attention' },
  { key: 'strong', label: 'Strong' },
  { key: 'needs-more-feedback', label: 'Needs more feedback' },
]

function stateClass(state: SessionRow['state']): StatusPillTone {
  if (state === 'REPRESENTED') return 'healthy'
  if (state === 'UNDERREPRESENTED') return 'attention'
  if (state === 'NEEDS_REVIEW') return 'blocking'
  return 'lifecycle'
}

type SessionCollectionSnapshot = Pick<SessionRow, 'selectedForListening' | 'responseCount' | 'listeningResponseCount'>

export function getSessionCollectionBadge(session: SessionCollectionSnapshot, minimumEvidenceResponses: number): { label: string; tone: StatusPillTone } | null {
  if (session.selectedForListening) {
    if (session.listeningResponseCount >= minimumEvidenceResponses) return null
    if (session.listeningResponseCount > 0) return {
      label: `Underrepresented · ${session.listeningResponseCount} of ${minimumEvidenceResponses} responses`,
      tone: 'attention',
    }
    return { label: 'Awaiting responses', tone: 'attention' }
  }

  if (session.responseCount > 0) {
    return { label: `Not collecting · ${formatSurveyCount(session.responseCount, 'earlier response')}`, tone: 'lifecycle' }
  }

  return { label: 'Needs survey', tone: 'lifecycle' }
}

export function formatSessionFeedbackFooter(visibleSessionCount: number, agendaSessionCount: number, feedbackSessionCount: number) {
  return `Showing ${visibleSessionCount} of ${agendaSessionCount} sessions · ${feedbackSessionCount} ${feedbackSessionCount === 1 ? 'has' : 'have'} feedback, current or earlier`
}

function formatSessionTime(session: SessionRow) {
  if (!session.startsAt) return 'Time not set'
  const start = new Date(session.startsAt)
  const end = session.endsAt ? new Date(session.endsAt) : null
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(session.timezone ? { timeZone: session.timezone } : {}) }
  const startLabel = start.toLocaleString([], options)
  const endLabel = end?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(session.timezone ? { timeZone: session.timezone } : {}) })
  return [startLabel, endLabel].filter(Boolean).join(' – ')
}

function sessionDisplayState(session: SessionRow, minimumEvidenceResponses: number): SessionDisplayState {
  // Current collection coverage is intentionally evaluated before historical
  // findings: insufficient current feedback is not a performance judgment.
  if (session.selectedForListening && session.listeningResponseCount < minimumEvidenceResponses) return 'needs-more-feedback'
  if (session.evidenceState === 'STRONG' && session.findings.length > 0 && session.findings.every((finding) => finding.sentimentLabel === 'negative')) return 'needs-attention'
  if (session.evidenceState === 'STRONG') return 'strong'
  return 'no-clear-conclusion'
}

function sessionStatusPresentation(state: SessionDisplayState) {
  if (state === 'strong') return { label: 'Strong session', badge: 'bg-emerald-50 text-emerald-700', rail: 'bg-emerald-500', evidence: 'Strong evidence', evidenceTone: 'text-emerald-700', dot: 'bg-emerald-500' }
  if (state === 'needs-attention') return { label: 'Needs attention', badge: 'bg-rose-50 text-rose-700', rail: 'bg-rose-500', evidence: 'Strong evidence', evidenceTone: 'text-rose-700', dot: 'bg-rose-500' }
  if (state === 'needs-more-feedback') return { label: 'Needs more feedback', badge: 'bg-amber-50 text-amber-700', rail: 'bg-amber-500', evidence: 'Insufficient evidence', evidenceTone: 'text-amber-700', dot: 'bg-amber-500' }
  return { label: 'No clear conclusion', badge: 'bg-slate-100 text-slate-500', rail: 'bg-slate-300', evidence: 'Directional evidence', evidenceTone: 'text-slate-500', dot: 'bg-slate-300' }
}

function displayFindingLabel(label: string) {
  const labels: Record<string, string> = {
    'Practical session value': 'Practical value',
    'Speaker clarity and engagement': 'Speaker clarity',
    'More Q and A time': 'More Q&A',
    'Session content depth': 'Content depth',
    'Session structure and synthesis': 'Structure & synthesis',
    'Sponsor value': 'Sponsor value',
    'Strong session content': 'Strong content',
  }
  return labels[label] ?? label
}

function sessionInterpretation(session: SessionRow, state: SessionDisplayState) {
  const labels = session.findings.map((finding) => displayFindingLabel(finding.label))
  if (state === 'needs-more-feedback') return `Not a performance problem — too few completed responses to call the session yet.${labels[0] ? ` ${labels[0]} is the early theme.` : ''}`
  if (state === 'needs-attention') return session.relatedIssues[0]?.title || 'Repeated evidence calls for a review decision.'
  if (state === 'no-clear-conclusion') return 'The available responses do not resolve into a clear conclusion yet.'
  if (labels[0] === 'Practical value' && labels[1] === 'Speaker clarity') return 'Attendees consistently cite practical value and speaker clarity; the only ask is more time for questions.'
  if (labels[0] === 'Structure & synthesis') return 'Structure and synthesis carry the room, with sponsor value named unprompted.'
  return labels.length > 0 ? `Attendees consistently point to ${labels.slice(0, 2).join(' and ')}.` : 'Evidence is building for this session.'
}

function matchesView(session: SessionRow, view: SessionView, minimumEvidenceResponses: number) {
  const displayState = sessionDisplayState(session, minimumEvidenceResponses)
  if (view === 'needs-attention') return displayState === 'needs-attention'
  if (view === 'strong') return displayState === 'strong'
  if (view === 'needs-more-feedback') return displayState === 'needs-more-feedback'
  if (view === 'selected') return session.selectedForListening
  if (view === 'represented') return session.represented
  if (view === 'underrepresented') return session.selectedForListening && session.listeningResponseCount > 0 && session.underrepresented
  if (view === 'awaiting-responses') return session.selectedForListening && session.listeningResponseCount === 0
  if (view === 'not-collecting') return !session.selectedForListening && session.responseCount > 0
  if (view === 'needs-survey') return !session.selectedForListening && session.responseCount === 0
  if (view === 'needs-review') return session.reviewIssues.length > 0
  // Keep existing saved URLs working while the visible chips use the clearer split states above.
  if (view === 'not-selected') return !session.selectedForListening
  return true
}

export function EventSessionsIntelligence({ eventId, accountSlug }: { eventId: string; accountSlug: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedView = searchParams.get('sessionView')
  const view: SessionView = VIEWS.some((option) => option.key === requestedView) || PRIMARY_VIEWS.some((option) => option.key === requestedView) || requestedView === 'not-selected' ? requestedView as SessionView : 'all'
  const selectedSessionId = searchParams.get('sessionId')?.trim() || null
  const [data, setData] = useState<EventSessionIntelligenceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedEvidence, setSelectedEvidence] = useState<{ themeKey: string; themeKeys?: string[]; label: string; count: number; sentimentLabel: string | null } | null>(null)
  const [evidenceDetail, setEvidenceDetail] = useState<EventThemeEvidenceResult | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const eventActionData = useEventActionData(eventId, accountSlug)

  const updateQuery = (updates: Record<string, string | null>) => {
    const query = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) value ? query.set(key, value) : query.delete(key)
    query.set('tab', 'intelligence')
    query.set('intelligenceScope', 'sessions')
    router.replace(`/app/events/${encodeURIComponent(eventId)}/dashboard?${query.toString()}`)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/app/events/${encodeURIComponent(eventId)}/sessions/intelligence?account=${encodeURIComponent(accountSlug)}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.success) throw new Error(body.error || 'Failed to load session intelligence')
        if (!cancelled) setData(body.data as EventSessionIntelligenceResult)
      })
      .catch((currentError) => { if (!cancelled) { setError(currentError instanceof Error ? currentError.message : 'Failed to load session intelligence'); setData(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, eventId])

  const selectedSession = data?.sessions.find((session) => session.id === selectedSessionId) ?? null
  const visibleSessions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en-US')
    return (data?.sessions ?? []).filter((session) => matchesView(session, view, data?.minimumEvidenceResponses ?? 0)).filter((session) => !query || [
      session.title, session.room, session.track, session.format,
      ...session.speakers.flatMap((speaker) => [speaker.name, speaker.title, speaker.organization]),
    ].some((value) => value?.toLocaleLowerCase('en-US').includes(query)))
  }, [data, search, view])

  const viewCount = (key: SessionView) => (data?.sessions ?? []).filter((session) => matchesView(session, key, data?.minimumEvidenceResponses ?? 0)).length

  useEffect(() => {
    setSelectedEvidence(null)
    setEvidenceDetail(null)
    setEvidenceError(null)
  }, [selectedSessionId])

  useEffect(() => {
    if (!selectedEvidence || !selectedSession) return
    let cancelled = false
    setEvidenceLoading(true)
    setEvidenceError(null)
    const query = new URLSearchParams({ account: accountSlug, eventStructureItemId: selectedSession.id })
    if ((selectedEvidence.themeKeys?.length ?? 0) > 1) query.set('themeKeys', selectedEvidence.themeKeys!.join(','))
    fetch(`/api/app/events/${encodeURIComponent(eventId)}/themes/${encodeURIComponent(selectedEvidence.themeKey)}/evidence?${query.toString()}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.success) throw new Error(body.error || 'Failed to load session evidence')
        if (!cancelled) setEvidenceDetail(body.data as EventThemeEvidenceResult)
      })
      .catch((currentError) => { if (!cancelled) { setEvidenceError(currentError instanceof Error ? currentError.message : 'Failed to load session evidence'); setEvidenceDetail(null) } })
      .finally(() => { if (!cancelled) setEvidenceLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, eventId, selectedEvidence?.themeKey, selectedEvidence?.themeKeys, selectedSession?.id])

  const openEvidence = (theme: { themeKey: string; themeKeys?: string[]; label: string; count: number; sentimentLabel: string | null }) => {
    if (selectedEvidence?.themeKey === theme.themeKey) {
      setSelectedEvidence(null)
      setEvidenceDetail(null)
      setEvidenceError(null)
      return
    }
    setSelectedEvidence(theme)
  }

  if (loading) return <div data-testid="sessions-intelligence-loading" className="grid gap-4 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl bg-slate-100" />)}</div>
  if (error) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
  if (!data) return null

  const setupLink = (sessionId: string) => `/app/events/${encodeURIComponent(eventId)}?account=${encodeURIComponent(accountSlug)}&tab=operations&sessionId=${encodeURIComponent(sessionId)}`
  const sessionState = (session: SessionRow) => sessionDisplayState(session, data.minimumEvidenceResponses)
  const strongCount = data.sessions.filter((session) => sessionState(session) === 'strong').length
  const needsMoreFeedbackCount = data.sessions.filter((session) => sessionState(session) === 'needs-more-feedback').length
  const totalResponses = data.sessions.reduce((total, session) => total + session.responseCount, 0)

  return (
    <div className="event-sessions-intelligence w-full min-w-0 space-y-3 pt-1" data-testid="signals-sessions-workspace">
      <header className="event-sessions-header grid min-w-0 gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-[22px] font-bold leading-[27px] tracking-[-0.025em] text-slate-950">Sessions</h2>
            <p className="text-[13px] text-slate-500"><span className="font-bold text-slate-700">{data.summary.agendaSessionCount} sessions</span> · {strongCount} strong · {needsMoreFeedbackCount} needs more feedback · <span className="font-bold text-slate-700">{totalResponses} responses</span></p>
          </div>
        </div>
        <p className="max-w-[34rem] text-[12px] leading-5 text-slate-400">Session content is landing — practical value and speaker clarity carry both evaluated sessions. One session has too little feedback to judge yet.</p>
      </header>

      <section className="event-sessions-controls flex min-w-0 flex-col gap-2.5" aria-label="Session intelligence controls">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {PRIMARY_VIEWS.map((option) => <button key={option.key} type="button" aria-pressed={view === option.key} onClick={() => updateQuery({ sessionView: option.key === 'all' ? null : option.key, sessionId: null })} className={`h-9 rounded-[9px] border px-3 text-[12px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${view === option.key ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>{option.label}<span className="ml-1.5 text-[10px] text-current/70">{viewCount(option.key)}</span></button>)}
        </div>
        <div className="event-sessions-search-controls flex min-w-0 gap-1.5">
          <label className="event-sessions-search relative block min-w-0 flex-1"><span className="sr-only">Search sessions, rooms, speakers</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions, rooms, speakers" className="h-9 w-full rounded-[9px] border border-slate-200 bg-white pl-9 pr-3 text-[12px] text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200" /></label>
          <details className="relative shrink-0"><summary className="flex h-9 cursor-pointer list-none items-center rounded-[9px] border border-slate-200 bg-white px-3.5 text-[12px] font-bold text-slate-700 shadow-sm hover:border-violet-300">Filters <span className="ml-1.5 text-[10px] text-slate-400">3 set</span></summary><div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500 shadow-xl">Collection state, evidence thresholds, and missing agenda details remain available here. These controls do not change the performance interpretation.</div></details>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400" aria-label="Session status legend">
        {[
          ['bg-emerald-500', 'Strong'], ['bg-rose-500', 'Needs attention'], ['bg-amber-500', 'Needs more feedback'], ['bg-slate-300', 'No clear conclusion'], ['bg-blue-400', 'Coverage'],
        ].map(([tone, label]) => <span key={label} className="inline-flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${tone}`} />{label}</span>)}
      </div>

      <div className="grid gap-3">
        <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.04)]" aria-label="Agenda sessions">
          {visibleSessions.length === 0 ? <div className="p-8 text-center"><p className="text-sm font-bold text-slate-800">No sessions match this view</p><p className="mt-1 text-xs text-slate-500">Clear the search or choose another coverage state.</p></div> : visibleSessions.map((session) => {
            const displayState = sessionState(session)
            const presentation = sessionStatusPresentation(displayState)
            return (
            <article key={session.id} data-testid="session-intelligence-row" className={`border-b border-slate-100 last:border-b-0 ${selectedSessionId === session.id ? 'bg-violet-50/60' : 'bg-white hover:bg-slate-50/60'}`}>
              <button type="button" aria-pressed={selectedSessionId === session.id} onClick={() => updateQuery({ sessionId: session.id })} className="grid w-full min-w-0 grid-cols-[2px_minmax(0,1fr)_auto_1rem] gap-x-3 px-5 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-300 sm:px-5">
                <span className={`my-0.5 self-stretch rounded-full ${presentation.rail}`} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5"><h4 className="min-w-0 text-[14px] font-bold leading-5 text-slate-950">{session.title}</h4><span className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase leading-4 tracking-[0.12em] ${presentation.badge}`}>{presentation.label}</span></div>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{formatSessionTime(session)} · {session.room || 'Room not set'} · {session.track || session.format || 'Type not set'}{session.speakers.length ? ` · ${session.speakers.map((speaker) => speaker.name).join(', ')}` : ' · no speaker attached'}</p>
                  <p className="mt-1.5 max-w-4xl text-[12px] leading-[18px] text-slate-600">{sessionInterpretation(session, displayState)}</p>
                  {session.findings.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{session.findings.slice(0, 3).map((finding) => <span key={finding.themeKey} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] leading-4 text-slate-500">{displayFindingLabel(finding.label)} <strong className="ml-0.5 font-bold text-slate-700">{finding.mentionCount}</strong></span>)}</div>}
                </div>
                <div data-testid="session-intelligence-row-summary" className="min-w-[6.75rem] pt-0.5 text-right"><div data-testid="session-intelligence-row-response"><p className="text-[18px] font-bold leading-5 text-slate-950">{session.responseCount || '—'}</p><p className="mt-0.5 text-[9px] font-bold uppercase leading-4 tracking-[0.14em] text-slate-400">{session.responseCount === 1 ? 'response' : 'responses'}</p><p className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold leading-4 ${presentation.evidenceTone}`}><span className={`size-1.5 rounded-full ${presentation.dot}`} />{presentation.evidence}</p></div></div>
                <span className="self-center text-xl font-light leading-none text-slate-300" aria-hidden="true">›</span>
              </button>
            </article>
            )
          })}
          <p className="border-t border-slate-100 px-6 py-3 text-[11px] text-slate-400">Showing {visibleSessions.length} of {data.summary.agendaSessionCount} agenda sessions · collection state, thresholds and missing details live in Filters</p>
        </section>

        {selectedSession && (
          <>
          <button type="button" aria-label="Close session detail" onClick={() => updateQuery({ sessionId: null })} className="fixed inset-0 z-40 cursor-default bg-slate-950/35 backdrop-blur-[1px]" />
          <aside className="fixed inset-y-0 right-0 z-50 w-[min(560px,100vw)] overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-[-18px_0_48px_rgba(15,23,42,0.16)]" data-testid="session-intelligence-detail" role="dialog" aria-modal="true" aria-label={`Session detail: ${selectedSession.title}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-violet-700">Session</span><StatusPill label={selectedSession.evidenceLabel} tone={stateClass(selectedSession.state)} /></div><h3 className="mt-3 text-[20px] font-bold leading-7 text-slate-950">{selectedSession.title}</h3><p className="mt-1 text-[11px] text-slate-400">{formatSessionTime(selectedSession)} · {selectedSession.room || 'Room not set'} · {selectedSession.format || selectedSession.track || 'Format not set'}{selectedSession.speakers.length ? ` · ${selectedSession.speakers.map((speaker) => speaker.name).join(', ')}` : ''}</p></div><button type="button" onClick={() => updateQuery({ sessionId: null })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:border-violet-300 hover:text-violet-700">Close</button></div>

              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs sm:grid-cols-3"><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Responses</dt><dd className="mt-1 font-semibold text-slate-700">{selectedSession.responseCount} responses</dd></div><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Evidence</dt><dd className="mt-1 font-semibold text-slate-700">{selectedSession.evidenceLabel}</dd></div><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Who reported it</dt><dd className="mt-1 font-semibold text-slate-700">{selectedSession.responseCount} attendee responses</dd></div><div className="sm:col-span-2"><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">How it was collected</dt><dd className="mt-1 font-semibold text-slate-700">{selectedSession.listening.survey?.name || 'Needs survey'} · {selectedSession.listening.publicLink ? 'link and QR' : 'not deployed'}</dd></div></dl>

            {selectedSession.description && <div className="mt-5"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Session intelligence</p><p className="mt-2 text-[13px] leading-6 text-slate-600">{selectedSession.description}</p></div>}

            <div className="mt-4 border-t border-slate-200 pt-4"><h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Related speakers</h4><div className="mt-2 space-y-2">{selectedSession.speakers.length ? selectedSession.speakers.map((speaker) => <div key={speaker.assignmentId} className="text-sm text-slate-700"><strong>{speaker.name}</strong>{speaker.title || speaker.organization ? <span className="text-slate-500"> · {[speaker.title, speaker.organization].filter(Boolean).join(', ')}</span> : null}<span className="block text-[11px] uppercase tracking-wide text-slate-400">{speaker.role.toLocaleLowerCase()}</span></div>) : <p className="text-xs text-slate-500">No speakers are assigned in Setup.</p>}</div></div>

            <div className="mt-4 border-t border-slate-200 pt-4"><h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Session survey</h4>{selectedSession.listening.survey ? <div className="mt-2"><p className="text-sm font-bold text-slate-900">{selectedSession.listening.survey.name}</p><p className="mt-1 text-xs text-slate-500">{selectedSession.listeningResponseCount} completed survey responses</p></div> : <p className="mt-2 text-xs leading-5 text-slate-500">Feedback is not set up for this session. Attach a survey when you want to collect feedback.</p>}<div className="mt-3 flex flex-wrap gap-3 text-xs font-bold"><a href={setupLink(selectedSession.id)} className="text-indigo-700 hover:underline">Open in Setup</a>{selectedSession.listening.survey && <a href={`/app/events/${encodeURIComponent(eventId)}/edit?account=${encodeURIComponent(accountSlug)}&survey=${encodeURIComponent(selectedSession.listening.survey.id)}`}>Open survey</a>}</div></div>

            <div className="mt-4 border-t border-slate-200 pt-4"><h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Evidence-backed findings</h4>{selectedSession.hasEnoughEvidence ? selectedSession.findings.length ? <div className="mt-2 space-y-2">{selectedSession.findings.map((finding) => {
              const actionReference = resolveEventActionSource(
                { actions: eventActionData.actions, availableFindings: eventActionData.availableFindings },
                { title: finding.label, themeKeys: finding.themeKeys ?? [finding.themeKey], evidenceLabel: 'Evidence →' },
              )
              return <EventActionableItem key={finding.themeKey} eventId={eventId} accountSlug={accountSlug} owners={eventActionData.owners} source={actionReference.source} actioned={actionReference.actioned} className="rounded-lg">
                <button type="button" aria-pressed={selectedEvidence?.themeKey === finding.themeKey} onClick={() => openEvidence({ themeKey: finding.themeKey, themeKeys: finding.themeKeys, label: finding.label, count: finding.mentionCount, sentimentLabel: finding.sentimentLabel })} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${selectedEvidence?.themeKey === finding.themeKey ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}><p className="text-sm font-bold text-slate-900">{finding.label}</p><p className="mt-1 text-xs text-slate-500">{finding.responseCount} analyzed responses · {finding.mentionCount} mentions · View evidence</p></button>
              </EventActionableItem>
            })}</div> : <p className="mt-2 text-xs text-slate-500">Analyzed responses are present, but no normalized findings are available yet.</p> : <p className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">{selectedSession.evidenceLabel}. Findings use analyzed supporting responses; {selectedSession.evidence.analyzedEligibleResponseCount} of {selectedSession.evidence.completedEligibleResponseCount} eligible responses are analyzed.</p>}</div>

            {(selectedSession.learning.length > 0 || selectedSession.relatedIssues.length > 0) && <div className="mt-4 border-t border-slate-200 pt-4"><h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Actions and learning</h4><div className="mt-2 space-y-2">{selectedSession.learning.map((item) => <div key={item.title} className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-indigo-600">{item.horizon.replaceAll('_', ' ')}</p><p className="mt-1 text-sm font-bold text-slate-900">{item.title}</p>{item.evidenceThemeKey && <button type="button" onClick={() => openEvidence({ themeKey: item.evidenceThemeKey!, themeKeys: item.evidenceThemeKeys, label: item.title, count: item.mentionCount, sentimentLabel: null })} className="mt-1 text-xs font-bold text-indigo-700 hover:underline">View supporting evidence</button>}</div>)}{selectedSession.relatedIssues.map((issue) => <a key={issue.id} href={`/app/events/${encodeURIComponent(eventId)}/dashboard?account=${encodeURIComponent(accountSlug)}&tab=intelligence&eventStructureItemId=${encodeURIComponent(selectedSession.id)}`} className="block rounded-lg bg-slate-50 p-3 hover:bg-slate-100"><p className="text-[10px] font-bold uppercase text-rose-600">{issue.priorityLevel} · {issue.status.toLowerCase()}</p><p className="mt-1 text-sm font-bold text-slate-900">{issue.title}</p><p className="mt-1 text-xs font-bold text-indigo-700">View operational context</p></a>)}</div></div>}

            {selectedSession.reviewIssues.length > 0 && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black text-amber-900">Session details to complete</p><ul className="mt-1 list-disc pl-4 text-xs leading-5 text-amber-800">{selectedSession.reviewIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
            <EventEvidenceDrawer open={Boolean(selectedEvidence)} title={selectedEvidence?.label ?? 'Session evidence'} eyebrow="Session · supporting evidence" onClose={() => { setSelectedEvidence(null); setEvidenceDetail(null); setEvidenceError(null) }}>
              <EventThemeEvidencePanel loading={evidenceLoading} error={evidenceError} detail={evidenceDetail} fallbackTheme={selectedEvidence} heading="Supporting responses" onClear={() => { setSelectedEvidence(null); setEvidenceDetail(null); setEvidenceError(null) }} />
            </EventEvidenceDrawer>
          </aside>
          </>
        )}
      </div>
    </div>
  )
}
