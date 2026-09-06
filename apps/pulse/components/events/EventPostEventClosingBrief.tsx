'use client'

import { useEffect, useState } from 'react'
import { CircleDashed, PartyPopper, Sparkles } from 'lucide-react'
import { EventEvidenceDrawer } from '@/components/events/EventEvidenceDrawer'
import { EventThemeEvidencePanel } from '@/components/events/EventThemeEvidencePanel'
import { EventBriefAction } from '@/components/events/EventBriefAction'
import { EventLifecycleHero } from '@/components/events/EventLifecycleHero'
import {
  EventActionableItem,
  resolveEventActionSource,
  useEventActionData,
} from '@/components/events/EventActionComposer'
import type { EventClosingBrief } from '@/lib/event-closing-brief'
import { evidenceTierLabel, type EventEvidenceTier } from '@/lib/event-intelligence/evidence-model'
import type { EventThemeEvidenceResult } from '@/lib/event-intelligence/theme-evidence'

function confidencePercent(confidence: number | null) {
  return confidence === null ? 'Confidence not scored' : `${Math.round(confidence * 100)}% confidence`
}

function ownerStatus(action: EventClosingBrief['decisions']['unresolvedActions'][number]) {
  const due = action.dueAt ? new Date(action.dueAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date'
  return `${action.owner} · ${action.status.toLowerCase().replaceAll('_', ' ')} · ${due}`
}

function postEventHref(value: string) {
  if (/[?&]lifecycle=/.test(value)) return value
  return `${value}${value.includes('?') ? '&' : '?'}lifecycle=post-event`
}

function evidenceTone(tier: EventEvidenceTier) {
  return tier === 'STRONG' ? 'text-emerald-700' : tier === 'REPEATED' || tier === 'EMERGING' ? 'text-amber-700' : 'text-slate-500'
}

export function hasSufficientVerdictEvidence(summary: {
  responseCount: number
  answerCount: number
  listeningPointCount: number
  representedPercent: number
}) {
  const analysisCoverage = summary.responseCount > 0
    ? Math.min(1, summary.answerCount / summary.responseCount)
    : 0
  const listeningCoverageIsSufficient = summary.listeningPointCount === 0 || summary.representedPercent >= 50

  return summary.responseCount >= 3
    && summary.answerCount >= 3
    && analysisCoverage >= 0.5
    && listeningCoverageIsSufficient
}

export function verdictEmptyPresentation(itemCount: number, hasSufficientEvidence: boolean) {
  if (itemCount > 0) return 'populated' as const
  return hasSufficientEvidence ? 'positive' as const : 'insufficient' as const
}

type FindingEvidenceSelection = {
  id: string
  title: string
  themeKey: string
  themeKeys: string[]
  issueClusterIds: string[]
  count: number
  sentimentLabel: string | null
}

function accountSlugFromIntelligenceLink(link: string) {
  return new URL(link, 'https://signalthread.local').searchParams.get('account')
}

function VerdictCard({
  eyebrow,
  tone,
  empty = false,
  children,
}: {
  eyebrow: string
  tone: 'positive' | 'negative' | 'change'
  empty?: boolean
  children: React.ReactNode
}) {
  const toneClasses = {
    positive: 'border-t-emerald-500 text-emerald-700',
    negative: 'border-t-rose-500 text-rose-700',
    change: 'border-t-indigo-500 text-indigo-700',
  }[tone]

  return (
    <article data-closing-brief-verdict-card className={`min-h-[238px] rounded-[18px] border border-slate-200 border-t-[3px] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${toneClasses} ${empty ? 'flex flex-col' : ''}`}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.13em]">{eyebrow}</p>
      <div className={empty ? 'flex flex-1 flex-col justify-center py-5 text-slate-950' : 'mt-4 space-y-4 text-slate-950'}>{children}</div>
    </article>
  )
}

function VerdictEmptyState({
  tone,
  body,
  supporting,
  insufficient = false,
}: {
  tone: 'negative' | 'change'
  body: string
  supporting: string
  insufficient?: boolean
}) {
  const Icon = insufficient ? CircleDashed : tone === 'negative' ? PartyPopper : Sparkles
  const iconClasses = insufficient
    ? 'bg-slate-100 text-slate-400'
    : tone === 'negative'
      ? 'bg-rose-50 text-rose-500'
      : 'bg-indigo-50 text-indigo-500'

  return (
    <div data-verdict-empty-state className="mx-auto flex max-w-[320px] flex-col items-center text-center">
      <div data-verdict-empty-graphic className={`flex h-16 w-16 items-center justify-center rounded-full ${iconClasses}`}>
        <Icon aria-hidden size={32} strokeWidth={1.45} />
      </div>
      <h3 className="mt-5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-slate-950">{insufficient ? 'Not enough evidence yet' : 'You did great'}</h3>
      <p className="mt-4 text-[15px] font-normal leading-6 text-slate-700">{body}</p>
      <p className="mt-4 text-xs font-normal leading-5 text-slate-500">{supporting}</p>
    </div>
  )
}

export function EventPostEventClosingBrief({
  brief,
}: {
  brief: EventClosingBrief
}) {
  const [selectedFindingEvidence, setSelectedFindingEvidence] = useState<FindingEvidenceSelection | null>(null)
  const [findingEvidenceDetail, setFindingEvidenceDetail] = useState<EventThemeEvidenceResult | null>(null)
  const [findingEvidenceLoading, setFindingEvidenceLoading] = useState(false)
  const [findingEvidenceError, setFindingEvidenceError] = useState<string | null>(null)
  const accountSlug = accountSlugFromIntelligenceLink(brief.links.intelligence)
  const eventActionData = useEventActionData(brief.event.id, accountSlug ?? '')
  const findingNarrativeById = new Map(
    brief.editorial.copy.findingNarratives.map((item) => [item.findingId, item.narrative]),
  )

  useEffect(() => {
    if (!selectedFindingEvidence || !accountSlug) return
    let cancelled = false
    setFindingEvidenceLoading(true)
    setFindingEvidenceError(null)
    setFindingEvidenceDetail(null)
    const query = new URLSearchParams({ account: accountSlug })
    if (selectedFindingEvidence.themeKeys.length > 1) query.set('themeKeys', selectedFindingEvidence.themeKeys.join(','))
    if (selectedFindingEvidence.issueClusterIds.length > 0) query.set('issueClusterIds', selectedFindingEvidence.issueClusterIds.join(','))
    fetch(`/api/app/events/${encodeURIComponent(brief.event.id)}/themes/${encodeURIComponent(selectedFindingEvidence.themeKey)}/evidence?${query.toString()}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load supporting responses')
        if (!cancelled) setFindingEvidenceDetail(body.data as EventThemeEvidenceResult)
      })
      .catch((error) => {
        if (!cancelled) {
          setFindingEvidenceDetail(null)
          setFindingEvidenceError(error instanceof Error ? error.message : 'Unable to load supporting responses')
        }
      })
      .finally(() => { if (!cancelled) setFindingEvidenceLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, brief.event.id, selectedFindingEvidence])

  const openFindingEvidence = (finding: EventClosingBrief['keyFindings'][number]) => {
    const themeKeys = (finding.evidenceThemeKeys ?? []).filter(Boolean)
    const themeKey = themeKeys[0]
    if (!themeKey) return
    setSelectedFindingEvidence({
      id: finding.id,
      title: finding.title,
      themeKey,
      themeKeys,
      issueClusterIds: (finding.issueClusterIds ?? []).filter(Boolean),
      count: finding.mentionCount,
      sentimentLabel: finding.sentiment,
    })
  }
  const nextEventItems = [
    ...brief.decisions.nextEventLearning.actions.map((action) => ({ id: action.id, title: action.title, statement: null, meta: ownerStatus(action), clusterId: action.id, themeKeys: [] as string[] })),
    ...brief.decisions.nextEventLearning.sessionLearning.map((item) => ({
      id: item.id,
      title: item.title,
      statement: null,
      meta: `From ${item.source} · ${evidenceTierLabel(item.evidenceTier)}`,
      clusterId: null,
      themeKeys: [] as string[],
    })),
    ...(brief.decisions.nextEventLearning.findings ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      statement: item.statement,
      meta: `${item.mentionCount} mention${item.mentionCount === 1 ? '' : 's'} · ${evidenceTierLabel(item.evidenceTier)}`,
      clusterId: item.issueClusterIds?.[0] ?? null,
      themeKeys: item.evidenceThemeKeys,
    })),
  ]
  const canCelebrateEmptyVerdict = hasSufficientVerdictEvidence(brief.summary)
  const frictionPresentation = verdictEmptyPresentation(brief.friction.length, canCelebrateEmptyVerdict)
  const nextEventPresentation = verdictEmptyPresentation(nextEventItems.length, canCelebrateEmptyVerdict)

  return (
    <section
      data-testid="post-event-closing-brief"
      data-editorial-source={brief.editorial.source}
      data-editorial-cache-hit={String(brief.editorial.cacheHit)}
      data-editorial-input-hash={brief.editorial.inputHash}
      className="font-brand mx-auto max-w-[1176px] space-y-5"
    >
      <div data-closing-brief-document className="space-y-5">
      <div data-post-event-overview>
        <EventLifecycleHero
        title="Event overview"
        synopsis={brief.editorial.copy.headline}
        overview={`${brief.editorial.copy.executiveSummary} ${brief.editorial.copy.keyTakeaway}`}
        briefAction={accountSlug ? <EventBriefAction eventId={brief.event.id} accountSlug={accountSlug} lifecyclePhase="POST_EVENT" briefHash={brief.versionId} /> : null}
        sentimentPercent={brief.summary.sentimentPercent}
        sentimentDisplay={brief.summary.sentiment}
        sentimentDetail={`Based on ${brief.summary.answerCount.toLocaleString()} analyzed answers`}
        sentimentBreakdown={brief.summary.sentimentBreakdown}
        responseCount={brief.summary.responseCount}
        answerCount={brief.summary.answerCount}
        responseDetail="Completed event responses"
        representedFeedbackPoints={brief.summary.representedListeningPointCount}
        configuredFeedbackPoints={brief.summary.listeningPointCount}
        coverageUnit="listening points"
        coverageRows={[
          { value: brief.whatWorked.length, label: 'What worked', meta: 'Evidence-backed strength', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
          { value: brief.friction.length, label: 'Friction', meta: 'Evidence-backed issue', dot: 'bg-amber-500', bar: 'bg-amber-500' },
          { value: nextEventItems.length, label: 'Next time', meta: 'Recommendation', dot: 'bg-blue-500', bar: 'bg-blue-500' },
        ]}
        coverageDetail={(close) => <section id="coverage-detail-panel" data-testid="coverage-detail-panel" className="event-intelligence-summary-detail border-t border-slate-200 px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h2 className="text-[14px] font-bold text-slate-900">Post-event coverage</h2><p className="mt-0.5 text-[11px] text-slate-400">{brief.summary.representedListeningPointCount} of {brief.summary.listeningPointCount || brief.summary.representedListeningPointCount} listening points represented</p></div>
            <button type="button" onClick={close} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Close</button>
          </div>
          <a href={brief.links.intelligence} onClick={close} className="mt-4 inline-block text-[11px] font-semibold text-indigo-700 hover:underline">Review event intelligence →</a>
        </section>}
        followUpCount={brief.decisions.unresolvedActions.length}
        followUpDetail="Open actions and next-event learning"
        followUpDetailContent={(close) => <section id="follow-up-detail-panel" data-testid="follow-up-detail-panel" className="event-intelligence-summary-detail border-t border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-950">Open follow-up actions</p>
            <a href={brief.links.actions} onClick={close} className="text-xs font-bold text-indigo-700 hover:underline">Open Actions</a>
          </div>
          {brief.decisions.unresolvedActions.length > 0 ? <ul className="mt-3 space-y-2">
            {brief.decisions.unresolvedActions.map((action) => {
              const actionLink = new URL(brief.links.actions, 'https://signalthread.local')
              actionLink.searchParams.set('actionId', action.id)
              return <li key={action.id}><a href={`${actionLink.pathname}?${actionLink.searchParams.toString()}`} onClick={close} className="block rounded-lg border border-slate-200 px-3 py-2 text-xs hover:border-indigo-200 hover:bg-indigo-50/40"><span className="font-semibold text-slate-950">{action.title}</span><span className="mt-0.5 block text-slate-500">{ownerStatus(action)}</span></a></li>
            })}
          </ul> : <p className="mt-3 text-xs text-slate-500">No open follow-up actions.</p>}
        </section>}
        />
      </div>

      <section data-closing-brief-section aria-labelledby="post-verdict-heading">
        <h2 data-closing-brief-section-heading id="post-verdict-heading" className="text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-950 lg:text-[24px]">The verdict</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <VerdictCard eyebrow="What worked" tone="positive">
            {brief.editorial.copy.whatWorkedNarrative && <p className="text-[15px] font-normal leading-6 text-slate-700">{brief.editorial.copy.whatWorkedNarrative}</p>}
            {brief.whatWorked.slice(0, 4).map((item) => {
              const actionReference = resolveEventActionSource(
                { actions: eventActionData.actions, availableFindings: eventActionData.availableFindings },
                { clusterId: item.issueClusterIds?.[0], title: item.title, themeKeys: item.evidenceThemeKeys, evidenceLabel: 'Evidence →' },
              )
              return <EventActionableItem key={item.id} eventId={brief.event.id} accountSlug={accountSlug ?? ''} owners={eventActionData.owners} source={actionReference.source} actioned={actionReference.actioned} className="rounded-md">
                <div>
                  <p className="text-sm font-semibold leading-5">{item.title}</p>
                  <p className={`mt-1 text-xs leading-5 ${evidenceTone(item.evidenceTier)}`}>{item.mentionCount} mentions · {evidenceTierLabel(item.evidenceTier)}</p>
                </div>
              </EventActionableItem>
            })}
            {brief.whatWorked.length === 0 && <p className="text-xs leading-5 text-slate-500">No clear strength pattern was identified in the current evidence.</p>}
          </VerdictCard>
          <VerdictCard eyebrow="What created friction" tone="negative" empty={frictionPresentation !== 'populated'}>
            {brief.friction.length > 0 && brief.editorial.copy.frictionNarrative && <p className="text-[15px] font-normal leading-6 text-slate-700">{brief.editorial.copy.frictionNarrative}</p>}
            {brief.friction.slice(0, 4).map((item) => {
              const actionReference = resolveEventActionSource(
                { actions: eventActionData.actions, availableFindings: eventActionData.availableFindings },
                { clusterId: item.issueClusterIds?.[0], title: item.title, themeKeys: item.evidenceThemeKeys, evidenceLabel: 'Evidence →' },
              )
              return <EventActionableItem key={item.id} eventId={brief.event.id} accountSlug={accountSlug ?? ''} owners={eventActionData.owners} source={actionReference.source} actioned={actionReference.actioned} className="rounded-md">
                <div>
                  <p className="text-sm font-semibold leading-5">{item.title}</p>
                  <p className={`mt-1 text-xs leading-5 ${evidenceTone(item.evidenceTier)}`}>{item.mentionCount} evidence · {evidenceTierLabel(item.evidenceTier)}</p>
                </div>
              </EventActionableItem>
            })}
            {frictionPresentation !== 'populated' && (frictionPresentation === 'positive'
              ? <VerdictEmptyState tone="negative" body="We didn’t find a meaningful friction pattern in attendee feedback." supporting="That’s a strong signal the experience felt smooth overall." />
              : <VerdictEmptyState tone="negative" insufficient body="We need more analyzed attendee feedback before we can draw a reliable conclusion about friction." supporting="This card will update as more feedback is analyzed." />)}
          </VerdictCard>
          <VerdictCard eyebrow="What should change next time" tone="change" empty={nextEventPresentation !== 'populated'}>
            {nextEventItems.length > 0 && brief.editorial.copy.nextEventNarrative && <p className="text-[15px] font-normal leading-6 text-slate-700">{brief.editorial.copy.nextEventNarrative}</p>}
            {nextEventItems.slice(0, 4).map((item) => {
              const actionReference = resolveEventActionSource(
                { actions: eventActionData.actions, availableFindings: eventActionData.availableFindings },
                { clusterId: item.clusterId, title: item.title, themeKeys: item.themeKeys, evidenceLabel: 'Evidence →' },
              )
              return <EventActionableItem key={item.id} eventId={brief.event.id} accountSlug={accountSlug ?? ''} owners={eventActionData.owners} source={actionReference.source} actioned={actionReference.actioned} className="rounded-md">
                <div>
                  <p className="text-sm font-semibold leading-5">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.meta}</p>
                </div>
              </EventActionableItem>
            })}
            {nextEventPresentation !== 'populated' && (nextEventPresentation === 'positive'
              ? <VerdictEmptyState tone="change" body="Attendees didn’t surface a clear recommendation for next time." supporting="Focus on preserving what made this event work so well." />
              : <VerdictEmptyState tone="change" insufficient body="We need more analyzed attendee feedback before we can identify next-event recommendations." supporting="This card will update as more feedback is analyzed." />)}
          </VerdictCard>
        </div>
      </section>

      <section data-closing-brief-section aria-labelledby="post-findings-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 data-closing-brief-section-heading id="post-findings-heading" className="text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-950 lg:text-[24px]">Key findings</h2>
            <p className="mt-1 text-sm font-normal text-slate-500">{brief.keyFindings.length} conclusions the evidence supports</p>
          </div>
          <a href={postEventHref(brief.links.intelligence)} className="text-xs font-bold text-indigo-700 hover:underline">Open Intelligence</a>
        </div>
        <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {brief.keyFindings.map((finding) => {
            const actionReference = resolveEventActionSource(
              { actions: eventActionData.actions, availableFindings: eventActionData.availableFindings },
              { clusterId: finding.issueClusterIds?.[0], title: finding.title, themeKeys: finding.evidenceThemeKeys, evidenceLabel: 'Evidence →' },
            )
            return <article key={finding.id} className="border-t border-slate-100 px-5 py-5 first:border-t-0 sm:px-6">
              <EventActionableItem eventId={brief.event.id} accountSlug={accountSlug ?? ''} owners={eventActionData.owners} source={actionReference.source} actioned={actionReference.actioned} actionSlotAlign="center" className="rounded-lg">
              <div className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-3 gap-y-3 sm:grid-cols-[10px_minmax(0,1fr)_auto] sm:items-center">
              <span aria-hidden className="mt-1.5 h-2 w-2 rounded-full bg-slate-400 sm:mt-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5 text-slate-950">{finding.title}</p>
                {(findingNarrativeById.get(finding.id) || finding.statement) && <p className="mt-1.5 max-w-3xl text-[13px] font-normal leading-5 text-slate-600">{findingNarrativeById.get(finding.id) || finding.statement}</p>}
                <p className="mt-2 text-xs font-normal leading-5 text-slate-500">{finding.mentionCount} evidence · {confidencePercent(finding.confidence)} · <span className={`font-semibold ${evidenceTone(finding.evidenceTier)}`}>{evidenceTierLabel(finding.evidenceTier)}</span></p>
              </div>
              <button type="button" onClick={() => openFindingEvidence(finding)} disabled={(finding.evidenceThemeKeys ?? []).length === 0} className="col-span-2 inline-flex min-h-8 w-fit items-center rounded-lg border border-indigo-200 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1 sm:justify-self-end">Review evidence →</button>
              </div>
              </EventActionableItem>
            </article>
          })}
          {brief.keyFindings.length === 0 && <p className="px-6 py-5 text-sm text-slate-500">No evidence-backed finding is available yet.</p>}
        </div>
      </section>

      <EventEvidenceDrawer open={Boolean(selectedFindingEvidence)} title={selectedFindingEvidence?.title ?? 'Supporting evidence'} eyebrow="Closing brief · supporting evidence" onClose={() => { setSelectedFindingEvidence(null); setFindingEvidenceDetail(null); setFindingEvidenceError(null) }}>
        <EventThemeEvidencePanel loading={findingEvidenceLoading} error={findingEvidenceError} detail={findingEvidenceDetail} fallbackTheme={selectedFindingEvidence ? { label: selectedFindingEvidence.title, count: selectedFindingEvidence.count, sentimentLabel: selectedFindingEvidence.sentimentLabel } : null} heading="Supporting responses" onClear={() => { setSelectedFindingEvidence(null); setFindingEvidenceDetail(null); setFindingEvidenceError(null) }} />
      </EventEvidenceDrawer>

      </div>
    </section>
  )
}
