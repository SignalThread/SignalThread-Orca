'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EventThemeEvidencePanel } from '@/components/events/EventThemeEvidencePanel'
import { EventEvidenceDrawer } from '@/components/events/EventEvidenceDrawer'
import { StatusPill, type StatusPillTone } from '@/components/ui/StatusPill'
import type { EventSpeakerIntelligenceResult } from '@/lib/event-speaker-intelligence'
import type { EventThemeEvidenceResult } from '@/lib/event-intelligence/theme-evidence'

type SpeakerRow = EventSpeakerIntelligenceResult['speakers'][number]
type SpeakerView = 'all' | 'strong' | 'needs-attention' | 'needs-more-feedback' | 'directional' | 'not-enough' | 'not-collected'
type SpeakerDisplayState = 'strong' | 'needs-attention' | 'needs-more-feedback' | 'no-clear-conclusion'

const PRIMARY_VIEWS: Array<{ key: Extract<SpeakerView, 'all' | 'needs-attention' | 'strong' | 'needs-more-feedback'>; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'needs-attention', label: 'Needs attention' },
  { key: 'strong', label: 'Strong' },
  { key: 'needs-more-feedback', label: 'Needs more feedback' },
]

const OPERATIONAL_VIEWS: Array<{ key: Extract<SpeakerView, 'directional' | 'not-enough' | 'not-collected'>; label: string }> = [
  { key: 'directional', label: 'Directional evidence' },
  { key: 'not-enough', label: 'Insufficient feedback' },
  { key: 'not-collected', label: 'No speaker question' },
]

function formatSessionTime(session: SpeakerRow['sessions'][number]) {
  if (!session.startsAt) return 'Time not set'
  return new Date(session.startsAt).toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(session.timezone ? { timeZone: session.timezone } : {}),
  })
}

function evidenceTone(state: SpeakerRow['evidenceState']): StatusPillTone {
  if (state === 'STRONG') return 'healthy'
  if (state === 'DIRECTIONAL') return 'attention'
  return 'lifecycle'
}

function speakerDisplayState(speaker: SpeakerRow): SpeakerDisplayState {
  if (speaker.evidenceState === 'NOT_ENOUGH') return 'needs-more-feedback'
  if (speaker.evidenceState === 'STRONG' && speaker.findings.some((finding) => finding.sentimentLabel === 'NEGATIVE')) return 'needs-attention'
  if (speaker.evidenceState === 'STRONG') return 'strong'
  return 'no-clear-conclusion'
}

function matchesSpeakerView(speaker: SpeakerRow, view: SpeakerView) {
  const displayState = speakerDisplayState(speaker)
  if (view === 'needs-attention') return displayState === 'needs-attention'
  if (view === 'needs-more-feedback') return displayState === 'needs-more-feedback'
  if (view === 'strong') return displayState === 'strong'
  if (view === 'directional') return speaker.evidenceState === 'DIRECTIONAL'
  if (view === 'not-enough') return speaker.evidenceState === 'NOT_ENOUGH'
  if (view === 'not-collected') return speaker.evidenceState === 'NONE'
  return true
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('en-US')).join('') || '—'
}

function speakerStatusPresentation(speaker: SpeakerRow) {
  const state = speakerDisplayState(speaker)
  if (state === 'strong') return { label: 'Strong', rail: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', avatar: 'bg-slate-100 text-slate-500', evidence: 'Strong evidence', evidenceTone: 'text-emerald-700', dot: 'bg-emerald-500' }
  if (state === 'needs-attention') return { label: 'Needs attention', rail: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700', avatar: 'bg-slate-100 text-slate-500', evidence: 'Strong evidence', evidenceTone: 'text-rose-700', dot: 'bg-rose-500' }
  if (state === 'needs-more-feedback') return { label: 'Needs more feedback', rail: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700', avatar: 'bg-slate-100 text-slate-500', evidence: 'Insufficient evidence', evidenceTone: 'text-amber-700', dot: 'bg-amber-500' }
  return { label: 'No clear conclusion', rail: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500', avatar: 'bg-slate-100 text-slate-500', evidence: speaker.evidenceState === 'NONE' ? 'No speaker question' : 'Directional evidence', evidenceTone: 'text-slate-500', dot: 'bg-slate-300' }
}

function speakerSessionContext(speaker: SpeakerRow) {
  if (speaker.sessions.length === 0) return 'No assigned sessions'
  const sessionNames = speaker.sessions.slice(0, 2).map((session) => session.title).join(' · ')
  const remaining = speaker.sessions.length > 2 ? ` +${speaker.sessions.length - 2}` : ''
  return `${sessionNames}${remaining} — ${speaker.sessions.length} session${speaker.sessions.length === 1 ? '' : 's'}`
}

function speakerInterpretation(speaker: SpeakerRow, state: SpeakerDisplayState) {
  const praised = speaker.findings.filter((finding) => finding.sentimentLabel === 'POSITIVE').map((finding) => finding.label.toLocaleLowerCase('en-US'))
  const coaching = speaker.findings.filter((finding) => finding.sentimentLabel === 'NEGATIVE').map((finding) => finding.label.toLocaleLowerCase('en-US'))
  if (state === 'needs-more-feedback') return 'Too few completed speaker-specific responses to call the speaker yet.'
  if (state === 'needs-attention') return `Speaker-specific feedback recognizes ${praised[0] ?? 'their expertise'} while asking for clearer follow-through on ${coaching.slice(0, 2).join(' and ') || 'the recurring coaching themes'}.`
  if (state === 'strong') return `Attendees consistently describe ${praised.slice(0, 2).join(' and ') || 'this speaker'} positively in speaker-specific feedback.`
  return speaker.findings.length ? `The available speaker-specific feedback is directional, centered on ${speaker.findings.slice(0, 2).map((finding) => finding.label.toLocaleLowerCase('en-US')).join(' and ')}.` : 'The available speaker-specific responses do not resolve into a clear conclusion yet.'
}

function sentimentLabel(value: string | null) {
  if (!value) return 'Observed'
  return value.replaceAll('_', ' ').toLocaleLowerCase('en-US').replace(/^./, (letter) => letter.toLocaleUpperCase('en-US'))
}

export function EventSpeakersIntelligence({ eventId, accountSlug }: { eventId: string; accountSlug: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedSpeakerId = searchParams.get('speakerId')?.trim() || null
  const requestedView = searchParams.get('speakerView')
  const view: SpeakerView = [...PRIMARY_VIEWS, ...OPERATIONAL_VIEWS].some((option) => option.key === requestedView) ? requestedView as SpeakerView : 'all'
  const [data, setData] = useState<EventSpeakerIntelligenceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedEvidence, setSelectedEvidence] = useState<{ themeKey: string; themeKeys?: string[]; label: string; count: number; sentimentLabel: string | null } | null>(null)
  const [evidenceDetail, setEvidenceDetail] = useState<EventThemeEvidenceResult | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const updateQuery = (updates: { speakerId?: string | null; speakerView?: SpeakerView | null }) => {
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', 'intelligence')
    query.set('intelligenceScope', 'speakers')
    if ('speakerId' in updates) updates.speakerId ? query.set('speakerId', updates.speakerId) : query.delete('speakerId')
    if ('speakerView' in updates) updates.speakerView ? query.set('speakerView', updates.speakerView) : query.delete('speakerView')
    query.delete('sessionId')
    router.replace(`/app/events/${encodeURIComponent(eventId)}/dashboard?${query.toString()}`)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/app/events/${encodeURIComponent(eventId)}/speakers/intelligence?account=${encodeURIComponent(accountSlug)}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.success) throw new Error(body.error || 'Failed to load speaker intelligence')
        if (!cancelled) setData(body.data as EventSpeakerIntelligenceResult)
      })
      .catch((currentError) => { if (!cancelled) { setError(currentError instanceof Error ? currentError.message : 'Failed to load speaker intelligence'); setData(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, eventId, retryKey])

  const selectedSpeaker = data?.speakers.find((speaker) => speaker.id === selectedSpeakerId) ?? null
  const visibleSpeakers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en-US')
    return (data?.speakers ?? []).filter((speaker) => matchesSpeakerView(speaker, view)).filter((speaker) => !query || [
      speaker.name, speaker.title, speaker.organization, ...speaker.sessions.map((session) => session.title),
    ].some((value) => value?.toLocaleLowerCase('en-US').includes(query)))
  }, [data, search, view])

  useEffect(() => {
    setSelectedEvidence(null)
    setEvidenceDetail(null)
    setEvidenceError(null)
  }, [selectedSpeakerId])

  useEffect(() => {
    if (!selectedEvidence || !selectedSpeaker) return
    let cancelled = false
    setEvidenceLoading(true)
    setEvidenceError(null)
    const query = new URLSearchParams({ account: accountSlug, speakerId: selectedSpeaker.id })
    if ((selectedEvidence.themeKeys?.length ?? 0) > 1) query.set('themeKeys', selectedEvidence.themeKeys!.join(','))
    fetch(`/api/app/events/${encodeURIComponent(eventId)}/themes/${encodeURIComponent(selectedEvidence.themeKey)}/evidence?${query.toString()}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.success) throw new Error(body.error || 'Failed to load speaker evidence')
        if (!cancelled) setEvidenceDetail(body.data as EventThemeEvidenceResult)
      })
      .catch((currentError) => { if (!cancelled) { setEvidenceError(currentError instanceof Error ? currentError.message : 'Failed to load speaker evidence'); setEvidenceDetail(null) } })
      .finally(() => { if (!cancelled) setEvidenceLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, eventId, selectedEvidence?.themeKey, selectedEvidence?.themeKeys, selectedSpeaker?.id])

  const openEvidence = (finding: SpeakerRow['findings'][number]) => {
    if (selectedEvidence?.themeKey === finding.themeKey) {
      setSelectedEvidence(null)
      setEvidenceDetail(null)
      setEvidenceError(null)
      return
    }
    setSelectedEvidence({ themeKey: finding.themeKey, themeKeys: finding.themeKeys, label: finding.label, count: finding.mentionCount, sentimentLabel: finding.sentimentLabel })
  }

  if (loading) return <div data-testid="speakers-intelligence-loading" className="grid gap-4 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl bg-slate-100" />)}</div>
  if (error) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p>{error}</p><button type="button" onClick={() => setRetryKey((current) => current + 1)} className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900">Retry</button></div>
  if (!data) return null

  const setupLink = (speakerId: string) => `/app/events/${encodeURIComponent(eventId)}?account=${encodeURIComponent(accountSlug)}&tab=operations&operationsView=speakers&speakerId=${encodeURIComponent(speakerId)}`
  const sessionLink = (sessionId: string) => {
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', 'intelligence')
    query.set('intelligenceScope', 'sessions')
    query.set('sessionId', sessionId)
    query.delete('speakerId')
    query.delete('speakerView')
    return `/app/events/${encodeURIComponent(eventId)}/dashboard?${query.toString()}`
  }
  const countForView = (key: SpeakerView) => data.speakers.filter((speaker) => matchesSpeakerView(speaker, key)).length
  const strongCount = countForView('strong')
  const needsAttentionCount = countForView('needs-attention')
  const needsMoreFeedbackCount = countForView('needs-more-feedback')

  return (
    <div className="event-speakers-intelligence w-full min-w-0 space-y-3 pt-1 text-slate-950" data-testid="signals-speakers-workspace">
      <header className="event-speakers-header grid min-w-0 gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-4 gap-y-1"><h2 className="text-[22px] font-bold leading-[27px] tracking-[-0.025em]">Speakers</h2><p className="text-[13px] text-slate-500"><span className="font-bold text-slate-700">{data.summary.speakerCount} speakers</span> · {strongCount} strong · {needsAttentionCount} need attention · {needsMoreFeedbackCount} need more feedback</p></div></div>
        <p className="max-w-[34rem] text-[12px] leading-5 text-slate-400">Speaker-specific feedback shows where delivery is landing and where attendees need a clearer pace, emphasis, or audience fit.</p>
      </header>

      <section className="event-speakers-controls flex min-w-0 flex-col gap-2.5" aria-label="Speaker intelligence controls">
        <div className="flex min-w-0 flex-wrap gap-1.5">{PRIMARY_VIEWS.map((option) => <button key={option.key} type="button" aria-pressed={view === option.key} onClick={() => updateQuery({ speakerView: option.key === 'all' ? null : option.key, speakerId: null })} className={`h-9 rounded-[9px] border px-3 text-[12px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${view === option.key ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>{option.label}<span className="ml-1.5 text-[10px] text-current/70">{countForView(option.key)}</span></button>)}</div>
        <div className="event-speakers-search-controls flex min-w-0 gap-1.5"><label className="relative block min-w-0 flex-1"><span className="sr-only">Search speakers or sessions</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search speakers or sessions" className="h-9 w-full rounded-[9px] border border-slate-200 bg-white pl-9 pr-3 text-[12px] shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200" /></label><details className="relative shrink-0"><summary className="flex h-9 cursor-pointer list-none items-center rounded-[9px] border border-slate-200 bg-white px-3.5 text-[12px] font-bold text-slate-700 shadow-sm">Filters</summary><div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 shadow-xl"><p>Operational evidence states stay separate from performance interpretation.</p><div className="mt-2 grid gap-1">{OPERATIONAL_VIEWS.map((option) => <button key={option.key} type="button" onClick={() => updateQuery({ speakerView: option.key, speakerId: null })} className="rounded-md px-2 py-1.5 text-left font-semibold text-slate-700 hover:bg-slate-50">{option.label} <span className="text-slate-400">{countForView(option.key)}</span></button>)}</div></div></details></div>
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400" aria-label="Speaker status legend">{[['bg-emerald-500', 'Strong'], ['bg-rose-500', 'Needs attention'], ['bg-amber-500', 'Needs more feedback'], ['bg-slate-300', 'No clear conclusion'], ['bg-blue-400', 'Coverage']].map(([tone, label]) => <span key={label} className="inline-flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${tone}`} />{label}</span>)}</div>

      <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.04)]" aria-label="Assigned speakers">
        {visibleSpeakers.length === 0 ? <div className="p-8 text-center"><p className="text-sm font-bold text-slate-800">No assigned speakers match this view</p><p className="mt-1 text-xs text-slate-500">Clear the search, choose another evidence state, or review assignments in Setup.</p></div> : visibleSpeakers.map((speaker) => (
          <article key={speaker.id} className={`border-b border-slate-100 last:border-b-0 ${selectedSpeakerId === speaker.id ? 'bg-slate-50/80' : 'bg-white hover:bg-slate-50/60'}`}>
            {(() => {
              const presentation = speakerStatusPresentation(speaker)
              const praised = speaker.findings.filter((finding) => finding.sentimentLabel === 'POSITIVE')
              const coaching = speaker.findings.filter((finding) => finding.sentimentLabel === 'NEGATIVE')
              return <button type="button" aria-pressed={selectedSpeakerId === speaker.id} onClick={() => updateQuery({ speakerId: speaker.id })} className="event-speaker-row-button grid w-full min-w-0 grid-cols-[2px_2rem_minmax(0,1fr)_auto_1rem] gap-x-3 px-5 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-300">
                <span className={`my-0.5 self-stretch rounded-full ${presentation.rail}`} aria-hidden="true" />
                <span className={`mt-0.5 flex size-8 items-center justify-center rounded-[10px] text-[10px] font-bold ${presentation.avatar}`}>{initials(speaker.name)}</span>
                <span className="min-w-0"><span className="flex flex-wrap items-center gap-1.5"><span className="text-[14px] font-bold leading-5 text-slate-950">{speaker.name}</span><span className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase leading-4 tracking-[0.12em] ${presentation.badge}`}>{presentation.label}</span></span><span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{speakerSessionContext(speaker)}</span><span className="mt-1.5 block max-w-4xl text-[12px] leading-[18px] text-slate-600">{speakerInterpretation(speaker, speakerDisplayState(speaker))}</span>{(praised.length > 0 || coaching.length > 0) && <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">{praised.length > 0 && <span className="inline-flex flex-wrap items-center gap-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700/55">Praised for</span>{praised.slice(0, 2).map((finding) => <span key={finding.themeKey} className="rounded-full border border-emerald-100 bg-emerald-50/60 px-2.5 py-0.5 text-[10px] leading-4 text-emerald-900/75">{finding.label} <strong className="ml-0.5 font-bold text-emerald-900">{finding.mentionCount}</strong></span>)}</span>}{coaching.length > 0 && <span className="inline-flex flex-wrap items-center gap-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-700/60">Coaching</span>{coaching.slice(0, 2).map((finding) => <span key={finding.themeKey} className="rounded-full border border-amber-200 bg-amber-50/60 px-2.5 py-0.5 text-[10px] leading-4 text-amber-900/75">{finding.label} <strong className="ml-0.5 font-bold text-amber-900">{finding.mentionCount}</strong></span>)}</span>}</span>}</span>
                <span data-testid="speaker-intelligence-row-summary" className="min-w-[7.25rem] pt-0.5 text-right"><span data-testid="speaker-intelligence-row-response"><span className="block text-[18px] font-bold leading-5 text-slate-950">{speaker.responseCount || '—'}</span><span className="mt-0.5 block text-[9px] font-bold uppercase leading-4 tracking-[0.14em] text-slate-400">Speaker responses</span><span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold leading-4 ${presentation.evidenceTone}`}><span className={`size-1.5 rounded-full ${presentation.dot}`} />{presentation.evidence}</span></span></span>
                <span className="self-center text-xl font-light leading-none text-slate-300" aria-hidden="true">›</span>
              </button>
            })()}
          </article>
        ))}
      </section>

      {selectedSpeaker && <><button type="button" aria-label="Close speaker detail" onClick={() => updateQuery({ speakerId: null })} className="!m-0 fixed inset-0 z-40 cursor-default bg-slate-950/35 backdrop-blur-[1px]" /><aside className="!m-0 fixed inset-y-0 right-0 z-50 w-[min(560px,100vw)] overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-[-18px_0_48px_rgba(15,23,42,0.16)]" data-testid="speaker-intelligence-detail" role="dialog" aria-modal="true" aria-label={`Speaker detail: ${selectedSpeaker.name}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-indigo-700">Speaker</span><StatusPill label={selectedSpeaker.evidenceLabel} tone={evidenceTone(selectedSpeaker.evidenceState)} /></div><h3 className="mt-3 text-[20px] font-bold text-slate-950">{selectedSpeaker.name}</h3><p className="mt-1 text-[11px] text-slate-400">{selectedSpeaker.sessions.length} sessions · {selectedSpeaker.responseCount} speaker-specific responses{selectedSpeaker.confidence !== null ? ` · ${Math.round(selectedSpeaker.confidence * 100)}% evidence confidence` : ''}</p></div><button type="button" aria-label="Close" onClick={() => updateQuery({ speakerId: null })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">×</button></div>

        <dl className="mt-6 grid grid-cols-3 gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Sessions</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{selectedSpeaker.sessions.length}</dd></div><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Responses</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{selectedSpeaker.responseCount} speaker-specific</dd></div><div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Evidence</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{selectedSpeaker.evidenceLabel}</dd></div></dl>

        <div className="mt-5"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">What the feedback suggests</p><p className="mt-2 text-[13px] leading-6 text-slate-600">{selectedSpeaker.findings.length ? `Speaker-specific evidence centers on ${selectedSpeaker.findings.map((finding) => finding.label.toLocaleLowerCase('en-US')).join(', ')}.` : selectedSpeaker.evidenceLabel}</p></div>

        <div className="mt-5 rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-900">Performance dimensions</p><p className="text-[10px] text-slate-400">{selectedSpeaker.responseCount} responses</p></div>{selectedSpeaker.findings.length ? <div className="mt-3 space-y-2">{selectedSpeaker.findings.map((finding) => <button key={finding.themeKey} type="button" aria-pressed={selectedEvidence?.themeKey === finding.themeKey} onClick={() => openEvidence(finding)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3 text-left ${selectedEvidence?.themeKey === finding.themeKey ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}><span><span className="block text-xs font-semibold text-slate-700">{finding.label}</span><span className="mt-1 block text-[10px] text-slate-400">{finding.responseCount} analyzed responses · {finding.mentionCount} mentions · View evidence</span></span><span className="text-[10px] font-bold text-slate-500">{sentimentLabel(finding.sentimentLabel)}</span></button>)}</div> : <p className="mt-3 text-xs leading-5 text-slate-500">{selectedSpeaker.evidenceLabel}{selectedSpeaker.responseCount > 0 ? `. Findings use analyzed supporting responses; ${selectedSpeaker.evidence.analyzedEligibleResponseCount} of ${selectedSpeaker.evidence.completedEligibleResponseCount} eligible responses are analyzed.` : '.'}</p>}</div>

        <EventEvidenceDrawer open={Boolean(selectedEvidence)} title={selectedEvidence?.label ?? 'Speaker evidence'} eyebrow="Speaker · supporting evidence" onClose={() => { setSelectedEvidence(null); setEvidenceDetail(null); setEvidenceError(null) }}>
          <EventThemeEvidencePanel loading={evidenceLoading} error={evidenceError} detail={evidenceDetail} fallbackTheme={selectedEvidence} heading="Supporting responses" onClear={() => { setSelectedEvidence(null); setEvidenceDetail(null); setEvidenceError(null) }} />
        </EventEvidenceDrawer>

        <div className="mt-5"><div className="flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Sessions delivered</p><a href={setupLink(selectedSpeaker.id)} className="text-[10px] font-bold text-indigo-700 hover:underline">Open in Setup</a></div><div className="mt-2 space-y-2">{selectedSpeaker.sessions.map((session) => <a key={session.assignmentId} href={sessionLink(session.id)} className="block rounded-xl border border-slate-200 p-3 hover:border-indigo-200"><span className="text-[9px] font-bold uppercase tracking-[0.1em] text-indigo-700">Session</span><span className="mt-1 block text-xs font-bold text-slate-900">{session.title}</span><span className="mt-1 block text-[10px] text-slate-400">{formatSessionTime(session)} · {session.role.toLocaleLowerCase()}</span></a>)}</div></div>
      </aside></>}
    </div>
  )
}
