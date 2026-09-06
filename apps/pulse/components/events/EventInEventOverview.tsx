'use client'

import { useState } from 'react'
import { EventBriefAction } from '@/components/events/EventBriefAction'
import { EventLifecycleHero } from '@/components/events/EventLifecycleHero'
import {
  EventActionableItem,
  resolveEventActionSource,
  type CanonicalEventAction,
  type CanonicalEventActionFinding,
  type EventActionOwner,
} from '@/components/events/EventActionComposer'
import type { InEventOverviewModel } from '@/lib/event-intelligence/overview'
import { evidenceTierLabel, type EventEvidenceModel } from '@/lib/event-intelligence/evidence-model'
import type { EventQuestionIntent } from '@/lib/event-intelligence/finding-synthesis'

export interface InEventOverviewThemeItem {
  themeKey: string
  themeKeys?: string[]
  label: string
  count: number
  sentimentLabel: string | null
  confidence: number | null
  evidence?: EventEvidenceModel
  statement?: string | null
  questionIntent?: EventQuestionIntent
  supportingAnswerIds?: string[]
  supportingResponseIds?: string[]
  supportingEvidenceIds?: string[]
  supportingTargetIds?: string[]
}

export interface InEventOverviewIssueItem {
  id: string | null
  taxonomyKey: string
  title: string
  summary: string | null
  priorityLevel: string
  confidence: number | null
  evidenceCount: number
  recommendedNextStep: string | null
  status: string
  ownerUserId?: string | null
  noteCount?: number
  affectedTarget: { name: string } | null
  affectedQuestion: { label: string } | null
  representativeEvidence?: Array<{
    id: string
    transcriptSnippet: string
    priorityLevel: string
    createdAt: string
  }>
}

interface CoverageItem {
  id: string | null
  label: string
  count: number
  active: boolean
  onSelect?: () => void
}

interface EventInEventOverviewProps {
  eventId: string
  accountSlug: string
  summary: string
  sentimentPercent: number | null
  sentimentBreakdown: { favorable: number; neutral: number; negative: number; total: number }
  responseCount: number
  answerCount: number
  representedFeedbackPoints: number
  configuredFeedbackPoints: number
  themes: InEventOverviewThemeItem[]
  issues: InEventOverviewIssueItem[]
  overview: InEventOverviewModel
  sourceCoverage: CoverageItem[]
  questionCoverage: CoverageItem[]
  hasActiveCoverageFilter: boolean
  onClearCoverageFilter?: () => void
  onReviewTheme: (theme: InEventOverviewThemeItem, heading?: string) => void
  onReviewIssue: (issue: InEventOverviewIssueItem) => void
  followUpHrefs: { open: string; unclaimed: string; afterEvent: string }
  actionOwners: EventActionOwner[]
  canonicalActions: CanonicalEventAction[]
  canonicalActionFindings: CanonicalEventActionFinding[]
}

function reviewTone(priority: string) {
  const normalized = priority.trim().toUpperCase()
  if (normalized === 'IMMEDIATE') return 'bg-rose-500'
  if (normalized === 'SOON') return 'bg-amber-500'
  return 'bg-violet-500'
}

function ReviewRow({
  title,
  description,
  meta,
  strength,
  action,
  tone,
  selected,
  onReview,
  eventId,
  accountSlug,
  actionOwners,
  canonicalActions,
  canonicalActionFindings,
  clusterId,
  themeKeys,
}: {
  title: string
  description: string
  meta: string
  strength: string
  action?: string
  tone: string
  selected?: boolean
  onReview: () => void
  eventId: string
  accountSlug: string
  actionOwners: EventActionOwner[]
  canonicalActions: CanonicalEventAction[]
  canonicalActionFindings: CanonicalEventActionFinding[]
  clusterId?: string | null
  themeKeys?: string[]
}) {
  const actionReference = resolveEventActionSource(
    { actions: canonicalActions, availableFindings: canonicalActionFindings },
    { clusterId, title, themeKeys, evidenceLabel: 'Evidence →' },
  )
  return (
    <article className={`grid min-w-0 grid-cols-[3px_minmax(0,1fr)] gap-3 px-4 py-3.5 sm:px-4 ${selected ? 'bg-violet-50/50' : ''}`}>
      <span className={`my-0.5 min-h-full rounded-full ${tone}`} aria-hidden="true" />
      <EventActionableItem eventId={eventId} accountSlug={accountSlug} owners={actionOwners} source={actionReference.source} actioned={actionReference.actioned} className="rounded-lg">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-bold leading-[1.35] text-slate-950">{title}</h3>
          <p className="mt-1 text-[11.5px] leading-[1.45] text-slate-500">{description}</p>
          <p className="mt-2 text-[10.5px] font-medium leading-4 text-slate-400">
            {meta} <span className="mx-1 text-slate-300">·</span>
            <span className="font-semibold text-slate-500">{strength}</span>
          </p>
          {action && <p className="mt-2 text-[10.5px] font-semibold text-violet-700">Linked action · {action}</p>}
        </div>
        <button
          type="button"
          onClick={onReview}
          className="mt-0.5 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-slate-600 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          Review evidence
        </button>
      </div>
      </EventActionableItem>
    </article>
  )
}

function SectionHeading({ children, tone = 'violet', count, meta }: { children: string; tone?: 'rose' | 'emerald' | 'violet'; count?: number; meta?: string }) {
  const tones = { rose: 'bg-rose-500', emerald: 'bg-emerald-500', violet: 'bg-violet-600' }
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`h-3.5 w-[2px] shrink-0 rounded-full ${tones[tone]}`} />
      <h2 className="min-w-0 text-[12px] font-bold tracking-[-0.01em] text-slate-950">{children}</h2>
      {count != null && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-400">{count} {count === 1 ? 'item' : 'items'}</span>}
      {meta && <p className="ml-auto min-w-0 truncate text-right text-[9.5px] text-slate-400">{meta}</p>}
    </div>
  )
}

function DecisionColumn({
  title,
  tone,
  items,
  empty,
  description,
  detailsOpen,
  onReview,
  eventId,
  accountSlug,
  actionOwners,
  canonicalActions,
  canonicalActionFindings,
}: {
  title: string
  tone: 'emerald' | 'amber' | 'violet'
  items: Array<{ key: string; label: string; description?: string | null; clusterId?: string | null; themeKeys?: string[] }>
  empty: string
  description: string
  detailsOpen: boolean
  onReview: (key: string) => void
  eventId: string
  accountSlug: string
  actionOwners: EventActionOwner[]
  canonicalActions: CanonicalEventAction[]
  canonicalActionFindings: CanonicalEventActionFinding[]
}) {
  const presentation = {
    emerald: {
      text: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-800', number: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-50 text-emerald-700', divider: 'border-emerald-100',
      iconPath: <path d="m5 12 4 4L19 6" />,
    },
    amber: {
      text: 'text-amber-700', badge: 'bg-amber-50 text-amber-800', number: 'bg-amber-50 text-amber-700', icon: 'bg-amber-50 text-amber-700', divider: 'border-amber-100',
      iconPath: <><path d="m4 16 5-5 3 3 7-8" /><path d="M14 6h5v5" /></>,
    },
    violet: {
      text: 'text-indigo-700', badge: 'bg-violet-50 text-violet-800', number: 'bg-violet-50 text-violet-700', icon: 'bg-violet-50 text-violet-700', divider: 'border-violet-100',
      iconPath: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16" /></>,
    },
  }[tone]

  return (
    <div data-decision-column className={`flex h-full min-w-0 flex-col px-4 py-4 ${detailsOpen ? 'py-4' : 'min-h-[170px]'}`}>
      <div data-decision-header className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-2.5">
        <span className={`inline-flex size-[22px] shrink-0 items-center justify-center rounded-md ${presentation.icon}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">{presentation.iconPath}</svg>
        </span>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`min-w-0 text-[12px] font-bold leading-5 tracking-[-0.01em] ${presentation.text}`}>{title}</h3>
            <span className="shrink-0 text-[9px] font-medium text-slate-400">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
          </div>
          <p className="mt-1 max-w-[260px] text-[10px] font-normal leading-4 text-slate-400">{description}</p>
        </div>
      </div>
      <div data-decision-divider className={`${detailsOpen ? 'mt-3' : 'mt-3'} border-t ${presentation.divider}`} />
      {detailsOpen && (
        <div className="mt-3 space-y-2.5">
          {items.length > 0 ? items.map((item, index) => {
            const actionReference = resolveEventActionSource(
              { actions: canonicalActions, availableFindings: canonicalActionFindings },
              { clusterId: item.clusterId, title: item.label, themeKeys: item.themeKeys, evidenceLabel: 'Evidence →' },
            )
            return <EventActionableItem key={item.key} eventId={eventId} accountSlug={accountSlug} owners={actionOwners} source={actionReference.source} actioned={actionReference.actioned} className="rounded-md">
              <button type="button" data-testid="decision-recommendation" onClick={() => onReview(item.key)} className="group flex w-full gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2">
                <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold ${presentation.number}`}>{index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-semibold leading-4 text-slate-900 transition group-hover:text-current">{item.label}</span>
                  {item.description && <span className="mt-0.5 block text-[10px] font-normal leading-4 text-slate-400">{item.description}</span>}
                </span>
              </button>
            </EventActionableItem>
          }) : <p className="text-[10px] font-normal leading-4 text-slate-500">{empty}</p>}
        </div>
      )}
      <button data-decision-evidence-link type="button" onClick={() => items[0] && onReview(items[0].key)} disabled={!items[0]} className={`mt-auto pt-3 text-left text-[10px] font-semibold ${presentation.text} hover:underline disabled:cursor-default disabled:opacity-60`}>View supporting evidence →</button>
    </div>
  )
}

export function EventInEventOverview({
  eventId,
  accountSlug,
  summary,
  sentimentPercent,
  sentimentBreakdown,
  responseCount,
  answerCount,
  representedFeedbackPoints,
  configuredFeedbackPoints,
  themes,
  issues,
  overview,
  sourceCoverage,
  questionCoverage,
  hasActiveCoverageFilter,
  onClearCoverageFilter,
  onReviewTheme,
  onReviewIssue,
  followUpHrefs,
  actionOwners,
  canonicalActions,
  canonicalActionFindings,
}: EventInEventOverviewProps) {
  const [decisionDetailsOpen, setDecisionDetailsOpen] = useState(true)
  const positiveThemes = overview.keep.slice(0, 3)
  const reviewItems = [
    ...issues.slice(0, 3).map((issue) => ({ type: 'issue' as const, issue })),
    ...overview.reviewThemes
      .filter((theme) => !issues.some((issue) => issue.taxonomyKey === theme.themeKey))
      .map((theme) => ({ type: 'theme' as const, theme })),
  ].slice(0, 3)
  const improveItems = [
    ...overview.improveNow.map((issue) => ({
      key: `issue:${issue.id ?? issue.taxonomyKey}`,
      label: issue.title,
      description: issues.find((candidate) => (candidate.id ?? candidate.taxonomyKey) === (issue.id ?? issue.taxonomyKey))?.summary || 'Review the linked attendee evidence before taking action.',
      type: 'issue' as const,
      issue,
    })),
    ...overview.reviewThemes
      .filter((theme) => !overview.improveNow.some((issue) => issue.taxonomyKey === theme.themeKey))
      .map((theme) => ({ key: `theme:${theme.themeKey}`, label: theme.label, description: theme.statement, type: 'theme' as const, theme })),
  ]
  const notCollecting = Math.max(configuredFeedbackPoints - representedFeedbackPoints, 0)
  const unownedFollowUp = overview.openFollowUp.filter((issue) => !issue.ownerUserId).length
  const confidenceRows = [
    { value: overview.confidence.strong, label: 'Strong evidence', meta: 'High confidence', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
    { value: overview.confidence.directional, label: 'Directional evidence', meta: 'Moderate', dot: 'bg-amber-500', bar: 'bg-amber-500' },
    { value: overview.confidence.emerging, label: 'Insufficient feedback', meta: 'Low confidence', dot: 'bg-blue-500', bar: 'bg-blue-500' },
    { value: notCollecting, label: 'Not yet collecting', meta: 'Configured, no responses', dot: 'bg-slate-300', bar: 'bg-slate-300' },
  ]
  const coverageTotal = Math.max(confidenceRows.reduce((total, row) => total + row.value, 0), 1)
  const synopsisBoundary = summary.indexOf('. ')
  const hasSufficientSynopsisEvidence = responseCount >= 3 && answerCount >= 3
  const synopsis = hasSufficientSynopsisEvidence && synopsisBoundary > 0
    ? summary.slice(0, synopsisBoundary + 1)
    : null
  const overviewText = synopsis
    ? summary.slice(synopsisBoundary + 2)
    : summary

  return (
    <div data-testid="event-overview" className="event-intelligence-overview w-full min-w-0 space-y-[14px] pt-0.5 text-slate-950">
      <EventLifecycleHero
        synopsis={synopsis}
        overview={overviewText}
        briefAction={<EventBriefAction eventId={eventId} accountSlug={accountSlug} lifecyclePhase="IN_EVENT" />}
        sentimentPercent={sentimentPercent}
        sentimentBreakdown={sentimentBreakdown}
        responseCount={responseCount}
        answerCount={answerCount}
        representedFeedbackPoints={representedFeedbackPoints}
        configuredFeedbackPoints={configuredFeedbackPoints}
        coverageRows={confidenceRows}
        followUpCount={overview.openFollowUp.length}
        followUpDetail={`${unownedFollowUp === 0 ? 'All owned' : `${unownedFollowUp} awaiting an owner`} · ${overview.revisitNextEvent.length} scheduled after event`}
        coverageDetail={(close) => <section id="coverage-detail-panel" data-testid="coverage-detail-panel" className="event-intelligence-summary-detail border-t border-slate-200 px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h2 className="text-[14px] font-bold text-slate-900">Coverage and confidence</h2><p className="mt-0.5 text-[11px] text-slate-400">{representedFeedbackPoints} of {configuredFeedbackPoints || representedFeedbackPoints} feedback points represented · {coverageTotal} with evidence</p></div>
            <button type="button" onClick={close} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Close</button>
          </div>
          <div className="event-intelligence-summary-detail-grid mt-4 grid min-w-0 gap-3">
            {confidenceRows.map((row) => <div key={row.label} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-4 py-3"><span className={`size-2.5 shrink-0 rounded-full ${row.dot}`} /><span className="text-[20px] font-bold tracking-[-0.03em] text-slate-950">{row.value}</span><span className="min-w-0"><span className="block text-[12px] font-semibold text-slate-700">{row.label}</span><span className="block text-[11px] text-slate-400">{row.meta}</span></span></div>)}
          </div>
          <p className="mt-4 max-w-4xl text-[11px] leading-5 text-slate-400">Sparse voice feedback limits certainty. Configured feedback points without responses are not treated as negative findings — they are reported as not yet collecting.</p>
          {(sourceCoverage.length > 0 || questionCoverage.length > 0) && <details className="mt-3 text-[11px]"><summary className="cursor-pointer font-semibold text-indigo-700">Feedback-point detail</summary><div className="mt-2 grid min-w-0 gap-1.5 sm:grid-cols-2">{hasActiveCoverageFilter && onClearCoverageFilter && <button type="button" onClick={onClearCoverageFilter} className="text-left font-bold text-indigo-700 hover:underline">Clear coverage filter</button>}{sourceCoverage.slice(0, 4).map((item) => <button key={`source-${item.id ?? item.label}`} type="button" onClick={item.onSelect} disabled={!item.onSelect} className={`flex min-w-0 items-center justify-between rounded-md px-2.5 py-2 text-left ${item.active ? 'bg-violet-50 text-violet-800' : 'bg-slate-50 text-slate-600'}`}><span className="truncate">{item.label}</span><span className="font-bold">{item.count}</span></button>)}{questionCoverage.slice(0, 3).map((item) => <button key={`question-${item.id ?? item.label}`} type="button" onClick={item.onSelect} disabled={!item.onSelect} className={`flex min-w-0 items-center justify-between rounded-md px-2.5 py-2 text-left ${item.active ? 'bg-violet-50 text-violet-800' : 'bg-slate-50 text-slate-600'}`}><span className="truncate">{item.label}</span><span className="font-bold">{item.count}</span></button>)}</div></details>}
        </section>}
        followUpDetailContent={(close) => <section id="follow-up-detail-panel" data-testid="follow-up-detail-panel" className="event-intelligence-summary-detail border-t border-slate-200 px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h2 className="inline text-[14px] font-bold text-slate-900">Open follow-up</h2><span className="ml-3 text-[11px] text-slate-400">Existing follow-ups your team created</span></div>
            <div className="flex items-center gap-4"><a href={followUpHrefs.open} className="text-[11px] font-semibold text-indigo-700 hover:underline">Open the Actions workspace →</a><button type="button" onClick={close} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Close</button></div>
          </div>
          <div className="event-intelligence-summary-detail-grid event-intelligence-follow-up-detail-grid mt-4 grid min-w-0 gap-3">
            <a href={followUpHrefs.open} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-4 py-3 transition hover:border-indigo-200"><span className="size-2.5 shrink-0 rounded-full bg-emerald-500" /><span className="text-[20px] font-bold tracking-[-0.03em] text-slate-950">{overview.openFollowUp.length}</span><span className="min-w-0"><span className="block text-[12px] font-semibold text-slate-700">Team-created actions open</span><span className="block text-[11px] text-slate-400">All have an owner</span></span></a>
            <a href={followUpHrefs.unclaimed} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-4 py-3 transition hover:border-indigo-200"><span className="size-2.5 shrink-0 rounded-full bg-slate-200" /><span className="text-[20px] font-bold tracking-[-0.03em] text-slate-950">{unownedFollowUp}</span><span className="min-w-0"><span className="block text-[12px] font-semibold text-slate-700">Awaiting an owner</span><span className="block text-[11px] text-slate-400">{unownedFollowUp === 0 ? 'Nothing unclaimed' : 'Assign an owner'}</span></span></a>
            <a href={followUpHrefs.afterEvent} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-4 py-3 transition hover:border-indigo-200"><span className="size-2.5 shrink-0 rounded-full bg-blue-400" /><span className="text-[20px] font-bold tracking-[-0.03em] text-slate-950">{overview.revisitNextEvent.length}</span><span className="min-w-0"><span className="block text-[12px] font-semibold text-slate-700">After-event follow-up</span><span className="block text-[11px] text-slate-400">Scheduled, no work today</span></span></a>
          </div>
        </section>}
      />

      <div className="event-intelligence-main-grid grid min-w-0 gap-[14px]">
        <section data-testid="needs-attention-panel" className="min-w-0 overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.035)]">
          <header className="border-b border-slate-200 px-4 py-3"><SectionHeading tone="rose" count={reviewItems.length} meta="Ranked by evidence weight">What needs review</SectionHeading></header>
          <div className="divide-y divide-slate-100">
              {reviewItems.length > 0 ? reviewItems.map((item) => item.type === 'issue' ? (
                <ReviewRow key={item.issue.id ?? item.issue.taxonomyKey} eventId={eventId} accountSlug={accountSlug} actionOwners={actionOwners} canonicalActions={canonicalActions} canonicalActionFindings={canonicalActionFindings} clusterId={item.issue.id} themeKeys={[item.issue.taxonomyKey]} title={item.issue.title} description={item.issue.summary || item.issue.recommendedNextStep || 'Review the linked attendee evidence before taking action.'} meta={`${item.issue.evidenceCount} evidence item${item.issue.evidenceCount === 1 ? '' : 's'}${item.issue.affectedTarget?.name ? ` · ${item.issue.affectedTarget.name}` : ''}`} strength="Review linked evidence" tone={reviewTone(item.issue.priorityLevel)} onReview={() => onReviewIssue(item.issue)} />
              ) : (
                <ReviewRow key={item.theme.themeKey} eventId={eventId} accountSlug={accountSlug} actionOwners={actionOwners} canonicalActions={canonicalActions} canonicalActionFindings={canonicalActionFindings} themeKeys={item.theme.themeKeys ?? [item.theme.themeKey]} title={item.theme.label} description={item.theme.statement || 'Emerging attendee evidence worth watching.'} meta={`${item.theme.evidence?.uniqueAnalyzedResponseCount ?? item.theme.count} analyzed response${(item.theme.evidence?.uniqueAnalyzedResponseCount ?? item.theme.count) === 1 ? '' : 's'} · ${item.theme.count} mention${item.theme.count === 1 ? '' : 's'}`} strength={evidenceTierLabel(item.theme.evidence?.evidenceTier ?? 'EMERGING')} tone="bg-amber-500" onReview={() => onReviewTheme(item.theme, 'Evidence to watch')} />
              )) : (
                <div className="p-4 text-[11px] text-slate-500">No credible friction or mixed pattern has emerged in the current evidence.</div>
              )}
          </div>
        </section>

        <section data-testid="what-is-working" className="min-w-0 overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.035)]">
          <header className="border-b border-slate-200 px-4 py-3"><SectionHeading tone="emerald" count={positiveThemes.length} meta="Strong evidence across all three">What is working</SectionHeading></header>
          <div className="divide-y divide-slate-100">
              {positiveThemes.length > 0 ? positiveThemes.map((theme) => (
                <ReviewRow
                  key={theme.themeKey}
                  eventId={eventId}
                  accountSlug={accountSlug}
                  actionOwners={actionOwners}
                  canonicalActions={canonicalActions}
                  canonicalActionFindings={canonicalActionFindings}
                  themeKeys={theme.themeKeys ?? [theme.themeKey]}
                  title={theme.label}
                description={theme.statement || 'Review the supporting attendee evidence.'}
                meta={`${theme.evidence?.uniqueAnalyzedResponseCount ?? 1} analyzed response${(theme.evidence?.uniqueAnalyzedResponseCount ?? 1) === 1 ? '' : 's'} · ${theme.count} mention${theme.count === 1 ? '' : 's'}`}
                  strength={evidenceTierLabel(theme.evidence?.evidenceTier ?? 'ISOLATED')}
                  tone="bg-emerald-500"
                  onReview={() => onReviewTheme(theme, 'Positive evidence')}
                />
              )) : (
                <div className="p-4 text-[11px] text-slate-500">No positive patterns have enough evidence yet.</div>
              )}
          </div>
        </section>
      </div>

      <section data-testid="overview-decisions" className="overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.035)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3"><SectionHeading>Keep, improve, and revisit</SectionHeading><p className="text-[10px] text-slate-400">Action-oriented recommendations grounded in attendee feedback</p></div>
          <button type="button" onClick={() => setDecisionDetailsOpen((open) => !open)} aria-expanded={decisionDetailsOpen} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
            {decisionDetailsOpen ? 'Hide details' : 'Show details'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-3.5 transition ${decisionDetailsOpen ? '' : 'rotate-180'}`} aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
          </button>
        </div>
        <div data-decision-columns className="event-intelligence-decision-columns grid min-w-0 divide-y divide-slate-200">
          <DecisionColumn title="Keep" tone="emerald" description="What attendees loved and want to see continued." detailsOpen={decisionDetailsOpen} eventId={eventId} accountSlug={accountSlug} actionOwners={actionOwners} canonicalActions={canonicalActions} canonicalActionFindings={canonicalActionFindings} items={overview.keep.slice(0, 3).map((theme) => ({ key: theme.themeKey, label: theme.label, description: theme.statement, themeKeys: theme.themeKeys ?? [theme.themeKey] }))} empty="No evidenced strengths yet." onReview={(key) => { const theme = themes.find((item) => item.themeKey === key); if (theme) onReviewTheme(theme) }} />
          <DecisionColumn title="Improve during this event" tone="amber" description="Areas to improve while this event is still in progress." detailsOpen={decisionDetailsOpen} eventId={eventId} accountSlug={accountSlug} actionOwners={actionOwners} canonicalActions={canonicalActions} canonicalActionFindings={canonicalActionFindings} items={improveItems.slice(0, 3).map((item) => item.type === 'issue' ? { ...item, clusterId: item.issue.id, themeKeys: [item.issue.taxonomyKey] } : { ...item, themeKeys: item.theme.themeKeys ?? [item.theme.themeKey] })} empty="No credible friction or mixed pattern has emerged in the current evidence." onReview={(key) => { const item = improveItems.find((candidate) => candidate.key === key); if (!item) return; if (item.type === 'issue') { const issue = issues.find((candidate) => (candidate.id ?? candidate.taxonomyKey) === (item.issue.id ?? item.issue.taxonomyKey)); if (issue) onReviewIssue(issue) } else onReviewTheme(item.theme, 'Evidence to watch') }} />
          <DecisionColumn title="Revisit next event" tone="violet" description="Consider for planning and design of future events." detailsOpen={decisionDetailsOpen} eventId={eventId} accountSlug={accountSlug} actionOwners={actionOwners} canonicalActions={canonicalActions} canonicalActionFindings={canonicalActionFindings} items={overview.revisitNextEvent.slice(0, 3).map((action) => ({ key: action.themeKey ?? action.title, label: action.title, description: action.description, themeKeys: action.themeKey ? [action.themeKey] : [] }))} empty="No next-event recommendation has emerged from the current evidence." onReview={(key) => { const action = overview.revisitNextEvent.find((item) => (item.themeKey ?? item.title) === key); if (action?.themeKey) onReviewTheme({ themeKey: action.themeKey, label: action.title, count: action.count ?? 0, sentimentLabel: null, confidence: action.confidence }) }} />
        </div>
      </section>
    </div>
  )
}
