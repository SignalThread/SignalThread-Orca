import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { getInferredSatisfactionSummary } from './Dashboard2'

const dashboardSource = fs.readFileSync(
  path.join(process.cwd(), 'components/admin/Dashboard2.tsx'),
  'utf8',
)
const evidencePanelSource = fs.readFileSync(
  path.join(process.cwd(), 'components/events/EventThemeEvidencePanel.tsx'),
  'utf8',
)

// Satisfaction bucket labels live in the shared analytics helper so Events Home
// and the Command Center share one definition.
const satisfactionSource = fs.readFileSync(
  path.join(process.cwd(), 'lib/analytics/satisfaction.ts'),
  'utf8',
)

describe('getInferredSatisfactionSummary', () => {
  it('buckets analyzed sentiment scores and calculates favorable satisfaction percentage', () => {
    const summary = getInferredSatisfactionSummary({
      answerCount: 15,
      avgSentiment: 0.1,
      targetBreakdown: [],
      questionBreakdown: [
        { answerCount: 2, avgSentiment: 0.6 },
        { answerCount: 3, avgSentiment: 0.2 },
        { answerCount: 1, avgSentiment: 0.19 },
        { answerCount: 2, avgSentiment: -0.2 },
        { answerCount: 2, avgSentiment: -0.6 },
        { answerCount: 5, avgSentiment: null },
      ],
    } as never)

    expect(summary.totalAnalyzed).toBe(10)
    expect(summary.favorableCount).toBe(5)
    expect(summary.scorePercent).toBe(50)
    expect(summary.buckets).toEqual([
      { key: 'verySatisfied', label: 'Very satisfied', count: 2 },
      { key: 'satisfied', label: 'Satisfied', count: 3 },
      { key: 'neutral', label: 'Neutral', count: 1 },
      { key: 'dissatisfied', label: 'Dissatisfied', count: 2 },
      { key: 'veryDissatisfied', label: 'Very dissatisfied', count: 2 },
    ])
  })

  it('returns N/A-ready values when no sentiment data exists', () => {
    const summary = getInferredSatisfactionSummary({
      answerCount: 0,
      avgSentiment: null,
      targetBreakdown: [],
      questionBreakdown: [],
    } as never)

    expect(summary.totalAnalyzed).toBe(0)
    expect(summary.favorableCount).toBe(0)
    expect(summary.scorePercent).toBeNull()
  })
})

describe('Dashboard2 event intelligence UI', () => {
  it('accepts explicit intelligence props from the event detail page', () => {
    expect(dashboardSource).toContain('export interface EventIntelligenceData')
    expect(dashboardSource).toContain('intelligenceData: EventIntelligenceData | null')
    expect(dashboardSource).toContain('intelligenceLoading: boolean')
    expect(dashboardSource).toContain('intelligenceError: string | null')
    expect(dashboardSource).toContain('activeIntelligenceFilter?:')
    expect(dashboardSource).toContain('onFilterByTarget?:')
    expect(dashboardSource).toContain('onFilterByQuestion?:')
    expect(dashboardSource).toContain('onClearIntelligenceFilter?:')
    expect(dashboardSource).toContain('dashboardSelection: EventDashboardSelection')
    expect(dashboardSource).toContain('surveyScopeLabel?: string')
    expect(dashboardSource).toContain("surveyScopeMode?: 'all' | 'survey'")
  })

  it('renders dashboard survey scope and serializes canonical scope for theme evidence', () => {
    expect(dashboardSource).toContain('dashboardSelection,')
    expect(dashboardSource).toContain("surveyScopeLabel = 'All Surveys'")
    expect(dashboardSource).toContain("surveyScopeMode = 'all'")
    expect(dashboardSource).toContain("Scope: {surveyScopeMode === 'survey' ? surveyScopeLabel : 'All Surveys'}")
    expect(dashboardSource).toContain("kind: 'evidence'")
    expect(dashboardSource).toContain('selection: dashboardSelection')
    expect(dashboardSource).toContain('/themes/${encodeURIComponent(selectedThemeKey)}/evidence?${params.toString()}')
  })

  it('renders every scoped structured metric with rating distributions and a Yes/No split', () => {
    expect(dashboardSource).toContain('structuredMetrics.map((metric)')
    expect(dashboardSource).toContain("metric.questionType === 'YES_NO'")
    expect(dashboardSource).toContain("metric.distribution['1']")
    expect(dashboardSource).toContain("metric.distribution['0']")
    expect(dashboardSource).toContain('Object.entries(metric.distribution)')
    expect(dashboardSource).toContain('metric.surveyName')
    expect(dashboardSource).toContain('metric.surveyTargetName')
    expect(dashboardSource).not.toContain('ratingMetric = structuredMetrics.find')
  })

  it('keeps evidence sentiment internal unless a row is explicitly evaluative', () => {
    expect(evidencePanelSource).toContain('function displayableSentimentLabel')
    expect(evidencePanelSource).toContain("normalized === 'POSITIVE' || normalized === 'NEGATIVE' || normalized === 'MIXED'")
    expect(evidencePanelSource).toContain('const sentimentLabel = displayableSentimentLabel(row.sentimentLabel)')
    expect(evidencePanelSource).not.toContain('formatScore(')
    expect(evidencePanelSource).not.toContain('Contrasting evidence')
  })

  it('renders the in-event Overview hierarchy from normalized intelligence data', () => {
    expect(dashboardSource).toContain('Event overview')
    expect(dashboardSource).toContain('Priority Mix')
    expect(dashboardSource).toContain('What needs review')
    expect(dashboardSource).toContain('What is working')
    expect(dashboardSource).toContain('Coverage and confidence')
    expect(dashboardSource).toContain('Open follow-up')
    expect(dashboardSource).toContain('Keep, improve, and revisit')
    expect(dashboardSource).toContain('Improve during this event')
    expect(dashboardSource).toContain('Revisit next event')
    expect(dashboardSource).toContain('Selected Issue Detail')
    expect(dashboardSource).toContain('Attendee evidence')
    expect(dashboardSource).toContain('Responses')
    expect(dashboardSource).toContain('Answers analyzed')
    expect(dashboardSource).toContain('Active attention')
    expect(dashboardSource).toContain('Affected areas')
    expect(dashboardSource).toContain('Event status')
    expect(dashboardSource).toContain('Inferred Satisfaction')
    expect(dashboardSource).not.toContain('Intelligence Layer')
    expect(dashboardSource).not.toContain('Patterns and Opportunities')
    expect(dashboardSource).not.toContain('Feedback Sources')
    // Coverage is labeled as evidence volume, never implied sentiment.
    expect(dashboardSource).toContain('Answer volume shows coverage; confidence describes evidence strength')
    expect(dashboardSource).toContain('buildInEventOverview')
  })

  it('uses the lifecycle-independent factual snapshot for the in-event hero', () => {
    expect(dashboardSource).toContain("import { buildEventIntelligenceFactualSnapshot } from '@/lib/event-intelligence/factual-snapshot'")
    expect(dashboardSource).toContain('const factualSnapshot = intelligenceData')
    expect(dashboardSource).toContain('representedFeedbackPoints={representedTargetCount}')
    expect(dashboardSource).toContain('configuredFeedbackPoints={factualSnapshot?.coverage.configuredFeedbackPoints ?? 0}')
    expect(dashboardSource).toContain('sentimentBreakdown={factualSnapshot?.sentiment')
  })

  it('removes old SMB dashboard blocks from the event command center', () => {
    expect(dashboardSource).not.toContain('Overall Pulse')
    expect(dashboardSource).not.toContain('Key Insights')
    expect(dashboardSource).not.toContain('Momentum')
    expect(dashboardSource).not.toContain('Monthly Average')
    expect(dashboardSource).not.toContain('Engagement')
    expect(dashboardSource).not.toContain('Google Review')
    expect(dashboardSource).not.toContain('storefront')
    expect(dashboardSource).not.toContain('local business')
    expect(dashboardSource).not.toContain('reputation')
    expect(dashboardSource).not.toContain('customers')
    expect(dashboardSource).not.toContain('InsightDrilldownDrawer')
    expect(dashboardSource).not.toContain('InfoTooltip')
  })

  it('uses a light product-consistent command-center shell', () => {
    expect(dashboardSource).toContain('rounded-xl border border-slate-200 bg-white p-5 shadow-sm')
    expect(dashboardSource).toContain('order-2 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start')
    expect(dashboardSource).toContain('ref={setNeedsAttentionPanelRef} data-testid="needs-attention-panel" className="rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm"')
    expect(dashboardSource).toContain('divide-y divide-slate-200')
    expect(dashboardSource).not.toContain('Signal Context')
    expect(dashboardSource).not.toContain('bg-slate-950 text-slate-100')
    expect(dashboardSource).not.toContain('bg-slate-900')
    expect(dashboardSource).not.toContain('border-slate-800')
    expect(dashboardSource).not.toContain('text-slate-100')
  })

  it('renders one clear coverage filter model only when stable IDs exist', () => {
    expect(dashboardSource).not.toContain('Filtered by {activeIntelligenceFilter.type}: {activeIntelligenceFilter.label}')
    expect(dashboardSource).toContain('Clear coverage filter')
    expect(dashboardSource).toContain('onClick={onClearIntelligenceFilter}')
    expect(dashboardSource).toContain("activeIntelligenceFilter?.type === 'target'")
    expect(dashboardSource).toContain("activeIntelligenceFilter?.type === 'question'")
    expect(dashboardSource).toContain('target.surveyTargetId && onFilterByTarget')
    expect(dashboardSource).toContain('onFilterByTarget({ surveyTargetId: target.surveyTargetId!, label: target.name })')
    expect(dashboardSource).toContain('question.questionId && onFilterByQuestion')
    expect(dashboardSource).toContain('onFilterByQuestion({ questionId: question.questionId!, label: question.label })')
    expect(dashboardSource).toContain('function SourceRow(')
    expect(dashboardSource).toContain('if (onClick)')
    expect(dashboardSource).toContain('<button')
    expect(dashboardSource).toContain('<div className="space-y-1.5 p-1.5">')
  })

  it('folds recommended actions into the Needs Attention Now cards instead of a separate section', () => {
    // The standalone "Top Recommended Actions" strip is consolidated away; each
    // attention card now carries its recommended action inline from real data.
    expect(dashboardSource).not.toContain('Top Recommended Actions')
    expect(dashboardSource).toContain('Recommended action')
    expect(dashboardSource).toContain('{item.recommendedNextStep}')
    // Per-card Copy brief reuses the existing pure brief formatter (no fake data).
    expect(dashboardSource).toContain('formatActionBriefText(briefFromAttentionItem(item))')
    expect(dashboardSource).toContain('Copy brief')
    // The queue card itself stays focused on the signal; workflow controls live
    // in the selected alert detail rather than being repeated on every row.
    expect(dashboardSource).not.toContain('action.cta')
    expect(dashboardSource).toContain('Owner')
    expect(dashboardSource).toContain('Add note')
  })

  it('uses attentionQueue while preserving legacy intelligence fields safely', () => {
    expect(dashboardSource).toContain('attentionQueue?: EventIntelligenceAttentionItem[]')
    expect(dashboardSource).toContain('const attentionQueue = intelligenceData?.attentionQueue ?? []')
    expect(dashboardSource).toContain('representativeEvidence')
    expect(dashboardSource).toContain('selectedAttentionItem')
    expect(dashboardSource).toContain('selectedIssueDetailItem')
    expect(dashboardSource).toContain('selectedEvidence')
    expect(dashboardSource).not.toContain('selectedAttentionId')
    expect(dashboardSource).not.toContain('setSelectedAttentionId')
    expect(dashboardSource).toContain('evidence?.id && accountSlug')
    expect(dashboardSource).toContain('selectedIssueEvidenceId')
    expect(dashboardSource).toContain(
      'selectedIssueEvidence.find((evidence) => evidence.id === selectedIssueEvidenceId)',
    )
    expect(dashboardSource).not.toContain('selectedEvidence?.id && accountSlug')
    expect(dashboardSource).toContain('displayAttentionQueue')
    expect(dashboardSource).toContain('visibleAttentionQueue')
    expect(dashboardSource).toContain('attentionStatusOverrides')
    expect(dashboardSource).toContain('const attentionContent = (')
    expect(dashboardSource).toContain('onClick={() => openAttentionEvidence(item, evidence.id)}')
    expect(dashboardSource).toContain('topIntelligenceThemes')
    expect(dashboardSource).toContain('topIntelligenceActions')
    expect(dashboardSource).not.toContain('>Urgent Issues<')
    expect(dashboardSource).not.toContain('hardcoded')
  })

  it('caps the attention queue by default and exposes a real local toggle', () => {
    expect(dashboardSource).toContain('const ATTENTION_QUEUE_PREVIEW_LIMIT = 6')
    expect(dashboardSource).toContain('const [showAllAttentionQueue, setShowAllAttentionQueue] = useState(false)')
    expect(dashboardSource).toContain('const queueHasOverflow = filteredAttentionQueue.length > ATTENTION_QUEUE_PREVIEW_LIMIT')
    expect(dashboardSource).toContain('filteredAttentionQueue.slice(0, ATTENTION_QUEUE_PREVIEW_LIMIT)')
    expect(dashboardSource).toContain('{visibleAttentionQueue.map((item) => {')
    expect(dashboardSource).toContain('Showing {visibleAttentionQueue.length} of {filteredAttentionQueue.length} attention items')
    expect(dashboardSource).toContain('onClick={() => setShowAllAttentionQueue((current) => !current)}')
    expect(dashboardSource).toContain("{showAllAttentionQueue ? 'Show fewer' : 'Show all'}")
    expect(dashboardSource).not.toContain('displayAttentionQueue.slice(0, 10)')
  })

  it('consumes the server canonical finding set instead of rebuilding surface-specific identity', () => {
    expect(dashboardSource).toContain('const intelligenceFindings = intelligenceData?.canonicalFindings ?? buildEventIntelligenceFindings')
    expect(dashboardSource).toContain('const canonicalOverviewThemes = intelligenceFindings')
  })

  it('wires a guided, event-scoped alert workflow in selected detail', () => {
    expect(dashboardSource).toContain('type EventIssueClusterStatus')
    expect(dashboardSource).toContain('nextAlertAction(selectedAttentionItem.status)')
    expect(dashboardSource).toContain("updateAttentionStatus(selectedAttentionItem.id!, action.status, actionReason)")
    expect(dashboardSource).toContain('/api/app/events/${eventId}/clusters/${clusterId}/status?account=${encodeURIComponent(accountSlug)}')
    expect(dashboardSource).toContain("method: 'PATCH'")
    expect(dashboardSource).toContain("headers: { 'Content-Type': 'application/json' }")
    expect(dashboardSource).toContain('body: JSON.stringify({ status: nextStatus, reason })')
    expect(dashboardSource).toContain('Saving status...')
    expect(dashboardSource).toContain('Failed to update status')
    expect(dashboardSource).toContain('isActiveEventIssueClusterStatus(item.status)')
    expect(dashboardSource).toContain('intelligenceData.activeAttentionCount')
    expect(dashboardSource).toContain('assignAttentionOwner')
    expect(dashboardSource).toContain('addAttentionNote')
    expect(dashboardSource).not.toContain('AttentionStatusControl')
  })

  it('renders compact overview metrics and priority mix from real values', () => {
    expect(dashboardSource).toContain('Event overview')
    expect(dashboardSource).toContain('Event status')
    expect(dashboardSource).toContain('<InferredSatisfactionBar summary={inferredSatisfaction} />')
    expect(dashboardSource).not.toContain('formatSentimentScore(intelligenceData.avgSentiment)')
    expect(dashboardSource).not.toContain('Updated {formatIntelligenceDateTime(livePulse?.lastComputedAt)}')
    expect(dashboardSource).toContain('formatInferredSatisfactionScore(summary)')
    expect(dashboardSource).toContain('Answers analyzed')
    expect(dashboardSource).toContain('Active attention')
    expect(dashboardSource).toContain('Affected areas')
    expect(dashboardSource).toContain('function PriorityMixDonut(')
    expect(dashboardSource).toContain('getPriorityDonutBackground(priorityCounts)')
    expect(dashboardSource).toContain('const priorityCounts = activeAttentionQueue.reduce')
    expect(dashboardSource).toContain('const activeAttentionQueue = displayAttentionQueue.filter')
    expect(dashboardSource).not.toContain('Issue clusters sorted by priority, evidence, recency, and signal strength.')
    expect(dashboardSource).not.toContain('from ${total} answer')
    expect(dashboardSource).not.toContain('function EventPulseRadial(')
    expect(dashboardSource).not.toContain('<EventPulseRadial')
    expect(dashboardSource).not.toContain('getActivitySignals')
    expect(dashboardSource).not.toContain('Signal Activity')
  })

  it('renders inferred satisfaction distribution outside the attention queue', () => {
    expect(dashboardSource).toContain('function InferredSatisfactionBar(')
    expect(dashboardSource).toContain('function SatisfactionDistribution(')
    expect(satisfactionSource).toContain('Very satisfied')
    expect(satisfactionSource).toContain('Satisfied')
    expect(satisfactionSource).toContain('Neutral')
    expect(satisfactionSource).toContain('Dissatisfied')
    expect(satisfactionSource).toContain('Very dissatisfied')
    expect(dashboardSource).toContain('<SatisfactionDistribution summary={inferredSatisfaction} />')
    expect(dashboardSource).toContain('Not enough data')
    expect(dashboardSource).not.toContain('Satisfaction issue')
    expect(dashboardSource).not.toContain('satisfactionQueue')
  })

  it('keeps queue rows compact, with only operational row content and no repeated context or summary', () => {
    const queueSection = dashboardSource.match(/What needs review[\s\S]*?Selected Issue Detail/)?.[0] || ''

    expect(dashboardSource).toContain('{item.evidenceCount} evidence')
    expect(dashboardSource).toContain('Last seen {formatIntelligenceDate(item.lastSeenAt)}')
    expect(dashboardSource).toContain('{getSignalStrengthLabel(item.confidence)}')
    // Question/survey context stays in the detail pane rather than repeating in every issue row.
    expect(queueSection).not.toContain('{getAttentionSourceLine(item)}')
    expect(dashboardSource).toContain('{getAttentionSourceLine(selectedAttentionItem)}')
    // The descriptive reason is reserved for the selected detail pane, not repeated in list rows.
    expect(queueSection).not.toContain('{item.summary}')
    expect(dashboardSource).toContain('{selectedAttentionItem.summary}')
    // The row keeps its operational action and evidence access, but never raw evidence copy.
    expect(dashboardSource).toContain('{item.recommendedNextStep}')
    expect(queueSection).toContain('openAttentionEvidence(item, evidence.id)')
    expect(queueSection).toContain('border-t border-slate-200 pt-2')
    expect(queueSection).not.toContain('rounded-lg border border-slate-200 bg-slate-50 px-3 py-2')
    expect(queueSection).not.toContain('&ldquo;{evidence.transcriptSnippet}&rdquo;')
  })

  it('consolidates the event KPIs into one responsive metric strip', () => {
    expect(dashboardSource).toContain('data-testid="event-intelligence-metric-strip"')
    expect(dashboardSource).toContain('grid grid-cols-2 divide-x divide-y divide-slate-200 md:grid-cols-5 md:divide-y-0')
    expect(dashboardSource).toContain('Responses')
    expect(dashboardSource).toContain('Answers analyzed')
    expect(dashboardSource).toContain('Active attention')
    expect(dashboardSource).toContain('Affected areas')
    expect(dashboardSource).toContain('Event status')
  })

  it('keeps issue detail closed until an operator selects a finding', () => {
    expect(dashboardSource).toContain('const [selectedIssueDetailItem, setSelectedIssueDetailItem] = useState<EventIntelligenceAttentionItem | null>(null)')
    expect(dashboardSource).toContain('const [selectedIssueEvidenceId, setSelectedIssueEvidenceId] = useState<string | null>(null)')
    expect(dashboardSource).toContain('const selectedAttentionItem = selectedIssueDetailItem')
    expect(dashboardSource).toContain('if (!current) {')
    expect(dashboardSource).toContain('setSelectedIssueEvidenceId(null)')
    expect(dashboardSource).toContain('return null')
    expect(dashboardSource).toContain('open={Boolean(selectedIssueDetailItem)}')
  })

  it('clears selected issue and evidence when the active filters exclude it', () => {
    expect(dashboardSource).toContain('const visibleItem = filteredAttentionQueue.find((item) => (')
    expect(dashboardSource).toContain('if (!visibleItem) {')
    expect(dashboardSource).toContain('setSelectedIssueEvidenceId(null)')
    expect(dashboardSource).toContain('return null')
    expect(dashboardSource).toContain('setSelectedIssueDetailItem((current) => {')
  })

  it('renders selected issue detail from the clicked queue evidence item', () => {
    expect(dashboardSource).toContain('selectedIssueEvidence.find((evidence) => evidence.id === selectedIssueEvidenceId)')
    expect(dashboardSource).toContain('Question asked')
    expect(dashboardSource).toContain('Attendee evidence ({selectedAttentionItem.representativeEvidence.length})')
    expect(dashboardSource).toContain('evidence.transcriptSnippet')
    expect(dashboardSource).toContain('Selected Issue Detail')
    expect(dashboardSource).toContain('Recommended next step')
    expect(dashboardSource).toContain('formatActionBriefText(briefFromAttentionItem(selectedAttentionItem))')
    expect(dashboardSource).toContain('normalizePriorityLevel(selectedAttentionItem.priorityLevel)')
  })

  it('selects issue evidence in the right pane instead of opening an evidence drawer', () => {
    expect(dashboardSource).not.toContain('EvidenceDetailDrawer')
    expect(dashboardSource).not.toContain('const openEvidenceDetail = (evidenceId: string)')
    expect(dashboardSource).not.toContain('/api/app/events/${eventId}/evidence/${selectedEvidenceId}?account=${encodeURIComponent(accountSlug)}')
    expect(dashboardSource).not.toContain('Loading evidence')
    expect(dashboardSource).not.toContain('Failed to load evidence detail')
    expect(dashboardSource).toContain('const openAttentionEvidence = (item: EventIntelligenceAttentionItem, evidenceId: string)')
    expect(dashboardSource).toContain('selectAttentionItem(item, evidenceId)')
    expect(dashboardSource).toContain('const selectAttentionEvidenceById = (evidenceId: string) => {')
    expect(dashboardSource).toContain('candidate.representativeEvidence.some((evidence) => evidence.id === evidenceId)')
    expect(dashboardSource).toContain('View evidence')
    expect(dashboardSource).toContain('rounded-lg border border-indigo-300 bg-indigo-50/50 p-3 ring-1 ring-indigo-100')
  })

  it('opens canonical app-scoped theme evidence drawer for key-backed theme cards only', () => {
    expect(dashboardSource).toContain("import type { EventThemeEvidenceResult } from '@/lib/event-intelligence/theme-evidence'")
    expect(dashboardSource).toContain("import { EventThemeEvidencePanel } from '@/components/events/EventThemeEvidencePanel'")
    expect(dashboardSource).toContain("import { EventEvidenceDrawer } from '@/components/events/EventEvidenceDrawer'")
    expect(dashboardSource).toContain('<EventEvidenceDrawer')
    expect(dashboardSource).toContain('open={Boolean(selectedThemeKey)}')
    expect(dashboardSource).toContain('onClose={closeThemeEvidence}')
    expect(dashboardSource).not.toContain('fixed inset-0')
    expect(dashboardSource).toContain('Theme Evidence')
    expect(dashboardSource).toContain('theme: Pick<EventIntelligenceTheme')
    expect(dashboardSource).toContain('if (!theme.themeKey || !accountSlug) return')
    expect(dashboardSource).toContain('const params = serializeEventDashboardRequest({')
    expect(dashboardSource).toContain("kind: 'evidence'")
    expect(dashboardSource).toContain('accountSlug,')
    expect(dashboardSource).toContain('selection: dashboardSelection')
    expect(dashboardSource).toContain('/themes/${encodeURIComponent(selectedThemeKey)}/evidence?${params.toString()}')
    expect(dashboardSource).toContain('setThemeEvidenceLoading(true)')
    expect(dashboardSource).toContain('setThemeEvidenceDetail(json.data as EventThemeEvidenceResult)')
    expect(dashboardSource).toContain('Failed to load theme evidence')
    expect(evidencePanelSource).toContain('row.transcriptSnippet || row.transcriptText')
    expect(evidencePanelSource).toContain('row.question.label ?? row.question.promptLabel')
    expect(evidencePanelSource).toContain('formatDateTime(row.createdAt)')
    expect(evidencePanelSource).toContain('No source answers are linked to this theme yet.')
    expect(dashboardSource).toContain('const evidenceDrawers = (')
    expect(dashboardSource).toContain('<ThemeEvidencePanel')
    expect(dashboardSource).toContain('ref={themeEvidenceRef}')
  })

  it('renders a separate evidence-backed Intelligence workspace without the operational queue', () => {
    const intelligenceBranch = dashboardSource.match(/if \(view === 'intelligence'\)[\s\S]*?return \(\n    <div className="space-y-6">/)?.[0] || ''

    expect(dashboardSource).toContain("view?: 'overview' | 'intelligence'")
    expect(dashboardSource).toContain('buildEventIntelligenceFindings')
    expect(intelligenceBranch).toContain('Evidence-backed themes')
    expect(intelligenceBranch).toContain('Emerging signals')
    expect(intelligenceBranch).toContain('Cross-response opportunities')
    expect(intelligenceBranch).toContain('Positive intelligence')
    expect(intelligenceBranch).toContain('Risks and friction')
    expect(dashboardSource).toContain("weak: 'Weak evidence'")
    expect(dashboardSource).toContain("informational: 'Informational'")
    expect(dashboardSource).toContain("'current-event': 'Current event'")
    expect(dashboardSource).toContain("'after-event': 'After event'")
    expect(dashboardSource).toContain("'next-event': 'Next event'")
    expect(intelligenceBranch).not.toContain('What needs review')
    expect(intelligenceBranch).not.toContain('Selected Issue Detail')
  })

  it('reuses the inline evidence renderer for every Intelligence finding type', () => {
    expect(dashboardSource).toContain("if (kind === 'opportunity') return 'Opportunity Evidence'")
    expect(dashboardSource).toContain("if (kind === 'signal') return 'Signal Evidence'")
    expect(dashboardSource).toContain("return 'Theme Evidence'")
    expect(dashboardSource).toContain('findingEvidenceHeading(finding.kind)')
    expect(dashboardSource).toContain('heading={selectedThemeMeta?.evidenceHeading}')
    expect(dashboardSource).toContain('View evidence')
    expect(dashboardSource).not.toContain('IntelligenceEvidenceDrawer')
  })

  it('exposes persistent evidence-strength and coverage controls in Intelligence', () => {
    expect(dashboardSource).toContain('intelligenceStrengthFilter?: EventIntelligenceEvidenceStrength | null')
    expect(dashboardSource).toContain('Clear strength filter')
    expect(dashboardSource).toContain('Clear coverage filter')
    expect(dashboardSource).toContain('Filters stay in the URL')
    expect(dashboardSource).toContain('aria-pressed={intelligenceStrengthFilter === strength}')
  })

  it('makes positive overview signals open the existing inline theme evidence', () => {
    expect(dashboardSource).toContain('What is working')
    expect(dashboardSource).toContain('overview.keep.slice(0, 4)')
    expect(dashboardSource).toContain('onClick={() => openThemeEvidence(theme)}')
    expect(dashboardSource).toContain('hover:border-emerald-300 focus:outline-none')
    expect(dashboardSource).toContain('aria-pressed={selectedThemeKey === theme.themeKey}')
  })

  it('uses a tested normalized classifier for Keep, Improve, Revisit, confidence, and follow-up', () => {
    expect(dashboardSource).toContain("import { buildInEventOverview, buildInEventOverviewSummary } from '@/lib/event-intelligence/overview'")
    expect(dashboardSource).toContain('const overview = buildInEventOverview({')
    expect(dashboardSource).toContain('findings: intelligenceFindings')
    expect(dashboardSource).toContain('themes: topIntelligenceThemes')
    expect(dashboardSource).toContain('actions: topIntelligenceActions')
    expect(dashboardSource).toContain('issues: displayAttentionQueue')
    expect(dashboardSource).toContain('overview.improveNow.slice(0, 3)')
    expect(dashboardSource).toContain('overview.revisitNextEvent.slice(0, 3)')
    expect(dashboardSource).toContain('overview.openFollowUp.slice(0, 4)')
    expect(dashboardSource).toContain('if (item) selectAttentionItem(item)')
    expect(dashboardSource).toContain('onClick={() => openThemeEvidence({ themeKey: action.themeKey!')
  })

  it('keeps clean empty and failure states while leaving deployment controls in Setup', () => {
    expect(dashboardSource).toContain('No intelligence yet. Responses will appear here once attendees start answering.')
    expect(dashboardSource).toContain('No active attention items.')
    expect(dashboardSource).toContain('Evidence will appear as analyzed responses accumulate.')
    expect(dashboardSource).toContain('No source coverage yet.')
    expect(dashboardSource).toContain('No question coverage yet.')
    expect(dashboardSource).toContain('Event intelligence is unavailable right now.')
    expect(dashboardSource).not.toContain('Share this survey')
    expect(dashboardSource).not.toContain('SurveyQrCard')
    expect(dashboardSource).not.toContain('path={`/kiosk?eventId=${eventId}`}')
  })

  it('makes attention-queue issue rows clickable to drive the Selected Issue Detail', () => {
    // The issue content is a button that selects the issue (not only View evidence).
    expect(dashboardSource).toContain('onClick={() => selectAttentionItem(item)}')
    expect(dashboardSource).toContain('aria-pressed={isSelectedIssue}')
    // Selecting still highlights the row and updates the detail panel.
    expect(dashboardSource).toContain('const isSelectedIssue = selectedIssueDetailKey === itemKey')
    expect(dashboardSource).toContain("isSelectedIssue ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/70'")
    expect(dashboardSource).toContain('border-l-4 ${getPriorityRailClass(priority)}')
    expect(dashboardSource).not.toContain('ring-2 ring-indigo-100')
    expect(dashboardSource).toContain('Selected Issue Detail')
    // View evidence remains available while lifecycle controls are consolidated
    // into the selected detail pane.
    expect(dashboardSource).toContain('nextAlertAction(selectedAttentionItem.status)')
    expect(dashboardSource).toContain('onClick={() => openAttentionEvidence(item, evidence.id)}')
  })

  it('uses the right-side Selected Issue Detail pane instead of an evidence drawer', () => {
    expect(dashboardSource).not.toContain('EvidenceDetailDrawer')
    expect(dashboardSource).not.toContain('evidenceDrawerOpen')
    expect(dashboardSource).not.toContain('openEvidenceDetail')
    expect(dashboardSource).not.toContain('Open full evidence')
    expect(dashboardSource).not.toContain('/api/app/events/${eventId}/evidence/${selectedEvidenceId}')
    expect(dashboardSource).toContain('const openAttentionEvidence = (item: EventIntelligenceAttentionItem, evidenceId: string) => {')
    expect(dashboardSource).toContain('selectAttentionItem(item, evidenceId)')
    expect(dashboardSource).toContain('setSelectedIssueEvidenceId(evidenceId ?? item.representativeEvidence?.[0]?.id ?? null)')
    expect(dashboardSource).toContain('open={Boolean(selectedIssueDetailItem)}')
    expect(dashboardSource).toContain('Attendee evidence ({selectedAttentionItem.representativeEvidence.length})')
    expect(dashboardSource).toContain('Recommended next step')
  })

  it('keeps selected issue evidence in the canonical drawer without changing the workspace layout', () => {
    expect(dashboardSource).toContain('const closeIssueEvidence = () => {')
    expect(dashboardSource).toContain('onClose={closeIssueEvidence}')
    expect(dashboardSource).toContain('eyebrow="Current event · supporting evidence"')
    // The desktop rail is a measured grid sibling, never an absolute overlay.
    expect(dashboardSource).toContain('const [needsAttentionHeight, setNeedsAttentionHeight] = useState<number | null>(null)')
    expect(dashboardSource).toContain('const needsAttentionRef = useRef<HTMLDivElement | null>(null)')
    expect(dashboardSource).toContain('const setNeedsAttentionPanelRef = useCallback((node: HTMLDivElement | null) => {')
    expect(dashboardSource).toContain('new ResizeObserver(syncDetailHeight)')
    expect(dashboardSource).toContain("window.matchMedia('(min-width: 1280px)')")
    expect(dashboardSource).toContain('style={needsAttentionHeight ? { height: needsAttentionHeight } : undefined}')
    expect(dashboardSource).toContain('className="scroll-mt-4 min-h-0 rounded-xl border border-slate-200 bg-slate-50 p-3 xl:flex xl:flex-col"')
    expect(dashboardSource).toContain('data-testid="selected-issue-detail-body"')
    expect(dashboardSource).toContain('xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1')
    expect(dashboardSource).not.toContain('isDetailExpanded')
    expect(dashboardSource).not.toContain('Show full detail')
    expect(dashboardSource).not.toContain('Collapse detail')
    expect(dashboardSource).toContain('selectedAttentionItem.representativeEvidence.map((evidence) => (')
    expect(dashboardSource).toContain('Linked evidence ({selectedAlertDetail.evidence.length})')
    expect(dashboardSource).toContain('selectedAlertDetail.evidence.map((evidence) => {')
    expect(dashboardSource).not.toContain('selectedAlertDetail.evidence.slice(0, 5)')
    expect(dashboardSource).toContain('Internal alert note')
    expect(dashboardSource).not.toContain('xl:absolute xl:right-0')
    expect(dashboardSource).not.toContain('xl:max-h-[calc(100vh-2rem)]')
  })

  it('consolidates action briefs into the Needs Attention Now queue (no separate section)', () => {
    // Briefs are still derived from real intelligence (used for Copy summary)…
    expect(dashboardSource).toContain('buildActionBriefs')
    expect(dashboardSource).toContain("} from '@/lib/event-intelligence/action-briefs'")
    expect(dashboardSource).toContain('const actionBriefs = buildActionBriefs(displayAttentionQueue')
    // …but the standalone "Action Briefs" panel is gone — the queue is the single attention surface.
    expect(dashboardSource).not.toContain('Action Briefs')
    expect(dashboardSource).not.toContain('No action briefs yet.')
  })

  it('lets operators advance issue status from selected detail via the existing cluster API', () => {
    expect(dashboardSource).toContain('updateAttentionStatus(selectedAttentionItem.id!, action.status, actionReason)')
    expect(dashboardSource).toContain('/api/app/events/${eventId}/clusters/${clusterId}/status')
    expect(dashboardSource).not.toContain('brief.clusterId')
  })

  it('defaults to active alerts, preserves history, and shows canonical linked evidence', () => {
    expect(dashboardSource).toContain("useState<'ACTIVE' | 'HISTORY' | 'ALL'>('ACTIVE')")
    expect(dashboardSource).toContain("attentionView === 'ACTIVE' ? active : !active")
    expect(dashboardSource).toContain('aria-label="Alert view"')
    expect(dashboardSource).toContain('Linked evidence ({selectedAlertDetail.evidence.length})')
    expect(dashboardSource).toContain('Score: {evidence.answer.numericValue}')
    expect(dashboardSource).toContain('evidence.answer.answerTranscript?.text || evidence.transcriptSnippet')
    expect(dashboardSource).toContain('This is directional movement, not proof of causation.')
  })

  it('offers no-schema copy/share: per-issue Copy brief and an event operations summary', () => {
    expect(dashboardSource).toContain('formatActionBriefText')
    expect(dashboardSource).toContain('formatEventOperationsSummary')
    // Copy summary moved into the Needs Attention Now header; Copy brief is per-card.
    expect(dashboardSource).toContain('Copy summary')
    expect(dashboardSource).toContain('Copy brief')
    expect(dashboardSource).toContain('navigator.clipboard.writeText')
  })

  it('keeps the top workspace balanced and the lower command-center sections full width', () => {
    expect(dashboardSource).toContain('<section className="flex flex-col gap-4">')
    expect(dashboardSource).toContain('order-1 space-y-3 text-slate-950')
    expect(dashboardSource).toContain('order-2 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start')
    expect(dashboardSource).toContain('data-testid="sponsor-activation-value" className="order-5 space-y-3"')
    expect(dashboardSource).toContain('data-testid="needs-attention-panel"')
    expect(dashboardSource).toContain('data-testid="selected-issue-detail-panel"')
    expect(dashboardSource).toContain('data-testid="sponsor-activation-value"')
    expect(dashboardSource).toContain('data-testid="event-overview"')
    expect(dashboardSource).toContain('data-testid="what-is-working"')
    expect(dashboardSource).toContain('data-testid="coverage-and-confidence"')
    expect(dashboardSource).toContain('data-testid="overview-decisions"')
    expect(dashboardSource).toContain('data-testid="open-follow-up"')
    expect(dashboardSource).not.toContain('order-3 space-y-4 rounded-xl border border-orange-200 bg-orange-50/30')
    expect(dashboardSource).toContain('order-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]')
    expect(dashboardSource).not.toContain('xl:pr-[396px]')
    expect(dashboardSource).not.toContain('xl:mr-[396px]')
    expect(dashboardSource).toContain('data-testid="sponsor-activation-grid"')
    expect(dashboardSource).toContain("sponsorActivationValues.length === 1 ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-2'")
  })

  it('renders a sponsor activation value section derived from existing intelligence', () => {
    expect(dashboardSource).toContain("import { buildSponsorActivationValues } from '@/lib/event-intelligence/sponsor-activation-value'")
    expect(dashboardSource).toContain('const sponsorActivationValues = buildSponsorActivationValues(targetBreakdown, displayAttentionQueue')
    expect(dashboardSource).toContain('Sponsor Activation Value')
    expect(dashboardSource).toContain('sponsorActivationValues.length === 1')
    expect(dashboardSource).toContain('data-testid="sponsor-activation-card"')
    expect(dashboardSource).toContain('min-w-0 rounded-lg border border-slate-200')
    expect(dashboardSource).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]')
    expect(dashboardSource).toContain('border-t border-slate-200 pt-2')
    expect(dashboardSource).toContain('{issue.title}')
    expect(dashboardSource).toContain('selectAttentionEvidenceById(issue.evidenceId as string)')
    expect(dashboardSource).not.toContain('Mentions, sentiment, themes, and attendee evidence for sponsor activation touchpoints.')
    expect(dashboardSource).not.toContain('“{issue.quote}”')
    expect(dashboardSource).not.toContain('rounded border border-slate-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950')
    // Clear empty state when no sponsor activation feedback exists.
    expect(dashboardSource).toContain('No sponsor activation feedback yet.')
  })
})
