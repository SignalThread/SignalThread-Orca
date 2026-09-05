'use client'

import type { EventIntelligenceEvidenceStrength, EventIntelligenceFinding } from '@/lib/event-intelligence/intelligence-view'
import type { ReactNode } from 'react'
import { evidenceTierLabel, type EventEvidenceTier } from '@/lib/event-intelligence/evidence-model'
import type { InEventOverviewIssueItem } from '@/components/events/EventInEventOverview'

interface IntelligenceCoverageOption {
  id: string
  label: string
}

interface EventInEventIntelligenceProps {
  currentIssues: InEventOverviewIssueItem[]
  currentFindings: EventIntelligenceFinding[]
  workingFindings: EventIntelligenceFinding[]
  nextEventFindings: EventIntelligenceFinding[]
  afterEventFindings: EventIntelligenceFinding[]
  selectedThemeKey: string | null
  selectedIssue: InEventOverviewIssueItem | null
  strengthFilter: EventIntelligenceEvidenceStrength | null
  onStrengthFilterChange?: (strength: EventIntelligenceEvidenceStrength | null) => void
  sourceOptions: IntelligenceCoverageOption[]
  questionOptions: IntelligenceCoverageOption[]
  selectedSourceId: string
  selectedQuestionId: string
  onSourceChange: (id: string) => void
  onQuestionChange: (id: string) => void
  onReviewFinding: (finding: EventIntelligenceFinding) => void
  onReviewIssue: (issue: InEventOverviewIssueItem) => void
}

function IntelligenceRow({
  title,
  description,
  count,
  analyzedResponseCount,
  sources,
  strength,
  evidenceTier,
  action,
  selected,
  onReview,
}: {
  title: string
  description: string
  count: number
  analyzedResponseCount?: number | null
  sources: number
  strength: EventIntelligenceEvidenceStrength
  evidenceTier: EventEvidenceTier
  action?: string
  selected: boolean
  onReview: () => void
}) {
  const tone = strength === 'strong' ? 'text-emerald-700' : strength === 'directional' ? 'text-amber-700' : 'text-slate-500'
  return (
    <article className={`relative border-b border-slate-200 px-5 py-[18px] last:border-b-0 ${selected ? 'bg-violet-50/50' : 'bg-white'}`}>
      <div className="flex items-start gap-4">
        <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${strength === 'strong' ? 'bg-emerald-50 text-emerald-700' : strength === 'directional' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><circle cx="12" cy="12" r="3" /><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" /></svg>
        </span>
        <div className="min-w-0 flex-1 pr-36">
          <h3 className="text-[14px] font-bold leading-5 text-slate-950">{title}</h3>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">{description}</p>
          <p className="mt-2 text-[11px] text-slate-400">
            {typeof analyzedResponseCount === 'number' ? `${analyzedResponseCount} analyzed response${analyzedResponseCount === 1 ? '' : 's'} · ` : ''}{count} mention{count === 1 ? '' : 's'}{sources > 0 ? ` · ${sources} listening point${sources === 1 ? '' : 's'}` : ''}
            <span className="mx-1">·</span><span className={`font-bold ${tone}`}>{evidenceTierLabel(evidenceTier)}</span>
          </p>
          {action && <p className="mt-2 text-[11px] font-semibold text-violet-700">Linked action · {action}</p>}
        </div>
        <button type="button" aria-pressed={selected} onClick={onReview} className="absolute right-5 top-1/2 -translate-y-1/2 rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-bold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
          Review evidence
        </button>
      </div>
    </article>
  )
}

export function EventInEventIntelligence({
  currentIssues,
  currentFindings,
  workingFindings,
  nextEventFindings,
  afterEventFindings,
  selectedThemeKey,
  selectedIssue,
  strengthFilter,
  onStrengthFilterChange,
  sourceOptions,
  questionOptions,
  selectedSourceId,
  selectedQuestionId,
  onSourceChange,
  onQuestionChange,
  onReviewFinding,
  onReviewIssue,
}: EventInEventIntelligenceProps) {
  const immediateItems = [...currentIssues.slice(0, 5), ...currentFindings].slice(0, 5)
  const futureItems = [...nextEventFindings, ...afterEventFindings]

  const renderFinding = (finding: EventIntelligenceFinding) => (
    <IntelligenceRow key={finding.id} title={finding.title} description={finding.description || 'Review the linked attendee evidence.'} count={finding.mentionCount} analyzedResponseCount={finding.evidence.uniqueAnalyzedResponseCount} sources={finding.sourceCount} strength={finding.evidenceStrength} evidenceTier={finding.evidenceTier} selected={selectedThemeKey === finding.evidenceThemeKey} onReview={() => onReviewFinding(finding)} />
  )

  const renderIssue = (item: InEventOverviewIssueItem | EventIntelligenceFinding) => 'evidenceCount' in item ? (
    <IntelligenceRow key={item.id ?? item.taxonomyKey} title={item.title} description={item.summary || item.recommendedNextStep || 'Review the linked attendee evidence before acting.'} count={item.evidenceCount} sources={item.affectedTarget ? 1 : 0} strength="weak" evidenceTier="ISOLATED" selected={selectedIssue?.id === item.id} onReview={() => onReviewIssue(item)} />
  ) : renderFinding(item)

  const EvidenceGroup = ({ title, subtitle, children, empty, tone = 'slate' }: { title: string; subtitle: string; children: ReactNode; empty: string; tone?: 'slate' | 'emerald' | 'amber' | 'violet' }) => {
    const tones = {
      slate: 'border-slate-200 bg-slate-50 text-slate-700',
      emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      amber: 'border-amber-200 bg-amber-50 text-amber-700',
      violet: 'border-violet-200 bg-violet-50 text-violet-700',
    }
    const items = Array.isArray(children) ? children.filter(Boolean) : children
    return <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${tones[tone]}`} aria-hidden="true">{title === 'Strengths' ? '↗' : title === 'Issues to review' ? '!' : '✦'}</span>
        <div><h2 className="text-[16px] font-bold text-slate-950">{title}</h2><p className="text-[12px] text-slate-500">{subtitle}</p></div>
      </div>
      {items && (!Array.isArray(items) || items.length > 0) ? items : <p className="px-5 py-6 text-sm text-slate-500">{empty}</p>}
    </section>
  }

  return (
    <div data-testid="signals-intelligence-workspace" className="mx-auto max-w-[1176px] space-y-5 pt-1.5 text-slate-950">
      <header>
        <h2 className="text-[22px] font-bold tracking-[-0.025em] text-slate-950">What attendees are telling us</h2>
        <p className="mt-1 text-[13px] text-slate-500">Evidence-backed patterns from the selected event scope.</p>
      </header>
      <EvidenceGroup title="Strengths" subtitle="What is working well" tone="emerald" empty="No strength pattern has emerged from the current evidence yet.">{workingFindings.map(renderFinding)}</EvidenceGroup>
      <EvidenceGroup title="Issues to review" subtitle="Needs attention" tone="amber" empty="No issue requiring review is identified in the current evidence.">{immediateItems.map(renderIssue)}</EvidenceGroup>
      <EvidenceGroup title="Future opportunities" subtitle="Opportunities to grow" tone="violet" empty="No future opportunity has emerged from the current evidence yet.">{futureItems.map(renderFinding)}</EvidenceGroup>

    </div>
  )
}
