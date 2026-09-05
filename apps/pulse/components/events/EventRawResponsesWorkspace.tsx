'use client'

import { useEffect, useMemo, useState } from 'react'
import { TruncatedTableText } from './TruncatedTableText'
import { EventDateRangePicker } from './EventDateRangePicker'

type EvidenceScope = 'event-areas' | 'sessions' | 'speakers'
type StructureOption = { id: string; kind: string; name: string }
type SurveyOption = { id: string; name: string }

type Row = {
  id: string; responseId: string; createdAt: string; answerType: 'TEXT' | 'STRUCTURED'; answerDisplay: string; numericValue: number | null; transcriptExcerpt: string; sentiment: string | null
  source: { id: string; name: string; category: string; session: { id: string; name: string; kind: string } | null; speaker: { id: string; name: string } | null } | null
  question: { id: string | null; label: string }; themes: Array<{ themeKey: string; label: string }>
}
type Detail = {
  id: string; responseId: string; createdAt: string; answerType: 'TEXT' | 'STRUCTURED'; answerDisplay: string; numericValue: number | null; transcript: string | null; durationMs: number | null
  question: { id: string | null; key: string | null; label: string }
  analysis: { summary: string; sentiment: string | null; sentimentScore: number | null } | null
  themes: Array<{ themeKey: string; label: string }>
  linkedFindings: Array<{ taxonomyKey: string | null; urgency: string; recommendedAction: string | null; actions: Array<{ id: string; title: string; description: string | null; actionWindow: string | null }> }>
  context: { survey: { id: string; name: string } | null; target: { id: string; name: string; category: string; session: { id: string; name: string; kind: string } | null; speaker: { id: string; name: string } | null } | null; startedAt: string | null; completedAt: string | null }
  responseAnswers: Array<{ id: string; question: string; answerType: 'TEXT' | 'STRUCTURED'; answerDisplay: string; transcriptExcerpt: string; selected: boolean }>
}
type Payload = { items: Row[]; filters: { surveyTargets: Array<{ id: string; name: string }>; questions: Array<{ id: string; label: string }> }; pagination: { page: number; pageSize: number; total: number; totalPages: number; from: number; to: number } }

function dateLabel(value: string) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function sentimentTone(value: string | null) {
  const normalized = value?.toUpperCase()
  return normalized === 'POSITIVE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : normalized === 'NEGATIVE' ? 'bg-rose-50 text-rose-700 ring-rose-200' : normalized === 'MIXED' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
}
function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'teal' }) {
  return <span className={`inline-flex max-w-full truncate rounded-md px-2 py-1 text-[10px] font-bold ring-1 ${tone === 'teal' ? 'bg-teal-50 text-teal-700 ring-teal-100' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{children}</span>
}

export function EventRawResponsesWorkspace({ eventId, accountSlug, eventStructureItemId, structureKind, surveyId, surveyOptions = [], onSurveyChange, scope = 'event-areas', onScopeChange, structureScopeValue = 'all', onStructureScopeChange, structureOptions = [] }: {
  eventId: string
  accountSlug: string
  eventStructureItemId?: string | null
  structureKind?: string | null
  surveyId?: string | null
  surveyOptions?: SurveyOption[]
  onSurveyChange?: (surveyId: string | null) => void
  scope?: EvidenceScope
  onScopeChange?: (scope: EvidenceScope) => void
  structureScopeValue?: string
  onStructureScopeChange?: (value: string) => void
  structureOptions?: StructureOption[]
}) {
  const [data, setData] = useState<Payload | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [targetId, setTargetId] = useState('')
  const [questionId, setQuestionId] = useState('')
  const [sentiment, setSentiment] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const query = useMemo(() => {
    const params = new URLSearchParams({ account: accountSlug, page: String(page), pageSize: '25' })
    if (surveyId) params.set('surveyId', surveyId)
    if (search) params.set('search', search)
    if (targetId) params.set('surveyTargetId', targetId)
    if (eventStructureItemId) params.set('eventStructureItemId', eventStructureItemId)
    else if (structureKind) params.set('structureKind', structureKind)
    if (questionId) params.set('questionId', questionId)
    if (sentiment) params.set('sentiment', sentiment)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    return params
  }, [accountSlug, dateFrom, dateTo, eventStructureItemId, page, questionId, search, sentiment, structureKind, surveyId, targetId])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    fetch(`/api/app/events/${encodeURIComponent(eventId)}/raw-responses?${query}`)
      .then(async (response) => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load answers'); return body.data as Payload })
      .then((next) => { if (!cancelled) setData(next) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load answers') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [eventId, query])

  const openAnswer = async (answerId: string) => {
    setDetailLoading(true)
    try {
      const response = await fetch(`/api/app/events/${encodeURIComponent(eventId)}/raw-responses/${encodeURIComponent(answerId)}?account=${encodeURIComponent(accountSlug)}`)
      const body = await response.json()
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load answer')
      setDetail(body.data as Detail)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load answer') } finally { setDetailLoading(false) }
  }
  const applySearch = () => { setPage(1); setSearch(searchDraft.trim()) }
  const updateFilter = (set: (value: string) => void) => (value: string) => { setPage(1); set(value) }
  const clearFilters = () => { setSearchDraft(''); setSearch(''); setTargetId(''); setQuestionId(''); setSentiment(''); setDateFrom(''); setDateTo(''); setPage(1) }
  const contextualOptions = structureOptions.filter((item) => scope === 'sessions' ? item.kind === 'SESSION' : scope === 'speakers' ? item.kind === 'SESSION' : item.kind !== 'SESSION')
  const contextualLabel = scope === 'sessions' ? 'Session' : scope === 'speakers' ? 'Speaker / session' : 'Event area'

  return <section data-testid="raw-responses-workspace" className="mx-auto max-w-[1176px] space-y-5 pt-1.5 text-slate-950">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-[18px] font-semibold tracking-[-0.015em]">Browse evidence</h2><p className="mt-1 text-[12px] text-slate-500">Read the exact attendee evidence behind the event’s findings.</p></div>
      {data && <p className="text-[12px] font-semibold text-slate-500">{data.pagination.total.toLocaleString()} answer{data.pagination.total === 1 ? '' : 's'}</p>}
    </header>
    <div data-testid="raw-response-filters" className="rounded-[14px] border border-slate-200 bg-white p-2.5 shadow-[0_3px_12px_rgba(15,23,42,0.04)] sm:p-3">
      <div data-testid="raw-response-filter-categories" className="grid gap-2 md:grid-cols-3 xl:grid-cols-[minmax(215px,1.2fr)_minmax(135px,.75fr)_minmax(180px,1fr)_minmax(150px,.9fr)_minmax(140px,.8fr)]">
        <div className="grid h-9 grid-cols-3 overflow-hidden rounded-[9px] border border-slate-200 bg-slate-50"><span className="sr-only">Scope</span>{([['event-areas', 'Event Areas'], ['sessions', 'Sessions'], ['speakers', 'Speakers']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => onScopeChange?.(value)} className={`min-w-0 truncate px-2 text-[11px] font-bold transition ${scope === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>{label}</button>)}</div>
        <label className="relative min-w-0"><span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Survey</span><select aria-label="Survey" value={surveyId ?? ''} onChange={(event) => onSurveyChange?.(event.target.value || null)} className="h-9 w-full appearance-none rounded-[9px] border border-slate-200 bg-white py-0 pl-[3.9rem] pr-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="">All surveys</option>{surveyOptions.map((survey) => <option key={survey.id} value={survey.id}>{survey.name}</option>)}</select></label>
        {scope === 'speakers' ? <select aria-label="Speaker" value={targetId} onChange={(event) => updateFilter(setTargetId)(event.target.value)} className="h-9 min-w-0 rounded-[9px] border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="">All speakers</option>{data?.filters.surveyTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select> : <select aria-label={contextualLabel} value={structureScopeValue} onChange={(event) => onStructureScopeChange?.(event.target.value)} className="h-9 min-w-0 rounded-[9px] border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="all">All {contextualLabel.toLowerCase()}s</option>{contextualOptions.map((item) => <option key={item.id} value={`item:${item.id}`}>{item.name}</option>)}</select>}
        <select aria-label="Question" value={questionId} onChange={(event) => updateFilter(setQuestionId)(event.target.value)} className="h-9 min-w-0 rounded-[9px] border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="">All questions</option>{data?.filters.questions.map((question) => <option key={question.id} value={question.id}>{question.label}</option>)}</select>
        <select aria-label="Sentiment" value={sentiment} onChange={(event) => updateFilter(setSentiment)(event.target.value)} className="h-9 min-w-0 rounded-[9px] border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="">All sentiment</option><option value="POSITIVE">Positive</option><option value="MIXED">Mixed</option><option value="NEGATIVE">Negative</option><option value="NEUTRAL">Neutral</option></select>
      </div>
      <div className="mt-2 grid gap-2 border-t border-slate-100 pt-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex min-w-0"><input aria-label="Search transcripts" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="Search evidence…" className="h-9 min-w-0 flex-1 rounded-l-[9px] border border-slate-200 bg-white px-3 text-[12px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /><button type="button" onClick={applySearch} className="h-9 rounded-r-[9px] border border-l-0 border-slate-200 bg-slate-50 px-3 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Search</button></div>
        <div data-testid="raw-response-date-range"><EventDateRangePicker from={dateFrom} to={dateTo} onChange={({ from, to }) => { setPage(1); setDateFrom(from); setDateTo(to) }} /></div>
        <button type="button" onClick={clearFilters} className="h-9 rounded-[9px] border border-slate-200 bg-white px-3 text-[11px] font-bold text-indigo-700 transition hover:border-indigo-200 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Clear filters</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_6px_22px_rgba(15,23,42,0.04)]">
      <div className="hidden grid-cols-[110px_150px_170px_minmax(240px,1fr)_110px_160px_36px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Time</span><span>Source</span><span>Question</span><span>Answer</span><span>Sentiment</span><span>Themes</span><span /></div>
      {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading attendee evidence…</p> : data?.items.length === 0 ? <div className="p-10 text-center"><p className="text-sm font-bold">No answers match these filters</p><p className="mt-1 text-xs text-slate-500">Try clearing a filter or searching for a different phrase.</p></div> : data?.items.map((row) => <div role="button" tabIndex={0} key={row.id} aria-label={`View response to ${row.question.label}`} onClick={() => void openAnswer(row.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openAnswer(row.id) } }} className={`grid w-full cursor-pointer gap-2 border-b border-slate-100 px-4 py-4 text-left transition hover:bg-indigo-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 lg:grid-cols-[110px_150px_170px_minmax(240px,1fr)_110px_160px_36px] lg:items-center lg:gap-3 lg:px-5 ${detail?.id === row.id ? 'bg-indigo-50/70 ring-1 ring-inset ring-indigo-200' : ''}`}>
        <span className="text-[11px] font-medium text-slate-500">{dateLabel(row.createdAt)}</span><span className="min-w-0 text-xs font-semibold text-slate-700"><span className="block truncate">{row.source?.name ?? 'Event-wide'}</span>{row.source?.session && <span className="block truncate text-[10px] font-medium text-slate-400">{row.source.session.name}</span>}{row.source?.speaker && <span className="block truncate text-[10px] font-medium text-slate-400">{row.source.speaker.name}</span>}</span><TruncatedTableText className="text-xs font-semibold leading-5 text-slate-700">{row.question.label}</TruncatedTableText><TruncatedTableText className={`text-xs leading-5 ${row.answerType === 'STRUCTURED' ? 'font-semibold text-indigo-700' : 'text-slate-600'}`}>{row.answerDisplay}</TruncatedTableText><span>{row.sentiment && <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold ring-1 ${sentimentTone(row.sentiment)}`}>{row.sentiment.toLowerCase()}</span>}</span><span className="flex flex-wrap gap-1">{row.themes.slice(0, 2).map((theme) => <Pill key={theme.themeKey} tone="teal">{theme.label}</Pill>)}</span><span className="text-lg text-slate-400">›</span>
      </div>)}
      {data && <footer className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-slate-500"><span>Showing {data.pagination.from}–{data.pagination.to} of {data.pagination.total}</span><div className="flex items-center gap-2"><button type="button" disabled={data.pagination.page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-md border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40">Previous</button><span>Page {data.pagination.page} of {data.pagination.totalPages}</span><button type="button" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40">Next</button></div></footer>}
    </div>
    {(detail || detailLoading) && <aside data-testid="raw-response-drawer" className="fixed inset-y-0 right-0 z-[70] w-full max-w-[520px] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-indigo-600">Answer details</p><h3 className="mt-1 text-lg font-bold">{detail?.question.label ?? 'Loading evidence…'}</h3></div><button aria-label="Close answer details" type="button" onClick={() => setDetail(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">×</button></div>{detailLoading && !detail ? <p className="mt-8 text-sm text-slate-500">Loading full response…</p> : detail && <div className="mt-6 space-y-6"><section className="text-xs text-slate-500"><p>{dateLabel(detail.createdAt)} · {detail.context.survey?.name ?? 'Survey'}</p><p className="mt-1">{detail.context.target?.name ?? 'Event-wide feedback'}{detail.context.target?.session ? ` · ${detail.context.target.session.name}` : ''}{detail.context.target?.speaker ? ` · ${detail.context.target.speaker.name}` : ''}</p></section>{detail.answerType === 'STRUCTURED' ? <section><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Recorded answer</p><p className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-lg font-bold text-indigo-800">{detail.answerDisplay}</p></section> : <section><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Full transcript</p><blockquote className="mt-2 border-l-2 border-indigo-300 pl-4 text-sm leading-6 text-slate-700">{detail.transcript || 'Transcript unavailable.'}</blockquote></section>}{detail.answerType === 'TEXT' && <section className="grid gap-3 rounded-xl bg-slate-50 p-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Answer summary</p><p className="mt-1 text-sm leading-5 text-slate-700">{detail.analysis?.summary ?? 'Analysis is not available yet.'}</p></div><div className="flex flex-wrap gap-2">{detail.analysis?.sentiment && <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold ring-1 ${sentimentTone(detail.analysis.sentiment)}`}>{detail.analysis.sentiment.toLowerCase()}</span>}{detail.themes.map((theme) => <Pill key={theme.themeKey} tone="teal">{theme.label}</Pill>)}</div></section>}{detail.linkedFindings.length > 0 && <section><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Linked intelligence</p>{detail.linkedFindings.map((finding, index) => <div key={index} className="mt-2 rounded-xl border border-slate-200 p-3 text-sm"><p className="font-bold text-slate-800">{finding.recommendedAction ?? finding.taxonomyKey ?? 'Event finding'}</p><p className="mt-1 text-xs text-slate-500">{finding.urgency.toLowerCase()} priority</p>{finding.actions.map((action) => <p key={action.id} className="mt-2 text-xs text-slate-600">{action.title}</p>)}</div>)}</section>}<section><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Other answers from this response</p><div className="mt-2 space-y-2">{detail.responseAnswers.map((answer) => <button type="button" key={answer.id} onClick={() => void openAnswer(answer.id)} className={`w-full rounded-lg border p-3 text-left text-xs ${answer.selected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}><span className="font-bold text-slate-800">{answer.question}</span><span className="mt-1 block line-clamp-1 text-slate-500">{answer.answerDisplay}</span></button>)}</div></section></div>}</aside>}
  </section>
}
