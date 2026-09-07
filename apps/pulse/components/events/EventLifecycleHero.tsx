'use client'

import { useState, type ReactNode } from 'react'

export type EventLifecycleHeroCoverageRow = {
  value: number
  label: string
  meta: string
  dot: string
  bar: string
}

export type EventLifecycleHeroProps = {
  title?: string
  synopsis?: string | null
  overview: string
  briefAction: ReactNode
  sentimentPercent: number | null
  sentimentDisplay?: string
  sentimentDetail?: string
  sentimentBreakdown: { favorable: number; neutral: number; negative: number; total: number }
  responseCount: number
  answerCount: number
  responseDetail?: string
  representedFeedbackPoints: number
  configuredFeedbackPoints: number
  coverageUnit?: string
  coverageRows: EventLifecycleHeroCoverageRow[]
  coverageDetail?: (close: () => void) => ReactNode
  followUpCount: number
  followUpDetail: string
  followUpDetailContent?: (close: () => void) => ReactNode
}

export type EventLifecycleMetricStripProps = Pick<EventLifecycleHeroProps,
  | 'sentimentPercent'
  | 'sentimentDisplay'
  | 'sentimentDetail'
  | 'sentimentBreakdown'
  | 'responseCount'
  | 'answerCount'
  | 'responseDetail'
  | 'representedFeedbackPoints'
  | 'configuredFeedbackPoints'
  | 'coverageUnit'
  | 'coverageRows'
  | 'coverageDetail'
  | 'followUpCount'
  | 'followUpDetail'
  | 'followUpDetailContent'
>

/**
 * Shared factual metric strip. Lifecycle shells may remain distinct while the
 * metrics, responsive behavior, and expandable detail interactions stay one
 * implementation.
 */
export function EventLifecycleMetricStrip({
  sentimentPercent,
  sentimentDisplay,
  sentimentDetail,
  sentimentBreakdown,
  responseCount,
  answerCount,
  responseDetail,
  representedFeedbackPoints,
  configuredFeedbackPoints,
  coverageUnit = 'feedback points',
  coverageRows,
  coverageDetail,
  followUpCount,
  followUpDetail,
  followUpDetailContent,
}: EventLifecycleMetricStripProps) {
  const [expandedDetail, setExpandedDetail] = useState<'coverage' | 'follow-up' | null>(null)
  const sentimentTotal = Math.max(sentimentBreakdown.total, 1)
  const neutralPercent = Math.round((sentimentBreakdown.neutral / sentimentTotal) * 100)
  const negativePercent = Math.round((sentimentBreakdown.negative / sentimentTotal) * 100)
  const favorablePercent = Math.round((sentimentBreakdown.favorable / sentimentTotal) * 100)
  const coverageTotal = Math.max(coverageRows.reduce((total, row) => total + row.value, 0), 1)
  const toggleDetail = (detail: 'coverage' | 'follow-up') => setExpandedDetail((current) => current === detail ? null : detail)
  const defaultSentimentDisplay = sentimentPercent == null
    ? '—'
    : `${sentimentPercent}%`
  const defaultSentimentDetail = sentimentPercent == null
    ? 'Not enough data'
    : sentimentPercent >= 60
      ? 'positive'
      : sentimentPercent >= 40
        ? 'mixed'
        : 'needs attention'

  return (
    <>
      <div className="event-intelligence-metrics grid min-w-0 divide-x divide-y divide-slate-200 border-t border-slate-200">
        <div className="min-w-0 px-5 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Sentiment</p>
          <p className="mt-1 text-[22px] font-bold tracking-[-0.04em] text-slate-950">{sentimentDisplay ?? defaultSentimentDisplay} <span className="text-[10px] font-medium tracking-normal text-slate-500">{sentimentDetail ?? defaultSentimentDetail}</span></p>
          <div className="mt-2 flex h-[3px] overflow-hidden rounded-full bg-slate-100"><span className="bg-emerald-500" style={{ width: `${favorablePercent}%` }} /><span className="bg-slate-300" style={{ width: `${neutralPercent}%` }} /><span className="bg-amber-500" style={{ width: `${negativePercent}%` }} /></div>
          <p className="mt-1.5 text-[9.5px] text-slate-400">{sentimentPercent == null ? 'Distribution unavailable' : `${neutralPercent}% neutral · ${negativePercent}% negative`}</p>
        </div>
        <div className="min-w-0 px-5 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Responses</p>
          <p className="mt-1 text-[22px] font-bold tracking-[-0.04em] text-slate-950">{responseCount} <span className="text-[10px] font-medium tracking-normal text-slate-500">collected</span></p>
          <p className="mt-3 text-[9.5px] text-slate-400">{responseDetail ?? `${answerCount} analyzed answers`}</p>
        </div>
        <div className="min-w-0 px-5 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Coverage</p>
          <div data-testid="coverage-summary" className="mt-1 min-w-0">
            <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[22px] font-bold tracking-[-0.04em] text-slate-950">{representedFeedbackPoints}</span>
              <span className="text-[11px] font-semibold tracking-normal text-slate-400">of {configuredFeedbackPoints || representedFeedbackPoints}</span>
            </div>
            <p className="mt-0.5 text-[10px] font-medium tracking-normal text-slate-500">{coverageUnit}</p>
          </div>
          <div className="mt-2 flex h-[3px] overflow-hidden rounded-full bg-slate-100" aria-label="Coverage distribution">{coverageRows.map((row) => row.value > 0 && <span key={row.label} className={row.bar} style={{ width: `${(row.value / coverageTotal) * 100}%` }} />)}</div>
          {coverageDetail && <button data-testid="coverage-detail-toggle" type="button" aria-expanded={expandedDetail === 'coverage'} aria-controls="coverage-detail-panel" onClick={() => toggleDetail('coverage')} className="mt-1.5 text-[9.5px] font-bold text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">{expandedDetail === 'coverage' ? 'Hide coverage detail ▲' : 'Coverage detail ▼'}</button>}
        </div>
        <div className="min-w-0 px-5 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Follow-up</p>
          <p className="mt-1 text-[22px] font-bold tracking-[-0.04em] text-slate-950">{followUpCount} <span className="text-[10px] font-medium tracking-normal text-slate-500">open</span></p>
          <p className="mt-2.5 text-[9.5px] text-slate-400">{followUpDetail}</p>
          {followUpDetailContent && <button data-testid="follow-up-detail-toggle" type="button" aria-expanded={expandedDetail === 'follow-up'} aria-controls="follow-up-detail-panel" onClick={() => toggleDetail('follow-up')} className="mt-1.5 text-[9.5px] font-bold text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">{expandedDetail === 'follow-up' ? 'Hide follow-up detail ▲' : 'Follow-up detail ▼'}</button>}
        </div>
      </div>
      {expandedDetail === 'coverage' && coverageDetail?.(() => setExpandedDetail(null))}
      {expandedDetail === 'follow-up' && followUpDetailContent?.(() => setExpandedDetail(null))}
    </>
  )
}

/**
 * The lifecycle-neutral intelligence hero.  Every phase supplies its own
 * evidence-backed words and metrics, but intentionally shares this shell.
 */
export function EventLifecycleHero({
  title = 'Event overview',
  synopsis,
  overview,
  briefAction,
  sentimentPercent,
  sentimentDisplay,
  sentimentDetail,
  sentimentBreakdown,
  responseCount,
  answerCount,
  responseDetail,
  representedFeedbackPoints,
  configuredFeedbackPoints,
  coverageUnit = 'feedback points',
  coverageRows,
  coverageDetail,
  followUpCount,
  followUpDetail,
  followUpDetailContent,
}: EventLifecycleHeroProps) {
  return (
    <section data-testid="event-lifecycle-hero" className="event-lifecycle-hero event-intelligence-summary min-w-0 overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.035)]">
      <div className="flex min-w-0 items-start gap-3 px-5 py-4">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-indigo-50 text-indigo-700" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M4 18V9m5 9V5m5 13v-7m5 7V3" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold tracking-[-0.01em] text-slate-950">{title}</p>
          {synopsis && <p data-testid="event-lifecycle-synopsis" className="mt-2 max-w-[720px] text-[13px] font-semibold leading-5 text-slate-800">{synopsis}</p>}
          <p data-testid="event-lifecycle-overview" className={`${synopsis ? 'mt-1.5' : 'mt-2'} max-w-[720px] text-[12px] leading-6 text-slate-600`}>{overview}</p>
        </div>
        <div className="shrink-0">{briefAction}</div>
      </div>
      <EventLifecycleMetricStrip
        sentimentPercent={sentimentPercent}
        sentimentDisplay={sentimentDisplay}
        sentimentDetail={sentimentDetail}
        sentimentBreakdown={sentimentBreakdown}
        responseCount={responseCount}
        answerCount={answerCount}
        responseDetail={responseDetail}
        representedFeedbackPoints={representedFeedbackPoints}
        configuredFeedbackPoints={configuredFeedbackPoints}
        coverageUnit={coverageUnit}
        coverageRows={coverageRows}
        coverageDetail={coverageDetail}
        followUpCount={followUpCount}
        followUpDetail={followUpDetail}
        followUpDetailContent={followUpDetailContent}
      />
    </section>
  )
}
