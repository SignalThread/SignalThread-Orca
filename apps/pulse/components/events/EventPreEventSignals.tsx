import { useEffect, useState } from 'react'
import type { EventIntelligenceData } from '@/components/admin/Dashboard2'
import { EventBriefAction } from '@/components/events/EventBriefAction'
import { EventLifecycleHero } from '@/components/events/EventLifecycleHero'
import { EventEvidenceDrawer } from '@/components/events/EventEvidenceDrawer'
import { EventThemeEvidencePanel } from '@/components/events/EventThemeEvidencePanel'
import {
  EventActionableItem,
  resolveEventActionSource,
  useEventActionData,
  type CanonicalEventAction,
  type EventActionOwner,
} from '@/components/events/EventActionComposer'
import type { EventThemeEvidenceResult } from '@/lib/event-intelligence/theme-evidence'
import { extractAttendeeQuestions } from '@/lib/event-intelligence/attendee-questions'
import { synthesizeEventEditorial } from '@/lib/event-intelligence/editorial-engine'
import { synthesizePreEventFindingCopy } from '@/lib/event-intelligence/finding-synthesis'

type PreEventAnalysisSummary = {
  eventName: string
  overallSummary: string | null
  overallSentiment: string | null
  totalResponses: number
  totalAnswers: number
  lastComputedAt: string
}

type PreEventFinding = {
  id: string
  evidenceThemeKey: string
  evidenceThemeKeys: string[]
  title: string
  description: string | null
  mentionCount: number
  confidence: number | null
  evidenceLabel: string
  evidenceText: string[]
  kind: 'theme' | 'signal' | 'opportunity' | 'positive' | 'risk'
  sentimentLabel: string | null
  recommendation: string | null
  targetKind?: string | null
}

/**
 * A persisted action returned by the canonical Actions endpoint. Intelligence
 * recommendations intentionally do not satisfy this contract: they must be
 * explicitly converted by an organizer before they appear here.
 */
const CLOSED_ACTION_STATUSES = new Set(['COMPLETE', 'DISMISSED', 'CANCELLED'])

export function getOpenCanonicalEventActions(actions: CanonicalEventAction[]) {
  return actions.filter((action) => !CLOSED_ACTION_STATUSES.has(action.actionStatus))
}

export type PreEventIntelligenceViewModel = {
  generatedAt: string
  headline: string
  summary: string
  takeaway: string
  sentiment: string
  analyzedAnswerCount: number
  responseCount: number
  surveyCount: number
  expectations: string[]
  concerns: string[]
  preparations: string[]
  findings: PreEventFinding[]
  attendeeQuestions: string[]
}

function uniqueText(values: Array<string | null | undefined>, limit: number) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized || seen.has(normalized.toLocaleLowerCase())) continue
    seen.add(normalized.toLocaleLowerCase())
    result.push(normalized)
    if (result.length === limit) break
  }
  return result
}

type PreEventContentItem = {
  text: string
  /** Canonical taxonomy keys let this surface collapse the same issue from a finding and an action. */
  identity?: string | null
}

function firstSentence(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalized
}

function normalizeContentText(value: string | null | undefined) {
  return firstSentence(value)
    .replace(/^attendees?\s+(?:consistently\s+)?(?:reported|said|shared|noted|found)\s+(?:that\s+)?/i, '')
    .replace(/^the\s+(?:feedback|responses?)\s+(?:show|shows|point to|points to)\s+(?:that\s+)?/i, '')
    .replace(/^([a-z])/, (_, letter: string) => letter.toUpperCase())
    .replace(/[.!?]+$/, '')
    .trim()
}

function normalizedContentKey(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function hasConcreteConclusion(value: string) {
  const words = normalizedContentKey(value).split(' ').filter(Boolean)
  return words.length >= 4
    && !value.trim().endsWith('?')
    && /\b(?:is|are|was|were|needs?|need|remains?|remain|hiding|blocking|delaying|causing|making|creating|unclear|missing|limited|rushed|difficult|hard|cannot|could not|did not|want|wanted|ask|asked|mention|mentioned|report|reported|found)\b/i.test(value)
}

function hasGenericConcernLabel(value: string) {
  const normalized = normalizedContentKey(value)
  return /\b(?:concerns?|issues?|challenges?)\b/.test(normalized)
    || !hasConcreteConclusion(value)
}

function uniquePreEventContent(items: PreEventContentItem[], limit: number) {
  const seenText = new Set<string>()
  const seenIdentities = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const text = normalizeContentText(item.text)
    const textKey = normalizedContentKey(text)
    const identity = item.identity?.trim().toLocaleLowerCase()
    if (!textKey || seenText.has(textKey) || (identity && seenIdentities.has(identity))) continue
    seenText.add(textKey)
    if (identity) seenIdentities.add(identity)
    result.push(text)
    if (result.length === limit) break
  }
  return result
}

function findingIdentity(finding: PreEventFinding) {
  return finding.evidenceThemeKeys?.[0] ?? finding.evidenceThemeKey
}

function concernFromFinding(finding: PreEventFinding): PreEventContentItem | null {
  const title = normalizeContentText(finding.title)
  const description = normalizeContentText(finding.description)
  const text = !hasGenericConcernLabel(title)
    ? title
    : hasConcreteConclusion(description)
      ? description
      : null
  return text ? { text, identity: findingIdentity(finding) } : null
}

function concernFromAttentionItem(item: NonNullable<EventIntelligenceData['attentionQueue']>[number]): PreEventContentItem | null {
  const title = normalizeContentText(item.title)
  const summary = normalizeContentText(item.summary)
  const text = !hasGenericConcernLabel(title)
    ? title
    : hasConcreteConclusion(summary)
      ? summary
      : null
  return text ? { text, identity: item.taxonomyKey } : null
}

function preparationFromAction(value: string | null | undefined, identity?: string | null): PreEventContentItem | null {
  const text = normalizeContentText(value)
    .replace(/^consider\s+(?:this\s+)?attendee\s+signal\s+while\s+(?:finalizing|planning)[^:]*:\s*/i, '')
    .trim()
  return text ? { text, identity } : null
}

function evidenceLabel(strength: PreEventFinding['kind'] | string, tier?: string) {
  if (tier === 'STRONG') return 'Strong evidence'
  if (tier === 'REPEATED') return 'Repeated evidence'
  if (tier === 'EMERGING') return 'Emerging signal'
  if (tier === 'ISOLATED') return 'Limited evidence'
  if (strength === 'positive') return 'Positive evidence'
  if (strength === 'signal') return 'Emerging signal'
  if (strength === 'risk') return 'Needs review'
  return 'Directional evidence'
}

function displaySentiment(value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized) return 'Not enough data'
  const labels: Record<string, string> = {
    POSITIVE: 'Mostly positive',
    NEGATIVE: 'Mostly negative',
    MIXED: 'Mixed',
    NEUTRAL: 'Neutral',
    UNKNOWN: 'Not enough data',
  }
  return labels[normalized.toUpperCase()] ?? normalized.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function fallbackFinding(
  theme: EventIntelligenceData['topThemes'][number],
  index: number,
): PreEventFinding {
  return {
    id: `theme-${theme.themeKey || index}`,
    evidenceThemeKey: theme.themeKey,
    evidenceThemeKeys: [theme.themeKey],
    title: theme.label,
    description: theme.statement ?? null,
    mentionCount: theme.count,
    confidence: theme.confidence,
    evidenceLabel: theme.count >= 5 ? 'Repeated evidence' : 'Emerging signal',
    evidenceText: theme.evidenceText ?? [],
    kind: theme.questionIntent === 'strength'
      ? 'positive'
      : theme.questionIntent === 'friction'
        ? 'risk'
        : theme.count < 3
          ? 'signal'
          : 'theme',
    sentimentLabel: theme.sentimentLabel,
    recommendation: null,
  }
}

export function buildPreEventIntelligenceViewModel({
  surveyCount,
  analysis,
  intelligence,
}: {
  /** Surveys that actually received responses; never setup/readiness state. */
  surveyCount: number
  analysis: PreEventAnalysisSummary
  intelligence: EventIntelligenceData | null
}): PreEventIntelligenceViewModel {
  const mappedFindings: PreEventFinding[] = intelligence?.canonicalFindings?.length
    ? intelligence.canonicalFindings.slice(0, 8).map((finding) => ({
      id: finding.id,
      evidenceThemeKey: finding.evidenceThemeKey,
      evidenceThemeKeys: finding.evidenceThemeKeys,
      title: finding.title,
      description: finding.description,
      mentionCount: finding.mentionCount,
      confidence: finding.confidence,
      evidenceLabel: evidenceLabel(finding.kind, finding.evidenceTier),
      evidenceText: finding.evidenceText,
      kind: finding.kind,
      sentimentLabel: finding.sentimentLabel,
      recommendation: finding.recommendation,
      targetKind: finding.targetKind,
    }))
    : (intelligence?.topThemes ?? []).slice(0, 8).map(fallbackFinding)
  const sourceFindings = mappedFindings
    .filter((finding, index) => mappedFindings.findIndex((candidate) => candidate.title.trim().toLowerCase() === finding.title.trim().toLowerCase()) === index)
  const findings = sourceFindings.map((finding) => {
      const copy = synthesizePreEventFindingCopy({
        title: finding.title,
        statement: finding.description,
        kind: finding.kind,
        recommendation: finding.recommendation,
        evidenceText: finding.evidenceText,
      })
      return { ...finding, title: copy.title, description: copy.description }
    })

  const responseCount = intelligence?.responseCount ?? analysis.totalResponses
  const analyzedAnswerCount = intelligence?.answerCount ?? analysis.totalAnswers
  const expectations = uniqueText([
    ...sourceFindings.filter((finding) => finding.kind === 'positive').map((finding) => finding.title),
    ...sourceFindings.filter((finding) => finding.kind === 'theme' && !finding.sentimentLabel?.toLowerCase().includes('negative')).map((finding) => finding.title),
    ...(intelligence?.topThemes ?? []).filter((theme) => theme.questionIntent === 'strength' || theme.questionIntent === 'neutral').map((theme) => theme.label),
  ], 4)
  const concerns = uniquePreEventContent([
    ...(intelligence?.attentionQueue ?? []).map(concernFromAttentionItem).filter((item): item is PreEventContentItem => item !== null),
    ...sourceFindings
      .filter((finding) => finding.kind === 'risk' || finding.kind === 'signal' || finding.sentimentLabel?.toLowerCase().includes('negative'))
      .map(concernFromFinding)
      .filter((item): item is PreEventContentItem => item !== null),
  ], 4)
  const preparations = uniquePreEventContent([
    ...sourceFindings.map((finding) => preparationFromAction(finding.recommendation, findingIdentity(finding))).filter((item): item is PreEventContentItem => item !== null),
    ...(intelligence?.topActions ?? []).map((action) => preparationFromAction(action.title, action.themeKey)).filter((item): item is PreEventContentItem => item !== null),
    ...sourceFindings
      .filter((finding) => finding.kind === 'opportunity')
      .map((finding) => preparationFromAction(finding.title, findingIdentity(finding)))
      .filter((item): item is PreEventContentItem => item !== null),
  ], 4)
  const attendeeQuestions = intelligence?.attendeeQuestions?.length
    ? intelligence.attendeeQuestions
    : extractAttendeeQuestions(sourceFindings.flatMap((finding) => finding.evidenceText))
  const editorial = synthesizeEventEditorial({
    lifecycle: 'PRE_EVENT',
    eventName: analysis.eventName,
    facts: sourceFindings.map((finding) => ({
      title: finding.title,
      statement: finding.description,
      kind: finding.kind === 'positive' ? 'positive' : finding.kind === 'risk' ? 'risk' : finding.kind === 'signal' ? 'signal' : finding.kind === 'opportunity' ? 'opportunity' : 'theme',
      evidenceTier: finding.evidenceLabel.includes('Strong') ? 'STRONG' : finding.evidenceLabel.includes('Repeated') ? 'REPEATED' : finding.evidenceLabel.includes('Emerging') ? 'EMERGING' : 'ISOLATED',
      mentionCount: finding.mentionCount,
      sentimentLabel: finding.sentimentLabel,
      scope: finding.targetKind,
    })),
  })

  return {
    generatedAt: intelligence?.eventPulse.lastComputedAt ?? analysis.lastComputedAt,
    headline: editorial.headline,
    summary: editorial.synopsis,
    takeaway: editorial.keyTakeaway,
    sentiment: displaySentiment(intelligence?.eventPulse.sentimentLabel || analysis.overallSentiment),
    analyzedAnswerCount,
    responseCount,
    surveyCount,
    expectations,
    concerns,
    preparations,
    findings,
    attendeeQuestions,
  }
}

function confidenceLabel(confidence: number | null) {
  if (confidence === null) return 'Confidence not scored'
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}% confidence`
}

function SignalsCard({
  title,
  items,
  tone,
  emptyMessage,
  eventId,
  accountSlug,
  owners,
  sourceFor,
  actionedFor,
}: {
  title: string
  items: string[]
  tone: 'expect' | 'concern' | 'prepare'
  emptyMessage: string
  eventId: string
  accountSlug: string
  owners: EventActionOwner[]
  sourceFor: (item: string) => { clusterId?: string; title: string; evidenceLabel?: string }
  actionedFor: (item: string) => boolean
}) {
  const styles = {
    expect: { border: 'border-t-emerald-500', text: 'text-emerald-700', dot: 'bg-emerald-50 text-emerald-700', glyph: '✓' },
    concern: { border: 'border-t-rose-500', text: 'text-rose-600', dot: 'bg-rose-50 text-rose-600', glyph: '!' },
    prepare: { border: 'border-t-indigo-500', text: 'text-indigo-700', dot: 'bg-indigo-50 text-indigo-700', glyph: '→' },
  }[tone]

  return (
    <article className={`rounded-[18px] border border-slate-200 border-t-[3px] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${styles.border}`}>
      <h3 className={`text-[12px] font-semibold uppercase tracking-[0.13em] ${styles.text}`}>{title}</h3>
      {items.length ? (
        <ul className="mt-4 space-y-4">
          {items.map((item) => <li key={item}><EventActionableItem eventId={eventId} accountSlug={accountSlug} owners={owners} source={sourceFor(item)} actioned={actionedFor(item)} className="rounded-lg text-[13px] leading-5 text-slate-700"><span className="flex min-w-0 gap-3"><span aria-hidden className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${styles.dot}`}>{styles.glyph}</span><span>{item}</span></span></EventActionableItem></li>)}
        </ul>
      ) : <p className="mt-5 text-sm leading-6 text-slate-500">{emptyMessage}</p>}
    </article>
  )
}

export function EventPreEventSignals({
  surveyCount,
  analysis,
  intelligence,
  intelligenceLoading,
  intelligenceError,
  eventId,
  accountSlug,
}: {
  surveyCount: number
  analysis: PreEventAnalysisSummary
  intelligence: EventIntelligenceData | null
  intelligenceLoading: boolean
  intelligenceError: string | null
  eventId: string
  accountSlug: string
}) {
  const view = buildPreEventIntelligenceViewModel({ surveyCount, analysis, intelligence })
  const [selectedFinding, setSelectedFinding] = useState<PreEventFinding | null>(null)
  const [evidenceDetail, setEvidenceDetail] = useState<EventThemeEvidenceResult | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const { actions: canonicalActions, availableFindings: canonicalActionFindings, owners: actionOwners, loading: actionsLoading } = useEventActionData(eventId, accountSlug)
  const preCoverageRows = [
    { value: view.findings.filter((finding) => finding.evidenceLabel === 'Strong evidence').length, label: 'Strong evidence', meta: 'High confidence', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
    { value: view.findings.filter((finding) => finding.evidenceLabel !== 'Strong evidence').length, label: 'Emerging evidence', meta: 'Building signal', dot: 'bg-amber-500', bar: 'bg-amber-500' },
  ]
  const preEventActions = getOpenCanonicalEventActions(canonicalActions)
  const preEventActionsHref = `/app/events/${encodeURIComponent(eventId)}/dashboard?${new URLSearchParams({ account: accountSlug, tab: 'actions' }).toString()}`
  const sourceForIntelligenceText = (title: string) => {
    const normalized = normalizedContentKey(title)
    const cluster = intelligence?.attentionQueue?.find((item) => {
      const candidates = [item.title, item.summary, item.recommendedNextStep].filter((value): value is string => Boolean(value))
      return candidates.some((value) => normalizedContentKey(value) === normalized || normalizedContentKey(value).includes(normalized) || normalized.includes(normalizedContentKey(value)))
    })
    return resolveEventActionSource(
      { actions: canonicalActions, availableFindings: canonicalActionFindings },
      { clusterId: cluster?.id, title, themeKeys: cluster ? [cluster.taxonomyKey] : [], evidenceLabel: cluster ? 'Evidence →' : undefined },
    ).source
  }
  const actionedForIntelligenceText = (title: string) => {
    const source = sourceForIntelligenceText(title)
    return Boolean(source.clusterId && canonicalActions.some((action) => action.id === source.clusterId))
  }

  useEffect(() => {
    if (!selectedFinding || !accountSlug) return
    let cancelled = false
    setEvidenceLoading(true)
    setEvidenceError(null)
    setEvidenceDetail(null)
    const query = new URLSearchParams({ account: accountSlug })
    if (selectedFinding.evidenceThemeKeys.length > 1) query.set('themeKeys', selectedFinding.evidenceThemeKeys.join(','))
    fetch(`/api/app/events/${encodeURIComponent(eventId)}/themes/${encodeURIComponent(selectedFinding.evidenceThemeKey)}/evidence?${query.toString()}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load supporting responses')
        if (!cancelled) setEvidenceDetail(body.data as EventThemeEvidenceResult)
      })
      .catch((cause) => { if (!cancelled) setEvidenceError(cause instanceof Error ? cause.message : 'Unable to load supporting responses') })
      .finally(() => { if (!cancelled) setEvidenceLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, eventId, selectedFinding])

  const closeEvidence = () => {
    setSelectedFinding(null)
    setEvidenceDetail(null)
    setEvidenceError(null)
  }

  return (
    <section data-testid="pre-event-intelligence" className="font-brand mx-auto max-w-[1176px] space-y-5 text-slate-950">
      {intelligenceError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Pre-event intelligence could not be refreshed. Showing the latest available summary.</p>}
      {intelligenceLoading && <p role="status" className="sr-only">Refreshing pre-event intelligence</p>}

      <EventLifecycleHero
        title="Event overview"
        synopsis={view.responseCount >= 3 && view.analyzedAnswerCount >= 3 ? view.headline : null}
        overview={`${view.summary} ${view.takeaway}`}
        briefAction={<EventBriefAction eventId={eventId} accountSlug={accountSlug} lifecyclePhase="PRE_EVENT" />}
        sentimentPercent={null}
        sentimentDisplay={view.sentiment}
        sentimentDetail={`Based on ${view.analyzedAnswerCount.toLocaleString()} analyzed answers`}
        sentimentBreakdown={{ favorable: 0, neutral: 0, negative: 0, total: 0 }}
        responseCount={view.responseCount}
        answerCount={view.analyzedAnswerCount}
        responseDetail={view.surveyCount > 0 ? `Across ${view.surveyCount} pre-event survey${view.surveyCount === 1 ? '' : 's'}` : 'No responding pre-event surveys yet'}
        representedFeedbackPoints={view.findings.length}
        configuredFeedbackPoints={view.findings.length}
        coverageUnit="evidenced findings"
        coverageRows={preCoverageRows}
        coverageDetail={(close) => <section id="coverage-detail-panel" data-testid="coverage-detail-panel" className="event-intelligence-summary-detail border-t border-slate-200 px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h2 className="text-[14px] font-bold text-slate-900">Pre-event coverage</h2><p className="mt-0.5 text-[11px] text-slate-400">{view.findings.length} evidence-backed finding{view.findings.length === 1 ? '' : 's'} from attendee feedback</p></div>
            <button type="button" onClick={close} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Close</button>
          </div>
          <div className="event-intelligence-summary-detail-grid mt-4 grid min-w-0 gap-3">
            {preCoverageRows.map((row) => <div key={row.label} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-4 py-3"><span className={`size-2.5 shrink-0 rounded-full ${row.dot}`} /><span className="text-[20px] font-bold tracking-[-0.03em] text-slate-950">{row.value}</span><span className="min-w-0"><span className="block text-[12px] font-semibold text-slate-700">{row.label}</span><span className="block text-[11px] text-slate-400">{row.meta}</span></span></div>)}
          </div>
          <a href="#pre-event-key-findings" onClick={close} className="mt-4 inline-block text-[11px] font-semibold text-indigo-700 hover:underline">Review pre-event findings →</a>
        </section>}
        followUpCount={preEventActions.length}
        followUpDetail={actionsLoading ? 'Loading user-created actions' : preEventActions.length > 0 ? 'User-created actions with open work' : 'No user-created actions open'}
        followUpDetailContent={(close) => <section id="follow-up-detail-panel" data-testid="follow-up-detail-panel" className="event-intelligence-summary-detail border-t border-slate-200 px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h2 className="text-[14px] font-bold text-slate-900">Follow-up actions</h2><p className="mt-0.5 text-[11px] text-slate-400">Actions explicitly created by your team</p></div>
            <div className="flex items-center gap-4">{canonicalActions.length > 0 && <a href={preEventActionsHref} onClick={close} className="text-[11px] font-semibold text-indigo-700 hover:underline">Open the Actions workspace →</a>}<button type="button" onClick={close} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Close</button></div>
          </div>
          {actionsLoading ? <p className="mt-3 text-xs text-slate-500">Loading user-created actions…</p> : preEventActions.length > 0 ? <ul className="mt-4 space-y-2">{preEventActions.slice(0, 4).map((action) => <li key={action.id}><a href={`${preEventActionsHref}&actionId=${encodeURIComponent(action.id)}`} onClick={close} className="block rounded-lg border border-slate-200 px-3 py-2 text-xs hover:border-indigo-200 hover:bg-indigo-50/40"><span className="font-semibold text-slate-950">{action.title}</span>{action.summary && <span className="mt-0.5 block text-slate-500">{action.summary}</span>}</a></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">No user-created follow-up actions are open.</p>}
        </section>}
      />

      <section aria-labelledby="pre-event-hearing-heading">
        <h2 id="pre-event-hearing-heading" className="text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[24px]">What we’re hearing before the event</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SignalsCard title="What attendees are asking" items={view.attendeeQuestions} tone="expect" emptyMessage="Attendee questions will appear as analyzed pre-event feedback accumulates." eventId={eventId} accountSlug={accountSlug} owners={actionOwners} sourceFor={sourceForIntelligenceText} actionedFor={actionedForIntelligenceText} />
          <SignalsCard title="What concerns are emerging" items={view.concerns} tone="concern" emptyMessage="No recurring concern is supported by the current pre-event evidence." eventId={eventId} accountSlug={accountSlug} owners={actionOwners} sourceFor={sourceForIntelligenceText} actionedFor={actionedForIntelligenceText} />
          <SignalsCard title="What to prepare for" items={view.preparations} tone="prepare" emptyMessage="Preparation guidance will appear when the evidence supports a clear recommendation." eventId={eventId} accountSlug={accountSlug} owners={actionOwners} sourceFor={sourceForIntelligenceText} actionedFor={actionedForIntelligenceText} />
        </div>
      </section>

      {view.attendeeQuestions.length > 0 && <section aria-labelledby="pre-event-questions-heading" className="rounded-[18px] border border-slate-200 bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="pre-event-questions-heading" className="text-[19px] font-semibold tracking-[-0.015em]">Questions attendees want answered</h2><p className="mt-1 text-xs text-slate-500">Questions surfaced directly from analyzed pre-event responses</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{view.attendeeQuestions.map((question) => <EventActionableItem key={question} eventId={eventId} accountSlug={accountSlug} owners={actionOwners} source={sourceForIntelligenceText(question)} actioned={actionedForIntelligenceText(question)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm"><span className="px-1">{question}</span></EventActionableItem>)}</div>
      </section>}

      <section id="pre-event-key-findings" aria-labelledby="pre-event-findings-heading">
        <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2"><div><h2 id="pre-event-findings-heading" className="text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] lg:text-[24px]">Key findings</h2><p className="mt-1 text-sm text-slate-500">{view.findings.length} evidence-backed insight{view.findings.length === 1 ? '' : 's'} from early attendee feedback</p></div><p aria-label="Finding color key" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500"><span><i aria-hidden className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />Strength</span><span><i aria-hidden className="mr-1 inline-block size-2 rounded-full bg-amber-500" />Watch</span><span><i aria-hidden className="mr-1 inline-block size-2 rounded-full bg-rose-500" />Friction</span><span><i aria-hidden className="mr-1 inline-block size-2 rounded-full bg-indigo-500" />Theme / opportunity</span></p></div>
        <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {view.findings.map((finding) => (
            <article key={finding.id} className="border-t border-slate-100 px-5 py-5 first:border-t-0 sm:px-6">
              <EventActionableItem eventId={eventId} accountSlug={accountSlug} owners={actionOwners} source={{ clusterId: intelligence?.attentionQueue?.find((item) => item.id && finding.evidenceThemeKeys.includes(item.taxonomyKey))?.id ?? undefined, title: finding.title, evidenceLabel: 'Evidence →' }} actioned={canonicalActions.some((action) => action.id === intelligence?.attentionQueue?.find((item) => item.id && finding.evidenceThemeKeys.includes(item.taxonomyKey))?.id)} className="rounded-lg">
              <div className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-3 gap-y-3 sm:grid-cols-[10px_minmax(0,1fr)_auto] sm:items-center">
                <span aria-hidden className={`mt-1.5 h-2 w-2 rounded-full sm:mt-0 ${finding.kind === 'positive' ? 'bg-emerald-500' : finding.kind === 'risk' ? 'bg-rose-500' : finding.kind === 'signal' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
                <div className="min-w-0"><h3 className="text-sm font-semibold leading-5 text-slate-950">{finding.title}</h3><p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-slate-600">{finding.description}</p><p className="mt-2 text-xs leading-5 text-slate-500">{finding.mentionCount} evidence point{finding.mentionCount === 1 ? '' : 's'} · {confidenceLabel(finding.confidence)} · <span className="font-semibold text-slate-700">{finding.evidenceLabel}</span></p></div>
                <button type="button" onClick={() => setSelectedFinding(finding)} disabled={!finding.evidenceThemeKey} className="col-span-2 inline-flex min-h-8 w-fit items-center rounded-lg border border-indigo-200 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1 sm:justify-self-end">Review evidence →</button>
              </div>
              </EventActionableItem>
            </article>
          ))}
          {view.findings.length === 0 && <p className="px-6 py-6 text-sm text-slate-500">No evidence-backed pre-event finding is available yet.</p>}
        </div>
      </section>

      <EventEvidenceDrawer open={Boolean(selectedFinding)} title={selectedFinding?.title ?? 'Supporting evidence'} eyebrow="Pre-event · survey evidence" summary="Survey-derived attendee feedback supporting this planning signal." onClose={closeEvidence}>
        <div className="space-y-4"><EventThemeEvidencePanel loading={evidenceLoading} error={evidenceError} detail={evidenceDetail} fallbackTheme={selectedFinding ? { label: selectedFinding.title, count: selectedFinding.mentionCount, sentimentLabel: selectedFinding.sentimentLabel } : null} heading="Supporting survey responses" onClear={closeEvidence} />
        </div>
      </EventEvidenceDrawer>
    </section>
  )
}
