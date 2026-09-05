'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { InsightDrilldownAnswerRow, InsightDrilldownPayload } from '@/lib/insights/drilldown'
import { representativeQuoteSentimentLabel } from '@/lib/insights/source-answers'
import {
  buildDailyMixFromRows,
  buildExcludeTokensFromInsight,
  buildHighlightTerms,
  buildResultsSummary,
  escapeRegExp,
  pickRepresentativeQuotes,
  topDriverWords,
  type ActiveFilterSnapshot,
} from '@/components/admin/dashboard/insightDrilldownDrawerHelpers'

interface InsightDrilldownDrawerProps {
  open: boolean
  insightId: string | null
  accountSlug: string | null
  onClose: () => void
}

/**
 * Platform sentiment palette (matches Key Insights / dashboard accents).
 * Same hex everywhere: chart, breakdown, legend, badges, quote borders.
 */
const SENTIMENT = {
  positive: '#16a34a',
  neutral: '#64748b',
  negative: '#dc2626',
  /** Single-bar days without per-day mix in aggregate sample */
  volume: '#475569',
} as const

/** Darken same hue on hover (no new hues) */
const SENTIMENT_HOVER = {
  positive: '#15803d',
  neutral: '#475569',
  negative: '#b91c1c',
  volume: '#334155',
} as const

const sentimentCssVars = {
  ['--sentiment-positive' as string]: SENTIMENT.positive,
  ['--sentiment-positive-hover' as string]: SENTIMENT_HOVER.positive,
  ['--sentiment-neutral' as string]: SENTIMENT.neutral,
  ['--sentiment-neutral-hover' as string]: SENTIMENT_HOVER.neutral,
  ['--sentiment-negative' as string]: SENTIMENT.negative,
  ['--sentiment-negative-hover' as string]: SENTIMENT_HOVER.negative,
  ['--sentiment-volume' as string]: SENTIMENT.volume,
  ['--sentiment-volume-hover' as string]: SENTIMENT_HOVER.volume,
} as CSSProperties

type SentimentSeg = 'positive' | 'neutral' | 'negative'

const SENTIMENT_HOVER_BLURB: Record<
  SentimentSeg,
  { label: string; description: string }
> = {
  positive: {
    label: 'Positive',
    description: 'Customers had a strong positive experience',
  },
  neutral: {
    label: 'Neutral',
    description: 'Mixed or unclear experience',
  },
  negative: {
    label: 'Negative',
    description: 'Customers had a poor experience',
  },
}

function HighlightedTranscript({ text, terms }: { text: string; terms: string[] }) {
  const safeTerms = useMemo(() => terms.filter((t) => t.length >= 2), [terms])
  if (!safeTerms.length) return <>{text}</>
  const pattern = new RegExp(`(${safeTerms.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, i) => {
        const lower = part.toLowerCase()
        const hit = safeTerms.some((t) => t.toLowerCase() === lower)
        if (hit) {
          return (
            <mark
              key={i}
              className="rounded bg-amber-100/90 px-0.5 text-inherit not-italic dark:bg-amber-500/20"
            >
              {part}
            </mark>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function sentimentLeftAccent(bucket: InsightDrilldownAnswerRow['sentimentBucket']): string {
  switch (bucket) {
    case 'positive':
      return SENTIMENT.positive
    case 'negative':
      return SENTIMENT.negative
    default:
      return SENTIMENT.neutral
  }
}

function mergeSearchParams(base: URLSearchParams, updates: Record<string, string | null>): URLSearchParams {
  const next = new URLSearchParams(base.toString())
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === '') next.delete(k)
    else next.set(k, v)
  }
  return next
}

/**
 * URL persistence: dd_insight, dd_sentiment, dd_question, dd_from, dd_to, dd_driver (textContains).
 * Parent route must preserve `account` and other params — we merge into current search string.
 *
 * TODO: Deep-link opening the drawer from URL alone would require lifting `insightId` + `open` from the
 * parent (Dashboard2 / event page); not wired here — only filter state is restored when the drawer is open.
 */
export function InsightDrilldownDrawer({
  open,
  insightId,
  accountSlug,
  onClose,
}: InsightDrilldownDrawerProps) {
  const [data, setData] = useState<InsightDrilldownPayload | null>(null)
  const [aggregateData, setAggregateData] = useState<InsightDrilldownPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentiment, setSentiment] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all')
  const [questionKey, setQuestionKey] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [textContains, setTextContains] = useState<string>('')
  const [page, setPage] = useState(1)
  const [rawResponsesOpen, setRawResponsesOpen] = useState(false)
  const [chartTooltip, setChartTooltip] = useState<{
    x: number
    y: number
    dateLabel: string
    total: number
    mixSummary: string
  } | null>(null)
  const [sentimentTooltip, setSentimentTooltip] = useState<{
    x: number
    y: number
    segment: SentimentSeg
    count: number
    pct: number
  } | null>(null)
  /** Skip one URL write after open/close so hydrate + initial state are not overwritten. */
  const skipNextUrlSync = useRef(true)

  const selectedDay = useMemo(() => {
    if (dateFrom && dateTo && dateFrom === dateTo) return dateFrom
    return null
  }, [dateFrom, dateTo])

  const applyDrilldownUrl = useCallback(
    (next: Partial<Record<'dd_insight' | 'dd_sentiment' | 'dd_question' | 'dd_from' | 'dd_to' | 'dd_driver', string | null>>) => {
      if (typeof window === 'undefined' || !insightId) return
      const cur = new URLSearchParams(window.location.search)
      const merged = mergeSearchParams(cur, {
        dd_insight: next.dd_insight ?? insightId,
        dd_sentiment: next.dd_sentiment ?? (sentiment === 'all' ? null : sentiment),
        dd_question: (next.dd_question ?? questionKey) || null,
        dd_from: (next.dd_from ?? dateFrom) || null,
        dd_to: (next.dd_to ?? dateTo) || null,
        dd_driver: (next.dd_driver ?? textContains.trim()) || null,
      })
      const qs = merged.toString()
      const path = window.location.pathname
      window.history.replaceState(null, '', qs ? `${path}?${qs}` : path)
    },
    [insightId, sentiment, questionKey, dateFrom, dateTo, textContains]
  )

  useEffect(() => {
    if (!open) {
      setData(null)
      setAggregateData(null)
      setError(null)
      setRawResponsesOpen(false)
      setChartTooltip(null)
      setSentimentTooltip(null)
      skipNextUrlSync.current = true
      return
    }
    setPage(1)
    setSentiment('all')
    setQuestionKey('')
    setDateFrom('')
    setDateTo('')
    setTextContains('')
    setRawResponsesOpen(false)

    if (typeof window === 'undefined' || !insightId) return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('dd_insight') && sp.get('dd_insight') !== insightId) return

    const s = sp.get('dd_sentiment')
    if (s === 'positive' || s === 'negative' || s === 'neutral') setSentiment(s)
    const q = sp.get('dd_question')
    if (q) setQuestionKey(q)
    const df = sp.get('dd_from')
    const dt = sp.get('dd_to')
    if (df) setDateFrom(df)
    if (dt) setDateTo(dt)
    const dr = sp.get('dd_driver')
    if (dr) setTextContains(dr)
  }, [open, insightId])

  useEffect(() => {
    if (!open || !insightId || !accountSlug) return

    let cancelled = false
    setLoading(true)
    setError(null)

    const base = new URLSearchParams({ account: accountSlug })
    if (sentiment !== 'all') base.set('sentiment', sentiment)
    if (questionKey) base.set('questionKey', questionKey)
    if (dateFrom) base.set('dateFrom', dateFrom)
    if (dateTo) base.set('dateTo', dateTo)
    if (textContains.trim()) base.set('textContains', textContains.trim())

    const listQs = new URLSearchParams(base)
    listQs.set('page', String(page))
    listQs.set('pageSize', '15')

    const aggQs = new URLSearchParams(base)
    aggQs.set('page', '1')
    aggQs.set('pageSize', '100')

    Promise.all([
      fetch(`/api/app/insights/${insightId}/drilldown?${listQs}`).then((r) => r.json()),
      fetch(`/api/app/insights/${insightId}/drilldown?${aggQs}`).then((r) => r.json()),
    ])
      .then(([listJson, aggJson]) => {
        if (cancelled) return
        if (!listJson.success) throw new Error(listJson.message || 'Failed to load')
        if (!aggJson.success) throw new Error(aggJson.message || 'Failed to load aggregate')
        setData(listJson.data)
        setAggregateData(aggJson.data)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Error')
        setData(null)
        setAggregateData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, insightId, accountSlug, page, sentiment, questionKey, dateFrom, dateTo, textContains])

  useEffect(() => {
    if (!open || !insightId) return
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false
      return
    }
    applyDrilldownUrl({})
  }, [open, insightId, sentiment, questionKey, dateFrom, dateTo, textContains, applyDrilldownUrl])

  const insight = data?.insight ?? aggregateData?.insight
  const totalPages = data
    ? Math.max(1, Math.ceil(data.answers.total / data.answers.pageSize))
    : 1

  const aggregateRows: InsightDrilldownAnswerRow[] = aggregateData?.answers.items ?? []

  const excludeTokens = useMemo(() => {
    if (!insight) return new Set<string>()
    return buildExcludeTokensFromInsight(insight)
  }, [insight])

  const driverWords = useMemo(
    () => topDriverWords(aggregateRows, excludeTokens, 5),
    [aggregateRows, excludeTokens]
  )

  const representativeQuotes = useMemo(
    () => pickRepresentativeQuotes(aggregateRows, 3),
    [aggregateRows]
  )

  const highlightTerms = useMemo(() => {
    if (!insight) return [] as string[]
    return buildHighlightTerms(insight, driverWords, textContains.trim() ? [textContains.trim()] : [])
  }, [insight, driverWords, textContains])

  const dailyMixMap = useMemo(() => buildDailyMixFromRows(aggregateRows), [aggregateRows])

  const questionLabel = useMemo(() => {
    const qs = data?.filterOptions.questions ?? aggregateData?.filterOptions.questions ?? []
    return qs.find((q) => q.questionKey === questionKey)?.promptLabel ?? null
  }, [data, aggregateData, questionKey])

  const activeFilters: ActiveFilterSnapshot = useMemo(
    () => ({
      sentiment,
      questionKey,
      questionLabel,
      dateFrom,
      dateTo,
      selectedDay,
      textContains,
    }),
    [sentiment, questionKey, questionLabel, dateFrom, dateTo, selectedDay, textContains]
  )

  const resultsSummary = useMemo(() => {
    const total = data?.answers.total ?? 0
    return buildResultsSummary(total, activeFilters)
  }, [data?.answers.total, activeFilters])

  const onBarClick = (day: string) => {
    if (selectedDay === day) {
      setPage(1)
      setDateFrom('')
      setDateTo('')
      return
    }
    setPage(1)
    setDateFrom(day)
    setDateTo(day)
  }

  const clearAllFilters = () => {
    setPage(1)
    setSentiment('all')
    setQuestionKey('')
    setDateFrom('')
    setDateTo('')
    setTextContains('')
    if (typeof window !== 'undefined' && insightId) {
      const cur = new URLSearchParams(window.location.search)
      ;['dd_sentiment', 'dd_question', 'dd_from', 'dd_to', 'dd_driver'].forEach((k) => cur.delete(k))
      cur.set('dd_insight', insightId)
      const qs = cur.toString()
      window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
    }
  }

  const insightSummaryLine = useMemo(() => {
    if (!insight) return ''
    if (insight.bodyText?.trim()) return insight.bodyText.trim()
    return `${insight.totalMentions} linked responses · ${insight.windowDays}-day window`
  }, [insight])

  const sentimentSegments = useMemo(() => {
    if (!data) return null
    const { positive, negative, neutral } = data.sentimentBreakdown
    const sum = positive + negative + neutral || 1
    return {
      positive,
      negative,
      neutral,
      pPct: (positive / sum) * 100,
      neuPct: (neutral / sum) * 100,
      negPct: (negative / sum) * 100,
    }
  }, [data])

  const chartData = data?.mentionsOverTime ?? []
  const hasActiveFilters =
    sentiment !== 'all' ||
    !!questionKey ||
    !!dateFrom ||
    !!dateTo ||
    !!textContains.trim()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] transition-opacity duration-150 dark:bg-slate-950/60"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_25px_80px_-12px_rgba(15,23,42,0.25)] transition-all duration-150 dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-[0_25px_80px_-12px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-5 py-3.5 md:px-7 md:py-4 dark:border-slate-800 dark:from-slate-900/90 dark:to-slate-950">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-lg font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50 md:text-xl">
              {loading && !insight ? 'Loading…' : insight?.title ?? 'Insight'}
            </h2>
            {insight && (
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 md:text-sm">
                {insightSummaryLine}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close panel"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-900/40 md:px-7">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-500">
                Refine view
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="cursor-pointer text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 transition-all duration-150 hover:text-slate-900 dark:text-slate-400"
                >
                  Clear all filters
                </button>
              )}
            </div>

            <div className="mb-1.5 flex flex-wrap gap-2">
              {selectedDay && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/90 px-2.5 py-1 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                  Day: {selectedDay}
                  <button
                    type="button"
                    className="cursor-pointer rounded-full p-0.5 hover:bg-slate-300/80 dark:hover:bg-slate-600"
                    aria-label="Clear day"
                    onClick={() => {
                      setPage(1)
                      setDateFrom('')
                      setDateTo('')
                    }}
                  >
                    ×
                  </button>
                </span>
              )}
              {sentiment !== 'all' && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-solid bg-white px-2.5 py-1 text-xs font-medium dark:bg-slate-950"
                  style={{
                    borderColor:
                      sentiment === 'positive'
                        ? SENTIMENT.positive
                        : sentiment === 'negative'
                          ? SENTIMENT.negative
                          : SENTIMENT.neutral,
                    color:
                      sentiment === 'positive'
                        ? SENTIMENT_HOVER.positive
                        : sentiment === 'negative'
                          ? SENTIMENT_HOVER.negative
                          : SENTIMENT_HOVER.neutral,
                  }}
                >
                  Sentiment: {sentiment}
                  <button
                    type="button"
                    className="cursor-pointer rounded-full p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Clear sentiment"
                    onClick={() => {
                      setPage(1)
                      setSentiment('all')
                    }}
                  >
                    ×
                  </button>
                </span>
              )}
              {questionKey && (
                <span className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full bg-slate-200/90 px-2.5 py-1 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                  Q: {questionLabel ?? questionKey}
                  <button
                    type="button"
                    className="cursor-pointer shrink-0 rounded-full p-0.5 hover:bg-slate-300/80"
                    aria-label="Clear question"
                    onClick={() => {
                      setPage(1)
                      setQuestionKey('')
                    }}
                  >
                    ×
                  </button>
                </span>
              )}
              {textContains.trim() && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 px-2.5 py-1 text-xs font-medium text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                  Driver: “{textContains.trim()}”
                  <button
                    type="button"
                    className="cursor-pointer rounded-full p-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-800/50"
                    aria-label="Clear driver filter"
                    onClick={() => {
                      setPage(1)
                      setTextContains('')
                    }}
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Sentiment
                <select
                  value={sentiment}
                  onChange={(e) => {
                    setPage(1)
                    setSentiment(e.target.value as typeof sentiment)
                  }}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all duration-150 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="all">All</option>
                  <option value="positive">Positive</option>
                  <option value="neutral">Neutral</option>
                  <option value="negative">Negative</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Question
                <select
                  value={questionKey}
                  onChange={(e) => {
                    setPage(1)
                    setQuestionKey(e.target.value)
                  }}
                  disabled={!data && !aggregateData}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all duration-150 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">All questions</option>
                  {(data ?? aggregateData)?.filterOptions.questions.map((q) => (
                    <option key={q.questionKey} value={q.questionKey}>
                      {q.promptLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setPage(1)
                    setDateFrom(e.target.value)
                  }}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all duration-150 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setPage(1)
                    setDateTo(e.target.value)
                  }}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all duration-150 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5 md:py-4">
            {data && (
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{resultsSummary}</p>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            )}

            {loading && !data && (
              <div className="space-y-3">
                <div className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="h-36 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              </div>
            )}

            {data && (
              <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,63%)_minmax(0,37%)] lg:items-start lg:gap-x-5 lg:gap-y-3">
                <section className="order-1 space-y-1.5 lg:col-start-1 lg:row-start-1 lg:self-start">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Responses over time
                    </h3>
                    {selectedDay && (
                      <button
                        type="button"
                        onClick={() => onBarClick(selectedDay)}
                        className="cursor-pointer text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 transition-all duration-150 hover:text-slate-900 dark:text-slate-400"
                      >
                        Clear selected day
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug text-slate-500">
                    Click a bar to scope the entire view to that date. Bar height reflects filtered responses.
                  </p>
                  {chartData.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center dark:border-slate-700 dark:bg-slate-900/30">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No responses in this range</p>
                      <p className="mt-1 text-xs text-slate-500">Adjust filters or clear the day selection.</p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="mt-3 cursor-pointer text-xs font-semibold text-slate-700 underline dark:text-slate-300"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      className="relative flex h-36 items-stretch gap-1 rounded-xl border border-slate-200/90 bg-slate-50/50 px-2 pb-1.5 pt-1.5 shadow-[inset_0_1px_0_rgba(15,23,42,0.05)] dark:border-slate-700/90 dark:bg-slate-900/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      style={sentimentCssVars}
                    >
                      {(() => {
                        const max = Math.max(...chartData.map((d) => d.count), 1)
                        return chartData.map((pt) => {
                          const selected = selectedDay === pt.date
                          const mix = dailyMixMap.get(pt.date)
                          const totalMix = mix ? mix.positive + mix.neutral + mix.negative : 0
                          const useStack = !!mix && totalMix > 0
                          const mixLine = mix
                            ? `+${mix.positive} / ~${mix.neutral} / −${mix.negative}`
                            : 'Sentiment mix unavailable for this day (aggregate sample)'
                          const barPct = Math.max(12, (pt.count / max) * 100)
                          return (
                            <button
                              key={pt.date}
                              type="button"
                              onClick={() => onBarClick(pt.date)}
                              onMouseEnter={(e) => {
                                const r = e.currentTarget.getBoundingClientRect()
                                const cx = r.left + r.width / 2
                                setChartTooltip({
                                  x: Math.max(48, Math.min(cx, window.innerWidth - 48)),
                                  y: r.top,
                                  dateLabel: pt.date,
                                  total: pt.count,
                                  mixSummary: mixLine,
                                })
                              }}
                              onMouseLeave={() => setChartTooltip(null)}
                              className={`group relative z-0 flex min-h-0 min-w-0 flex-1 cursor-pointer flex-col transition-all duration-150 hover:z-[1] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
                                selected
                                  ? 'rounded-md shadow-md shadow-slate-400/30 ring-2 ring-slate-600/90 ring-offset-1 ring-offset-white dark:shadow-slate-900/50 dark:ring-slate-300 dark:ring-offset-slate-950'
                                  : ''
                              }`}
                            >
                              <div className="flex min-h-0 flex-1 flex-col justify-end">
                                <div
                                  className="flex w-full flex-col gap-px overflow-hidden rounded-sm"
                                  style={{
                                    height: `${barPct}%`,
                                    minHeight: '4px',
                                  }}
                                >
                                  {useStack && mix ? (
                                    <>
                                      {mix.positive > 0 && (
                                        <div
                                          style={{
                                            height: `${(mix.positive / totalMix) * 100}%`,
                                          }}
                                          className="min-h-[2px] w-full shrink-0 rounded-t-[2px] bg-[color:var(--sentiment-positive)] transition-colors duration-150 hover:bg-[color:var(--sentiment-positive-hover)]"
                                        />
                                      )}
                                      {mix.neutral > 0 && (
                                        <div
                                          style={{
                                            height: `${(mix.neutral / totalMix) * 100}%`,
                                          }}
                                          className="min-h-[2px] w-full shrink-0 bg-[color:var(--sentiment-neutral)] transition-colors duration-150 hover:bg-[color:var(--sentiment-neutral-hover)]"
                                        />
                                      )}
                                      {mix.negative > 0 && (
                                        <div
                                          style={{
                                            height: `${(mix.negative / totalMix) * 100}%`,
                                          }}
                                          className="min-h-[2px] w-full shrink-0 rounded-b-[2px] bg-[color:var(--sentiment-negative)] transition-colors duration-150 hover:bg-[color:var(--sentiment-negative-hover)]"
                                        />
                                      )}
                                    </>
                                  ) : (
                                    <div
                                      className={`h-full w-full rounded-sm transition-colors duration-150 ${
                                        selected
                                          ? ''
                                          : 'bg-[color:var(--sentiment-volume)] hover:bg-[color:var(--sentiment-volume-hover)]'
                                      }`}
                                      style={selected ? { backgroundColor: SENTIMENT_HOVER.volume } : undefined}
                                    />
                                  )}
                                </div>
                              </div>
                              <span className="mt-1 shrink-0 truncate text-center text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-400">
                                {pt.date.slice(5)}
                              </span>
                            </button>
                          )
                        })
                      })()}
                    </div>
                  )}
                </section>

                <aside className="order-2 flex flex-col gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-start">
                  <section className="space-y-2.5 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/50 dark:shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Key drivers
                    </h3>
                    <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-500">
                      Recurring terms in filtered transcripts. Click to require that text in responses.
                    </p>
                    {driverWords.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 py-5 text-center text-xs text-slate-500 dark:border-slate-700">
                        No recurring terms for this filter.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {driverWords.map((d) => {
                          const active = textContains.trim().toLowerCase() === d.word.toLowerCase()
                          return (
                            <button
                              key={d.word}
                              type="button"
                              onClick={() => {
                                setPage(1)
                                setTextContains(active ? '' : d.word)
                              }}
                              className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                                active
                                  ? 'bg-slate-100 ring-2 ring-slate-400/45 dark:bg-slate-800 dark:ring-slate-500'
                                  : 'bg-slate-50/90 hover:bg-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <span className="min-w-0 truncate text-sm font-medium capitalize text-slate-800 dark:text-slate-100">
                                {d.word}
                              </span>
                              <span className="shrink-0 text-sm tabular-nums font-semibold text-slate-500 dark:text-slate-400">
                                {d.count}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </section>

                  {sentimentSegments && (
                    <section className="space-y-2.5 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/50 dark:shadow-none">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Sentiment breakdown
                      </h3>
                      <p className="text-[11px] text-slate-500">Hover for detail · click a segment to filter.</p>
                      <div
                        className="overflow-hidden rounded-lg border border-slate-200/90 bg-slate-100/70 dark:border-slate-600/80 dark:bg-slate-950/50"
                        style={sentimentCssVars}
                      >
                        <div className="flex h-12 min-h-[3rem] w-full overflow-hidden">
                          {data.sentimentBreakdown.positive > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPage(1)
                                setSentiment(sentiment === 'positive' ? 'all' : 'positive')
                              }}
                              onMouseEnter={(e) => {
                                const r = e.currentTarget.getBoundingClientRect()
                                setSentimentTooltip({
                                  x: Math.max(100, Math.min(r.left + r.width / 2, window.innerWidth - 100)),
                                  y: r.top,
                                  segment: 'positive',
                                  count: data.sentimentBreakdown.positive,
                                  pct: Math.round(sentimentSegments.pPct),
                                })
                              }}
                              onMouseLeave={() => setSentimentTooltip(null)}
                              className={`flex min-w-[2.5rem] cursor-pointer items-center justify-center bg-[color:var(--sentiment-positive)] px-1 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--sentiment-positive-hover)] focus:outline-none ${
                                sentiment === 'positive' ? 'ring-2 ring-inset ring-white/45' : ''
                              }`}
                              style={{
                                width: `${sentimentSegments.pPct}%`,
                              }}
                            >
                              {sentimentSegments.pPct >= 6 ? `${sentimentSegments.pPct.toFixed(0)}%` : ''}
                            </button>
                          )}
                          {data.sentimentBreakdown.neutral > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPage(1)
                                setSentiment(sentiment === 'neutral' ? 'all' : 'neutral')
                              }}
                              onMouseEnter={(e) => {
                                const r = e.currentTarget.getBoundingClientRect()
                                setSentimentTooltip({
                                  x: Math.max(100, Math.min(r.left + r.width / 2, window.innerWidth - 100)),
                                  y: r.top,
                                  segment: 'neutral',
                                  count: data.sentimentBreakdown.neutral,
                                  pct: Math.round(sentimentSegments.neuPct),
                                })
                              }}
                              onMouseLeave={() => setSentimentTooltip(null)}
                              className={`flex min-w-[2.5rem] cursor-pointer items-center justify-center bg-[color:var(--sentiment-neutral)] px-1 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--sentiment-neutral-hover)] focus:outline-none ${
                                sentiment === 'neutral' ? 'ring-2 ring-inset ring-white/45' : ''
                              }`}
                              style={{
                                width: `${sentimentSegments.neuPct}%`,
                              }}
                            >
                              {sentimentSegments.neuPct >= 6 ? `${sentimentSegments.neuPct.toFixed(0)}%` : ''}
                            </button>
                          )}
                          {data.sentimentBreakdown.negative > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPage(1)
                                setSentiment(sentiment === 'negative' ? 'all' : 'negative')
                              }}
                              onMouseEnter={(e) => {
                                const r = e.currentTarget.getBoundingClientRect()
                                setSentimentTooltip({
                                  x: Math.max(100, Math.min(r.left + r.width / 2, window.innerWidth - 100)),
                                  y: r.top,
                                  segment: 'negative',
                                  count: data.sentimentBreakdown.negative,
                                  pct: Math.round(sentimentSegments.negPct),
                                })
                              }}
                              onMouseLeave={() => setSentimentTooltip(null)}
                              className={`flex min-w-[2.5rem] cursor-pointer items-center justify-center bg-[color:var(--sentiment-negative)] px-1 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--sentiment-negative-hover)] focus:outline-none ${
                                sentiment === 'negative' ? 'ring-2 ring-inset ring-white/45' : ''
                              }`}
                              style={{
                                width: `${sentimentSegments.negPct}%`,
                              }}
                            >
                              {sentimentSegments.negPct >= 6 ? `${sentimentSegments.negPct.toFixed(0)}%` : ''}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-slate-200/60 px-2.5 py-1.5 text-[10px] text-slate-500 dark:border-slate-700/80 dark:text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: SENTIMENT.positive }}
                              aria-hidden
                            />
                            Positive
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: SENTIMENT.neutral }}
                              aria-hidden
                            />
                            Neutral
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: SENTIMENT.negative }}
                              aria-hidden
                            />
                            Negative
                          </span>
                        </div>
                        <div className="flex bg-white px-2.5 py-2 text-[11px] font-medium dark:bg-slate-900/60">
                          <span className="flex-1" style={{ color: SENTIMENT.positive }}>
                            + {data.sentimentBreakdown.positive}
                          </span>
                          <span className="flex-1 text-center" style={{ color: SENTIMENT.neutral }}>
                            ~ {data.sentimentBreakdown.neutral}
                          </span>
                          <span className="flex-1 text-right" style={{ color: SENTIMENT.negative }}>
                            − {data.sentimentBreakdown.negative}
                          </span>
                        </div>
                      </div>
                    </section>
                  )}
                </aside>

                <section className="order-3 space-y-2 lg:col-start-1 lg:row-start-2 lg:self-start">
                  <h3 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                    Representative quotes
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Strongest sentiment signals in the current view (not “most positive”).
                  </p>
                  {representativeQuotes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center dark:border-slate-700">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No quotes match this view</p>
                      <p className="mt-1 text-xs text-slate-500">Loosen filters or clear the text / day constraints.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {representativeQuotes.map((row) => (
                        <article
                          key={row.answerId}
                          className="rounded-xl border border-l-4 border-solid border-slate-200/90 bg-white p-5 shadow-md ring-1 ring-slate-900/[0.04] transition-all duration-150 dark:border-slate-600/80 dark:bg-slate-900/55 dark:ring-white/[0.06]"
                          style={{ borderLeftColor: sentimentLeftAccent(row.sentimentBucket) }}
                        >
                          <div className="mb-3 flex justify-end">
                            <div className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                              <span className="mr-2 font-medium text-slate-600 dark:text-slate-400">
                                {representativeQuoteSentimentLabel(row.sentimentBucket, row.sentimentScore)}
                              </span>
                              {new Date(row.responseStartedAt).toLocaleDateString()}
                            </div>
                          </div>
                          <p className="text-base leading-relaxed text-slate-800 dark:text-slate-100">
                            <HighlightedTranscript text={row.transcriptText ?? ''} terms={highlightTerms} />
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="order-4 lg:col-start-1 lg:row-start-3 lg:self-start">
                  <button
                    type="button"
                    onClick={() => setRawResponsesOpen((o) => !o)}
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-dashed border-slate-200/90 bg-slate-50/50 px-3 py-2.5 text-left transition-all duration-150 hover:border-slate-300/90 hover:bg-slate-100/80 dark:border-slate-700/80 dark:bg-slate-900/25 dark:hover:border-slate-600 dark:hover:bg-slate-800/40"
                  >
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-500">
                      View raw responses ({data.answers.total})
                    </span>
                    <svg
                      className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-150 ${rawResponsesOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {rawResponsesOpen && (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                      {data.answers.total === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center dark:border-slate-700">
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            No transcripts for this combination
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Try another day, sentiment, question, or driver — or reset all filters.
                          </p>
                          <button
                            type="button"
                            onClick={clearAllFilters}
                            className="mt-3 cursor-pointer text-xs font-semibold text-slate-700 underline dark:text-slate-300"
                          >
                            Clear all filters
                          </button>
                        </div>
                      ) : (
                        data.answers.items.map((row) => (
                          <div
                            key={row.answerId}
                            className="rounded-lg border border-slate-200/50 bg-slate-50/30 p-3 dark:border-slate-800/80 dark:bg-slate-900/20"
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span
                                className="rounded border border-solid bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-slate-900"
                                style={{
                                  borderColor: sentimentLeftAccent(row.sentimentBucket),
                                  color: sentimentLeftAccent(row.sentimentBucket),
                                }}
                              >
                                {representativeQuoteSentimentLabel(row.sentimentBucket, row.sentimentScore)}
                              </span>
                              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                {row.promptLabel}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(row.responseStartedAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {selectedDay && row.responseStartedAt.slice(0, 10) === selectedDay && (
                                <span className="rounded bg-slate-200/90 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                                  Matched day
                                </span>
                              )}
                              {sentiment !== 'all' && row.sentimentBucket === sentiment && (
                                <span
                                  className="rounded border border-solid bg-white px-1.5 py-0.5 text-[10px] dark:bg-slate-900"
                                  style={{
                                    borderColor:
                                      sentiment === 'positive'
                                        ? SENTIMENT.positive
                                        : sentiment === 'negative'
                                          ? SENTIMENT.negative
                                          : SENTIMENT.neutral,
                                    color:
                                      sentiment === 'positive'
                                        ? SENTIMENT_HOVER.positive
                                        : sentiment === 'negative'
                                          ? SENTIMENT_HOVER.negative
                                          : SENTIMENT_HOVER.neutral,
                                  }}
                                >
                                  Matched sentiment filter
                                </span>
                              )}
                              {textContains.trim() &&
                                (row.transcriptText ?? '').toLowerCase().includes(textContains.trim().toLowerCase()) && (
                                  <span className="rounded bg-amber-100/90 px-1.5 py-0.5 text-[10px] text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                                    Matched “{textContains.trim()}”
                                  </span>
                                )}
                            </div>
                            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                              <HighlightedTranscript text={row.transcriptText ?? '—'} terms={highlightTerms} />
                            </p>
                          </div>
                        ))
                      )}

                      {data.answers.total > 0 && totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                          <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="cursor-pointer text-sm font-medium text-slate-700 transition-all duration-150 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-300 dark:hover:text-white"
                          >
                            Previous
                          </button>
                          <span className="text-xs text-slate-500">
                            Page {page} of {totalPages}
                          </span>
                          <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            className="cursor-pointer text-sm font-medium text-slate-700 transition-all duration-150 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-300 dark:hover:text-white"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {chartTooltip && (
        <div
          className="pointer-events-none fixed z-[120] w-max max-w-[min(240px,calc(100vw-24px))] rounded-lg bg-[#0f172a] px-2.5 py-2 text-left text-xs leading-snug text-white shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
          style={{
            left: chartTooltip.x,
            top: chartTooltip.y,
            transform: 'translate(-50%, calc(-100% - 8px))',
          }}
        >
          <p className="font-semibold text-white">{chartTooltip.dateLabel}</p>
          <p className="mt-0.5 text-slate-200">{chartTooltip.total} responses</p>
          <p className="mt-1 text-[11px] text-slate-300">{chartTooltip.mixSummary}</p>
        </div>
      )}

      {sentimentTooltip && (
        <div
          className="pointer-events-none fixed z-[121] w-max max-w-[min(260px,calc(100vw-24px))] rounded-lg bg-[#0f172a] px-2.5 py-2 text-left text-xs leading-snug text-white shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
          style={{
            left: sentimentTooltip.x,
            top: sentimentTooltip.y,
            transform: 'translate(-50%, calc(-100% - 8px))',
          }}
        >
          <p className="font-semibold text-white">
            {SENTIMENT_HOVER_BLURB[sentimentTooltip.segment].label}
          </p>
          <p className="mt-0.5 text-slate-200">
            {sentimentTooltip.count} responses ({sentimentTooltip.pct}%)
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {SENTIMENT_HOVER_BLURB[sentimentTooltip.segment].description}
          </p>
        </div>
      )}
    </div>
  )
}
