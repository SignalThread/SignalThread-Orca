'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EventThemeEvidencePanel } from '@/components/events/EventThemeEvidencePanel'
import { EventEvidenceDrawer } from '@/components/events/EventEvidenceDrawer'
import { EventInEventOverview } from '@/components/events/EventInEventOverview'
import { EventInEventIntelligence } from '@/components/events/EventInEventIntelligence'
import { EventIntelligenceActionPanel } from '@/components/events/EventIntelligenceActionPanel'
import type { AnalyticsSignals, KeyInsightsSignalsPayload } from '@/lib/analytics/signals'
import type { EventThemeEvidenceResult } from '@/lib/event-intelligence/theme-evidence'
import {
  isActiveEventIssueClusterStatus,
  type EventIssueClusterStatus,
} from '@/lib/event-intelligence/contract'
import {
  buildActionBriefs,
  briefFromAttentionItem,
  formatActionBriefText,
  formatEventOperationsSummary,
} from '@/lib/event-intelligence/action-briefs'
import { buildSponsorActivationValues } from '@/lib/event-intelligence/sponsor-activation-value'
import { buildInEventOverview, buildInEventOverviewSummary } from '@/lib/event-intelligence/overview'
import { buildEventIntelligenceFactualSnapshot } from '@/lib/event-intelligence/factual-snapshot'
import { evidenceTierLabel, type EventEvidenceModel } from '@/lib/event-intelligence/evidence-model'
import {
  buildEventIntelligenceFindings,
  type EventIntelligenceEvidenceStrength,
  type EventIntelligenceFinding,
  type EventIntelligenceFindingKind,
} from '@/lib/event-intelligence/intelligence-view'
import {
  formatInferredSatisfactionScore,
  getInferredSatisfactionSummaryFromBreakdown,
  type InferredSatisfactionSummary,
  type SatisfactionBucketKey,
} from '@/lib/analytics/satisfaction'
import {
  serializeEventDashboardRequest,
  type EventDashboardSelection,
} from '@/lib/event-dashboard-selection'

// ============================================================
// TYPES
// ============================================================

interface EventAnalysis {
  eventId: string
  eventName: string
  eventStatus: string
  eventType: string
  accountType: string
  totalResponses: number
  completedResponses: number
  /** Answer rows in the selected period (any state). */
  totalAnswers: number
  /** Same as totalAnswers when provided by API. */
  answersCaptured?: number
  /** Same as completedAnswers when provided by API. */
  answersAnalyzed?: number
  completedAnswers: number
  /** Lifetime: average completed responses per month since first response. */
  avgCompletedResponsesPerMonth?: number
  overallSummary: string | null
  overallSentiment: string | null
  avgSentimentScore: number | null
  topActionItems: Array<{ text: string; priority: 'High' | 'Medium' | 'Low' }> | null
  lastComputedAt: string
}

interface EventIntelligencePulse {
  status: string
  sentimentLabel: string
  urgency: string
  priorityLevel?: EventPriorityLevel | string
  summary: string
  lastComputedAt: string
}

type EventPriorityLevel = 'Immediate' | 'Soon' | 'Watch' | 'Informational'

const ATTENTION_QUEUE_PREVIEW_LIMIT = 6

interface EventIntelligenceTheme {
  themeKey: string
  themeKeys?: string[]
  label: string
  count: number
  sentimentLabel: string | null
  confidence: number | null
  evidence?: EventEvidenceModel
  statement?: string | null
  questionIntent?: 'strength' | 'friction' | 'improvement' | 'neutral'
  supportingAnswerIds?: string[]
  supportingResponseIds?: string[]
  supportingEvidenceIds?: string[]
  supportingTargetIds?: string[]
  evidenceText?: string[]
  questionTypes?: string[]
  targetIdentity?: string
  targetName?: string | null
  targetKind?: string | null
}

interface EventIntelligenceAction {
  themeKey?: string
  title: string
  description: string | null
  count?: number
  priority: string
  priorityLevel?: EventPriorityLevel | string
  urgency: string
  actionWindow: string | null
  status: string
  confidence: number | null
  supportingAnswerIds?: string[]
  supportingResponseIds?: string[]
  supportingEvidenceIds?: string[]
}

interface EventIntelligenceUrgentIssue extends EventIntelligenceAction {
  id: string
  answerId: string
  surveyId: string | null
  surveyTargetId: string | null
  createdAt: string
}

interface EventIntelligenceTargetBreakdown {
  surveyTargetId: string | null
  name: string
  category: string | null
  eventStructureItemId?: string | null
  eventStructureItemKind?: string | null
  responseCount: number
  answerCount: number
  avgSentiment: number | null
  highUrgencyCount: number
  topThemes: EventIntelligenceTheme[]
  topThemeKeys?: string[]
}

interface EventIntelligenceQuestionBreakdown {
  questionId: string | null
  key: string | null
  label: string
  order: number | null
  responseCount: number
  answerCount: number
  avgSentiment: number | null
  highUrgencyCount: number
  topThemes: EventIntelligenceTheme[]
}

interface EventIntelligenceEvidence {
  id: string
  answerId: string
  responseId: string
  questionId: string | null
  surveyTargetId: string | null
  transcriptSnippet: string
  sentimentScore: number | null
  priorityLevel: EventPriorityLevel | string
  createdAt: string
}

interface EventIntelligenceAttentionItem {
  id: string | null
  taxonomyKey: string
  title: string
  summary: string | null
  priorityLevel: EventPriorityLevel | string
  legacyUrgency: string | null
  impactScore: number | null
  timeSensitivityScore: number | null
  confidence: number | null
  evidenceCount: number
  firstSeenAt: string
  lastSeenAt: string
  recommendedNextStep: string | null
  status: string
  ruleType?: string
  metricSnapshot?: {
    metric?: {
      questionType?: string
      recent?: { count: number; average: number | null }
      preceding?: { count: number; average: number | null }
      change?: number | null
    }
    sampleStrength?: { label: string; reason: string }
  } | null
  ownerUserId?: string | null
  noteCount?: number
  surveyId: string | null
  surveyTargetId: string | null
  questionId: string | null
  affectedTarget: {
    id: string
    name: string
    category: string | null
  } | null
  affectedQuestion: {
    id: string
    key: string | null
    label: string
    order: number | null
  } | null
  representativeEvidence: EventIntelligenceEvidence[]
}

interface EventStructuredMetric {
  key: string
  questionId: string
  questionType: 'RATING_1_TO_5' | 'RECOMMENDATION_0_TO_10' | 'YES_NO'
  questionLabel: string
  surveyName: string | null
  surveyTargetName: string | null
  count: number
  average: number | null
  distribution: Record<string, number>
  recent: { count: number; average: number | null }
  preceding: { count: number; average: number | null }
  change: number | null
  direction: string
  sampleStrength: { level: string; label: string; reason: string }
}

interface EventAlertDetail {
  id: string
  status: EventIssueClusterStatus
  ownerUserId: string | null
  owner: { id: string; email: string; firstName: string | null; lastName: string | null } | null
  availableOwners: Array<{ id: string; email: string; firstName: string | null; lastName: string | null }>
  notes: Array<{
    id: string
    body: string
    createdAt: string
    author: { email: string; firstName: string | null; lastName: string | null } | null
  }>
  evidence: Array<{
    id: string
    transcriptSnippet: string
    sentimentScore: number | null
    priorityLevel: string
    createdAt: string
    answer: { numericValue: number | null; objectKey: string | null; answerTranscript: { text: string } | null }
    question: { label: string; type: string } | null
  }>
  interventionMovement: {
    status: string
    label: string
    before: { average: number | null; count: number }
    after: { average: number | null; count: number }
    change: number | null
    sampleStrength: { label: string; reason: string }
  } | null
}

export interface EventIntelligenceData {
  eventId: string
  eventName: string
  eventStatus: string
  eventType: string
  accountType: string
  filters?: Record<string, unknown>
  eventPulse: EventIntelligencePulse
  responseCount: number
  answerCount: number
  avgSentiment: number | null
  highUrgencyCount: number
  topThemes: EventIntelligenceTheme[]
  topActions: EventIntelligenceAction[]
  canonicalFindings?: EventIntelligenceFinding[]
  /** Survey-authored planning questions from canonical attendee answer transcripts. */
  attendeeQuestions?: string[]
  targetBreakdown: EventIntelligenceTargetBreakdown[]
  questionBreakdown: EventIntelligenceQuestionBreakdown[]
  urgentIssues: EventIntelligenceUrgentIssue[]
  attentionQueue?: EventIntelligenceAttentionItem[]
  activeAttentionCount?: number
  structuredMetrics?: EventStructuredMetric[]
  pagination?: {
    attention: { limit: number; hasMore: boolean; nextCursor: string | null }
  }
}

interface Dashboard2Props {
  analysisData: EventAnalysis
  signalsData: AnalyticsSignals | null
  /** Legacy signal payload retained for caller compatibility. */
  keyInsightsData: KeyInsightsSignalsPayload | null
  signalsLoading: boolean
  intelligenceData: EventIntelligenceData | null
  intelligenceLoading: boolean
  intelligenceError: string | null
  eventId: string
  dashboardSelection: EventDashboardSelection
  surveyScopeLabel?: string
  surveyScopeMode?: 'all' | 'survey'
  timePeriod: number
  humanizeAction: (text: string) => string
  /** themeKey → persisted Insight id (from signals API after sync) */
  insightKeyByThemeKey?: Record<string, string>
  accountSlug?: string | null
  view?: 'overview' | 'intelligence'
  intelligenceStrengthFilter?: EventIntelligenceEvidenceStrength | null
  onIntelligenceStrengthFilterChange?: (strength: EventIntelligenceEvidenceStrength | null) => void
  activeIntelligenceFilter?: {
    type: 'target' | 'question'
    surveyTargetId?: string
    questionId?: string
    label: string
  } | null
  onFilterByTarget?: (target: { surveyTargetId: string; label: string }) => void
  onFilterByQuestion?: (question: { questionId: string; label: string }) => void
  onClearIntelligenceFilter?: () => void
}

// ============================================================
// INLINE SVG ICONS
// ============================================================

const ActivityIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const ChatIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)

const TrendingDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
)

const MinusIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const BarChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
)

const ClipboardIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M9 14l2 2 4-4" />
  </svg>
)

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

const TargetIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

// ============================================================
// HELPERS
// ============================================================

interface PulseStyle {
  ring: string
  text: string
  accent: string
  accentDark: string
  iconBg: string
  iconBgDark: string
  iconText: string
}

function getPulseStyle(label: string | null): PulseStyle {
  const styles: Record<string, PulseStyle> = {
    GREAT: { ring: '#16a34a', text: 'text-green-700 dark:text-green-400', accent: 'border-l-emerald-500', accentDark: 'dark:border-l-emerald-600', iconBg: 'bg-emerald-50', iconBgDark: 'dark:bg-emerald-900/30', iconText: 'text-emerald-600 dark:text-emerald-400' },
    GOOD: { ring: '#22c55e', text: 'text-green-600 dark:text-green-400', accent: 'border-l-green-400', accentDark: 'dark:border-l-green-600', iconBg: 'bg-green-50', iconBgDark: 'dark:bg-green-900/30', iconText: 'text-green-600 dark:text-green-400' },
    MIXED: { ring: '#eab308', text: 'text-amber-700 dark:text-amber-400', accent: 'border-l-amber-400', accentDark: 'dark:border-l-amber-500', iconBg: 'bg-amber-50', iconBgDark: 'dark:bg-amber-900/30', iconText: 'text-amber-600 dark:text-amber-400' },
    NEEDS_ATTENTION: { ring: '#ef4444', text: 'text-red-700 dark:text-red-400', accent: 'border-l-red-400', accentDark: 'dark:border-l-red-500', iconBg: 'bg-red-50', iconBgDark: 'dark:bg-red-900/30', iconText: 'text-red-600 dark:text-red-400' },
  }
  return styles[label ?? ''] ?? styles.MIXED
}

function getPulseLabel(label: string | null): string {
  const map: Record<string, string> = { GREAT: 'Great', GOOD: 'Good', MIXED: 'Mixed', NEEDS_ATTENTION: 'Needs Attention' }
  return map[label ?? ''] ?? 'Unknown'
}

function getComponentQuality(value: number, max: number): { label: string; color: string } {
  const pct = value / max
  if (pct >= 0.8) return { label: 'Strong', color: 'text-green-600 dark:text-green-400' }
  if (pct >= 0.5) return { label: 'Healthy', color: 'text-blue-600 dark:text-blue-400' }
  if (pct >= 0.25) return { label: 'Moderate', color: 'text-amber-600 dark:text-amber-400' }
  return { label: 'Low', color: 'text-zinc-500' }
}

function getImpactStyles(impactScore: number) {
  const styles: Record<number, { label: string; barActive: string; barFaded: string; labelColor: string; cardBg: string; cardBorder: string }> = {
    3: { label: 'High Impact', barActive: 'bg-red-500 dark:bg-red-400', barFaded: 'bg-red-200 dark:bg-red-800', labelColor: 'text-red-600 dark:text-red-400', cardBg: 'bg-red-50/60 dark:bg-red-950/20', cardBorder: 'border-red-200 dark:border-red-800/50' },
    2: { label: 'Medium Impact', barActive: 'bg-amber-500 dark:bg-amber-400', barFaded: 'bg-amber-200 dark:bg-amber-800', labelColor: 'text-amber-600 dark:text-amber-400', cardBg: 'bg-amber-50/60 dark:bg-amber-950/20', cardBorder: 'border-amber-200 dark:border-amber-800/50' },
    1: { label: 'Low Impact', barActive: 'bg-zinc-400 dark:bg-zinc-500', barFaded: 'bg-zinc-200 dark:bg-zinc-700', labelColor: 'text-zinc-500 dark:text-zinc-400', cardBg: 'bg-zinc-50/60 dark:bg-zinc-900/20', cardBorder: 'border-zinc-200 dark:border-zinc-700' },
  }
  return styles[impactScore] ?? styles[2]
}

function ImpactBars({ score }: { score: number }) {
  const s = getImpactStyles(score)
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-[3px]">
        {[1, 2, 3].map(i => (
          <div key={i} className={`w-[3.5px] h-[14px] rounded-sm ${i <= score ? s.barActive : s.barFaded}`} />
        ))}
      </div>
      <span className={`text-xs font-medium ${s.labelColor}`}>{s.label}</span>
    </div>
  )
}

function getComponentBarColor(value: number, max: number): string {
  const pct = value / max
  if (pct >= 0.8) return 'bg-green-500'
  if (pct >= 0.5) return 'bg-blue-500'
  if (pct >= 0.25) return 'bg-amber-500'
  return 'bg-zinc-400'
}

function humanizeIntelligenceLabel(value: string | null | undefined): string {
  if (!value) return 'No data'
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function EmptyIntelligenceState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-400">
      {message}
    </div>
  )
}

function normalizePriorityLevel(value: string | null | undefined): EventPriorityLevel {
  if (value === 'Immediate' || value === 'Soon' || value === 'Watch' || value === 'Informational') {
    return value
  }
  const normalized = value?.trim().toUpperCase()
  if (normalized === 'HIGH' || normalized === 'CRITICAL' || normalized === 'URGENT') return 'Immediate'
  if (normalized === 'MEDIUM') return 'Soon'
  if (normalized === 'LOW') return 'Watch'
  return 'Informational'
}

function getPriorityBadgeClass(priority: string | null | undefined): string {
  const level = normalizePriorityLevel(priority)
  if (level === 'Immediate') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
  }
  if (level === 'Soon') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-700'
  }
  if (level === 'Watch') {
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300'
  }
  return 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
}

function getPriorityRailClass(priority: string | null | undefined): string {
  const level = normalizePriorityLevel(priority)
  if (level === 'Immediate') return 'border-l-red-500'
  if (level === 'Soon') return 'border-l-amber-500'
  if (level === 'Watch') return 'border-l-blue-500'
  return 'border-l-zinc-300 dark:border-l-zinc-700'
}

function formatIntelligenceDateTime(value: string | null | undefined): string {
  if (!value) return 'Not updated'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not updated'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatIntelligenceDate(value: string | null | undefined): string {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No timestamp'
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function getAttentionSourceLine(item: EventIntelligenceAttentionItem): string {
  const parts = [
    item.affectedTarget?.name,
    item.affectedQuestion?.label,
  ].filter((part): part is string => Boolean(part))

  if (parts.length > 0) return parts.join(' · ')
  if (item.surveyTargetId || item.questionId) return 'Linked event survey source'
  return 'Event-level feedback'
}

function SourceRow({
  label,
  count,
  max,
  meta,
  active = false,
  onClick,
}: {
  label: string
  count: number
  max: number
  meta: string
  active?: boolean
  onClick?: () => void
}) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0
  const content = (
    <>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{meta}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-zinc-500 dark:bg-zinc-400" style={{ width: `${pct}%` }} />
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`w-full space-y-1.5 rounded-md p-1.5 text-left transition-colors hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 ${
          active ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''
        }`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="space-y-1.5 p-1.5">
      {content}
    </div>
  )
}

function formatSentimentScore(avgSentiment: number | null | undefined): string {
  if (avgSentiment == null || Number.isNaN(avgSentiment)) return 'No sentiment'
  return `${avgSentiment > 0 ? '+' : ''}${avgSentiment.toFixed(2)} avg sentiment`
}

function ThemeEvidencePanel(props: Parameters<typeof EventThemeEvidencePanel>[0]) {
  return <EventThemeEvidencePanel {...props} />
}

/**
 * Command Center inferred-satisfaction summary. Delegates to the shared
 * satisfaction definition so Events Home and the Command Center cannot drift
 * apart. Exported for tests and reuse.
 */
export function getInferredSatisfactionSummary(
  intelligenceData: Pick<EventIntelligenceData, 'answerCount' | 'avgSentiment' | 'targetBreakdown' | 'questionBreakdown'> | null | undefined,
): InferredSatisfactionSummary {
  return getInferredSatisfactionSummaryFromBreakdown(intelligenceData ?? null)
}

function getPriorityHex(priority: string | null | undefined): string {
  const level = normalizePriorityLevel(priority)
  if (level === 'Immediate') return '#ef4444'
  if (level === 'Soon') return '#f59e0b'
  if (level === 'Watch') return '#3b82f6'
  return '#71717a'
}

function getSignalStrengthLabel(confidence: number | null | undefined): string {
  if (confidence == null || Number.isNaN(confidence)) return 'No confidence'
  if (confidence >= 0.8) return 'High confidence'
  if (confidence >= 0.55) return 'Medium confidence'
  return 'Low confidence'
}

function getPriorityDonutBackground(priorityCounts: Record<EventPriorityLevel, number>): string {
  const priorities: EventPriorityLevel[] = ['Immediate', 'Soon', 'Watch', 'Informational']
  const total = priorities.reduce((sum, priority) => sum + priorityCounts[priority], 0)
  if (total === 0) return 'conic-gradient(#3f3f46 0deg 360deg)'

  let cursor = 0
  const segments = priorities.map((priority) => {
    const start = cursor
    const degrees = (priorityCounts[priority] / total) * 360
    cursor += degrees
    return `${getPriorityHex(priority)} ${start}deg ${cursor}deg`
  })
  return `conic-gradient(${segments.join(', ')})`
}

function PriorityMixDonut({ priorityCounts }: { priorityCounts: Record<EventPriorityLevel, number> }) {
  const priorities: EventPriorityLevel[] = ['Immediate', 'Soon', 'Watch', 'Informational']
  const total = priorities.reduce((sum, priority) => sum + priorityCounts[priority], 0)

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative h-20 w-20 shrink-0 rounded-full"
        style={{ background: getPriorityDonutBackground(priorityCounts) }}
        aria-label="Priority distribution"
      >
        <div className="absolute inset-3 rounded-full bg-white" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black text-slate-950">{total}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">items</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {priorities.map((priority) => (
          <div key={priority} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex min-w-0 items-center gap-2 text-slate-700">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getPriorityHex(priority) }} />
              {priority}
            </span>
            <span className="font-bold text-slate-950">{priorityCounts[priority]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SatisfactionDistribution({ summary }: { summary: InferredSatisfactionSummary }) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Inferred Satisfaction</p>
          <p className="mt-1 text-[11px] text-emerald-700">
            {summary.totalAnalyzed > 0
              ? `${summary.totalAnalyzed} analyzed sentiment answer${summary.totalAnalyzed === 1 ? '' : 's'}`
              : 'Not enough data'}
          </p>
        </div>
        <p className="text-lg font-black text-slate-950">{formatInferredSatisfactionScore(summary)}</p>
      </div>
      <div className="mt-3 space-y-2">
        {summary.buckets.map((bucket) => {
          const pct = summary.totalAnalyzed > 0
            ? Math.round((bucket.count / summary.totalAnalyzed) * 100)
            : 0

          return (
            <div key={bucket.key} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="font-semibold text-slate-600">{bucket.label}</span>
                <span className="text-slate-500">{bucket.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InferredSatisfactionBar({ summary }: { summary: InferredSatisfactionSummary }) {
  const total = summary.totalAnalyzed
  const colors: Record<SatisfactionBucketKey, string> = {
    verySatisfied: 'bg-emerald-500',
    satisfied: 'bg-emerald-300',
    neutral: 'bg-slate-200',
    dissatisfied: 'bg-rose-300',
    veryDissatisfied: 'bg-rose-500',
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Inferred Satisfaction</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{formatInferredSatisfactionScore(summary)}</p>
        </div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
        {total > 0 ? summary.buckets.map((bucket) => {
          const width = Math.max(0, (bucket.count / total) * 100)
          if (width === 0) return null
          return (
            <div
              key={bucket.key}
              className={colors[bucket.key]}
              style={{ width: `${width}%` }}
              title={`${bucket.label}: ${bucket.count}`}
            />
          )
        }) : (
          <div className="h-full w-full bg-slate-200" />
        )}
      </div>
    </div>
  )
}

const FINDING_KIND_LABELS: Record<EventIntelligenceFindingKind, string> = {
  theme: 'Theme',
  signal: 'Emerging signal',
  opportunity: 'Opportunity',
  positive: 'Positive intelligence',
  risk: 'Risk / friction',
}

const FINDING_CLASSIFICATION_LABELS: Record<EventIntelligenceFinding['classification'], string> = {
  informational: 'Informational',
  'current-event': 'Current event',
  'after-event': 'After event',
  'next-event': 'Next event',
}

const EVIDENCE_STRENGTH_LABELS: Record<EventIntelligenceEvidenceStrength, string> = {
  strong: 'Strong evidence',
  directional: 'Directional evidence',
  weak: 'Weak evidence',
}

function findingEvidenceHeading(kind: EventIntelligenceFindingKind): string {
  if (kind === 'opportunity') return 'Opportunity Evidence'
  if (kind === 'signal') return 'Signal Evidence'
  return 'Theme Evidence'
}

function FindingCard({
  finding,
  selected,
  onSelect,
}: {
  finding: EventIntelligenceFinding
  selected: boolean
  onSelect: () => void
}) {
  const accent = finding.kind === 'positive'
    ? 'border-emerald-200 bg-emerald-50/35'
    : finding.kind === 'risk'
      ? 'border-rose-200 bg-rose-50/30'
      : finding.kind === 'opportunity'
        ? 'border-indigo-200 bg-indigo-50/25'
        : 'border-slate-200 bg-white'

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-w-0 flex-col rounded-xl border p-4 text-left shadow-sm transition-colors hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/30 ${accent} ${selected ? 'ring-2 ring-indigo-300' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
          {FINDING_KIND_LABELS[finding.kind]}
        </span>
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${finding.evidenceTier === 'STRONG' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : finding.evidenceTier === 'REPEATED' || finding.evidenceTier === 'EMERGING' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
          {evidenceTierLabel(finding.evidenceTier)}
        </span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          {FINDING_CLASSIFICATION_LABELS[finding.classification]}
        </span>
      </div>
      <h4 className="mt-3 text-sm font-black leading-5 text-slate-950">{finding.title}</h4>
      {finding.description && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">{finding.description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[11px] font-semibold text-slate-500">
        <span>{finding.mentionCount} mention{finding.mentionCount === 1 ? '' : 's'}</span>
        <span>{finding.sourceCount} source{finding.sourceCount === 1 ? '' : 's'}</span>
        <span>{finding.confidence === null ? 'Confidence unavailable' : `${Math.round(finding.confidence * 100)}% confidence`}</span>
        <span className="ml-auto text-indigo-700">View evidence</span>
      </div>
    </button>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

function nextAlertAction(status: string): { status: EventIssueClusterStatus; label: string } | null {
  if (status === 'NEW') return { status: 'ACKNOWLEDGED', label: 'Acknowledge' }
  if (status === 'ACKNOWLEDGED') return { status: 'ACTING', label: 'Mark Acting' }
  if (status === 'ACTING') return { status: 'RESOLVED', label: 'Resolve' }
  if (status === 'RESOLVED' || status === 'DISMISSED') return { status: 'NEW', label: 'Reopen' }
  return null
}

function userLabel(user: { email: string; firstName: string | null; lastName: string | null }) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
}

export function Dashboard2({
  analysisData,
  signalsData,
  keyInsightsData,
  signalsLoading,
  intelligenceData,
  intelligenceLoading,
  intelligenceError,
  eventId,
  dashboardSelection,
  surveyScopeLabel = 'All Surveys',
  surveyScopeMode = 'all',
  timePeriod: _timePeriod,
  humanizeAction,
  insightKeyByThemeKey = {},
  accountSlug = null,
  view = 'overview',
  intelligenceStrengthFilter = null,
  onIntelligenceStrengthFilterChange,
  activeIntelligenceFilter = null,
  onFilterByTarget,
  onFilterByQuestion,
  onClearIntelligenceFilter,
}: Dashboard2Props) {
  const [selectedThemeKey, setSelectedThemeKey] = useState<string | null>(null)
  const [selectedThemeKeys, setSelectedThemeKeys] = useState<string[]>([])
  const [selectedThemeMeta, setSelectedThemeMeta] = useState<{ label: string; count: number; sentimentLabel: string | null; evidenceHeading?: string } | null>(null)
  const [themeEvidenceDetail, setThemeEvidenceDetail] = useState<EventThemeEvidenceResult | null>(null)
  const [themeEvidenceLoading, setThemeEvidenceLoading] = useState(false)
  const [themeEvidenceError, setThemeEvidenceError] = useState<string | null>(null)
  const [attentionStatusOverrides, setAttentionStatusOverrides] = useState<Record<string, string>>({})
  const [statusSavingClusterId, setStatusSavingClusterId] = useState<string | null>(null)
  const [statusErrors, setStatusErrors] = useState<Record<string, string>>({})
  const [showAllAttentionQueue, setShowAllAttentionQueue] = useState(false)
  const [attentionView, setAttentionView] = useState<'ACTIVE' | 'HISTORY' | 'ALL'>('ACTIVE')
  const [selectedIssueDetailItem, setSelectedIssueDetailItem] = useState<EventIntelligenceAttentionItem | null>(null)
  const [selectedIssueEvidenceId, setSelectedIssueEvidenceId] = useState<string | null>(null)
  const [selectedAlertDetail, setSelectedAlertDetail] = useState<EventAlertDetail | null>(null)
  const [selectedAlertLoading, setSelectedAlertLoading] = useState(false)
  const [selectedAlertError, setSelectedAlertError] = useState<string | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [needsAttentionHeight, setNeedsAttentionHeight] = useState<number | null>(null)
  const [needsAttentionPanel, setNeedsAttentionPanel] = useState<HTMLDivElement | null>(null)
  const selectedIssueDetailRef = useRef<HTMLDivElement | null>(null)
  const needsAttentionRef = useRef<HTMLDivElement | null>(null)
  const selectedAlertRequestIdRef = useRef(0)
  // Retained for inactive legacy layouts while their URL-driven branches remain supported.
  const themeEvidenceRef = useRef<HTMLDivElement | null>(null)
  const setNeedsAttentionPanelRef = useCallback((node: HTMLDivElement | null) => {
    needsAttentionRef.current = node
    setNeedsAttentionPanel(node)
  }, [])

  const copyToClipboard = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600)
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fail silently.
    }
  }

  const selectAttentionItem = (item: EventIntelligenceAttentionItem, evidenceId?: string | null) => {
    if (selectedIssueDetailItem?.id === item.id) {
      setSelectedIssueDetailItem(null)
      setSelectedIssueEvidenceId(null)
      return
    }
    setSelectedIssueDetailItem(item)
    setSelectedIssueEvidenceId(evidenceId ?? item.representativeEvidence?.[0]?.id ?? null)
  }

  const openAttentionEvidence = (item: EventIntelligenceAttentionItem, evidenceId: string) => {
    selectAttentionItem(item, evidenceId)
  }

  const loadSelectedAlertDetail = async (clusterId: string) => {
    if (!accountSlug) return
    const requestId = ++selectedAlertRequestIdRef.current
    setSelectedAlertLoading(true)
    setSelectedAlertError(null)
    try {
      const res = await fetch(
        `/api/app/events/${eventId}/clusters/${clusterId}/status?account=${encodeURIComponent(accountSlug)}`,
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load alert detail')
      if (requestId === selectedAlertRequestIdRef.current) {
        setSelectedAlertDetail(json.data as EventAlertDetail)
      }
    } catch (error) {
      if (requestId === selectedAlertRequestIdRef.current) {
        setSelectedAlertError(error instanceof Error ? error.message : 'Failed to load alert detail')
        setSelectedAlertDetail(null)
      }
    } finally {
      if (requestId === selectedAlertRequestIdRef.current) setSelectedAlertLoading(false)
    }
  }

  const openThemeEvidence = (
    theme: Pick<EventIntelligenceTheme, 'themeKey' | 'label' | 'count' | 'sentimentLabel'> & { themeKeys?: string[] },
    evidenceHeading = 'Theme Evidence',
  ) => {
    if (!theme.themeKey || !accountSlug) return
    if (selectedThemeKey === theme.themeKey) {
      closeThemeEvidence()
      return
    }
    setSelectedThemeKey(theme.themeKey)
    setSelectedThemeKeys([...new Set([theme.themeKey, ...(theme.themeKeys ?? [])])])
    setSelectedThemeMeta({
      label: theme.label,
      count: theme.count,
      sentimentLabel: theme.sentimentLabel,
      evidenceHeading,
    })
  }

  const closeThemeEvidence = () => {
    setSelectedThemeKey(null)
    setSelectedThemeKeys([])
    setSelectedThemeMeta(null)
    setThemeEvidenceDetail(null)
    setThemeEvidenceError(null)
  }

  useEffect(() => {
    if (!selectedThemeKey) return
    if (!accountSlug) {
      setThemeEvidenceError('Account context is required to load theme evidence.')
      setThemeEvidenceDetail(null)
      setThemeEvidenceLoading(false)
      return
    }

    let cancelled = false
    setThemeEvidenceLoading(true)
    setThemeEvidenceError(null)
    setThemeEvidenceDetail(null)

    const fetchThemeEvidence = async () => {
      try {
        const params = serializeEventDashboardRequest({
          kind: 'evidence',
          accountSlug,
          selection: dashboardSelection,
        })
        if (selectedThemeKeys.length > 1) params.set('themeKeys', selectedThemeKeys.join(','))
        const res = await fetch(
          `/api/app/events/${eventId}/themes/${encodeURIComponent(selectedThemeKey)}/evidence?${params.toString()}`,
        )
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || json.message || 'Failed to load theme evidence')
        }
        if (!cancelled) {
          setThemeEvidenceDetail(json.data as EventThemeEvidenceResult)
        }
      } catch (error) {
        if (!cancelled) {
          setThemeEvidenceError(error instanceof Error ? error.message : 'Failed to load theme evidence')
        }
      } finally {
        if (!cancelled) {
          setThemeEvidenceLoading(false)
        }
      }
    }

    fetchThemeEvidence()

    return () => {
      cancelled = true
    }
  }, [accountSlug, eventId, dashboardSelection, selectedThemeKey, selectedThemeKeys])

  const topIntelligenceThemes = intelligenceData?.topThemes ?? []
  const topIntelligenceActions = intelligenceData?.topActions ?? []
  const targetBreakdown = intelligenceData?.targetBreakdown ?? []
  const questionBreakdown = intelligenceData?.questionBreakdown ?? []
  const attentionQueue = intelligenceData?.attentionQueue ?? []
  const structuredMetrics = intelligenceData?.structuredMetrics ?? []
  const attentionStatusVersion = attentionQueue
    .map((item) => `${item.id ?? 'missing'}:${item.status}`)
    .join('|')
  const displayAttentionQueue = attentionQueue.map((item) => ({
    ...item,
    status: item.id ? attentionStatusOverrides[item.id] ?? item.status : item.status,
  }))
  const filteredAttentionQueue = displayAttentionQueue.filter((item) => {
    if (attentionView === 'ALL') return true
    const active = isActiveEventIssueClusterStatus(item.status)
    return attentionView === 'ACTIVE' ? active : !active
  })
  const queueHasOverflow = filteredAttentionQueue.length > ATTENTION_QUEUE_PREVIEW_LIMIT
  const visibleAttentionQueue = showAllAttentionQueue
    ? filteredAttentionQueue
    : filteredAttentionQueue.slice(0, ATTENTION_QUEUE_PREVIEW_LIMIT)
  const hasLocalStatusOverrides = Object.keys(attentionStatusOverrides).length > 0
  const activeAttentionItems = !hasLocalStatusOverrides && typeof intelligenceData?.activeAttentionCount === 'number'
    ? intelligenceData.activeAttentionCount
    : displayAttentionQueue.filter((item) => isActiveEventIssueClusterStatus(item.status)).length
  const activeAttentionQueue = displayAttentionQueue.filter((item) => isActiveEventIssueClusterStatus(item.status))
  const affectedAreaCount = new Set(
    activeAttentionQueue.map((item) => item.affectedTarget?.name ?? item.surveyTargetId ?? item.taxonomyKey).filter(Boolean),
  ).size
  const priorityCounts = activeAttentionQueue.reduce<Record<EventPriorityLevel, number>>((acc, item) => {
    const priority = normalizePriorityLevel(item.priorityLevel)
    acc[priority] += 1
    return acc
  }, {
    Immediate: 0,
    Soon: 0,
    Watch: 0,
    Informational: 0,
  })
  const livePulse = intelligenceData?.eventPulse
  const livePriority = normalizePriorityLevel(livePulse?.priorityLevel ?? livePulse?.urgency)
  const maxTargetAnswers = Math.max(0, ...targetBreakdown.map((target) => target.answerCount))
  const maxQuestionAnswers = Math.max(0, ...questionBreakdown.map((question) => question.answerCount))
  const actionBriefs = buildActionBriefs(displayAttentionQueue, { limit: 5 })
  const sponsorActivationValues = buildSponsorActivationValues(targetBreakdown, displayAttentionQueue, { limit: 6 })
  const inferredSatisfaction = getInferredSatisfactionSummary(intelligenceData)
  const factualSnapshot = intelligenceData
    ? buildEventIntelligenceFactualSnapshot(intelligenceData)
    : null
  const selectedIssueDetailKey = selectedIssueDetailItem
    ? selectedIssueDetailItem.id ?? `${selectedIssueDetailItem.taxonomyKey}-${selectedIssueDetailItem.title}-${selectedIssueDetailItem.lastSeenAt}`
    : null
  const selectedAttentionItem = selectedIssueDetailItem
  const selectedIssueEvidence = selectedAlertDetail?.evidence ?? []
  const selectedEvidence =
    selectedIssueEvidence.find((evidence) => evidence.id === selectedIssueEvidenceId) ??
    selectedIssueEvidence[0] ??
    null
  const firstAttentionItemKey =
    filteredAttentionQueue[0]?.id ??
    (filteredAttentionQueue[0] ? `${filteredAttentionQueue[0].taxonomyKey}-${filteredAttentionQueue[0].title}-${filteredAttentionQueue[0].lastSeenAt}` : null)
  const intelligenceFindings = intelligenceData?.canonicalFindings ?? buildEventIntelligenceFindings({
    themes: topIntelligenceThemes,
    actions: topIntelligenceActions,
    targets: targetBreakdown,
    issues: displayAttentionQueue,
    context: {
      eventName: intelligenceData?.eventName,
      eventType: intelligenceData?.eventType,
    },
  })
  // The overview used to consume raw topThemes while the newer Intelligence
  // presentation consumed canonical findings. That allowed equivalent themes
  // to reappear as separate cards despite being consolidated everywhere else.
  // Build the theme-only projection through the same canonical aggregator so
  // overview cards, summaries, decisions, drilldowns, and briefs agree.
  const canonicalOverviewThemes = intelligenceFindings
    .filter((finding) => finding.kind !== 'opportunity')
    .map((finding): EventIntelligenceTheme & { themeKeys: string[] } => {
    return {
      themeKey: finding.evidenceThemeKey,
      themeKeys: finding.evidenceThemeKeys,
      label: finding.title,
      count: finding.mentionCount,
      sentimentLabel: finding.sentimentLabel,
      confidence: finding.confidence,
      statement: finding.description,
      questionIntent: finding.kind === 'positive'
        ? 'strength'
        : finding.kind === 'risk' || finding.kind === 'signal'
          ? 'friction'
          : 'neutral',
      evidence: finding.evidence,
      supportingAnswerIds: finding.supportingAnswerIds,
      supportingResponseIds: finding.supportingResponseIds,
      supportingEvidenceIds: finding.supportingEvidenceIds,
      supportingTargetIds: finding.supportingTargetIds,
    }
  })
  const canonicalOverviewActions = intelligenceFindings
    .filter((finding) => finding.kind === 'opportunity')
    .map((finding): EventIntelligenceAction => ({
      themeKey: finding.evidenceThemeKey,
      title: finding.title,
      description: finding.description,
      count: finding.mentionCount,
      priority: 'LOW',
      priorityLevel: finding.classification === 'current-event' ? 'Soon' : 'Watch',
      urgency: 'LOW',
      actionWindow: finding.classification === 'current-event' ? 'NOW' : 'LATER',
      status: 'OPEN',
      confidence: finding.confidence,
      supportingAnswerIds: finding.supportingAnswerIds,
      supportingResponseIds: finding.supportingResponseIds,
      supportingEvidenceIds: finding.supportingEvidenceIds,
    }))
  const overview = buildInEventOverview({
    themes: canonicalOverviewThemes,
    actions: canonicalOverviewActions,
    issues: displayAttentionQueue,
  })
  const visibleIntelligenceFindings = intelligenceStrengthFilter
    ? intelligenceFindings.filter((finding) => finding.evidenceStrength === intelligenceStrengthFilter)
    : intelligenceFindings
  const findingsByKind = visibleIntelligenceFindings.reduce<Record<EventIntelligenceFindingKind, EventIntelligenceFinding[]>>((groups, finding) => {
    groups[finding.kind].push(finding)
    return groups
  }, { theme: [], signal: [], opportunity: [], positive: [], risk: [] })
  const representedTargetCount = factualSnapshot?.coverage.representedFeedbackPoints ?? 0
  const overviewSummary = buildInEventOverviewSummary({
    eventName: intelligenceData?.eventName,
    responseCount: factualSnapshot?.responseCount ?? 0,
    answerCount: factualSnapshot?.analyzedAnswerCount ?? 0,
    representedFeedbackPoints: representedTargetCount,
    configuredFeedbackPoints: factualSnapshot?.coverage.configuredFeedbackPoints ?? 0,
    sentimentPercent: factualSnapshot?.sentiment.percent ?? null,
    findings: intelligenceFindings,
    overview,
  })
  const representedQuestionCount = questionBreakdown.filter((question) => question.answerCount > 0).length
  const statusCounts = displayAttentionQueue.reduce<Record<string, number>>((acc, item) => {
    const key = humanizeIntelligenceLabel(item.status || 'ACTIVE')
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const statusSummary = Object.entries(statusCounts).slice(0, 4)

  useEffect(() => {
    setAttentionStatusOverrides({})
    setStatusErrors({})
    setStatusSavingClusterId(null)
  }, [eventId, intelligenceData?.eventId, attentionStatusVersion])

  useEffect(() => {
    setShowAllAttentionQueue(false)
    setSelectedIssueDetailItem((current) => {
      if (!current) {
        setSelectedIssueEvidenceId(null)
        return null
      }

      const currentKey = current.id ?? `${current.taxonomyKey}-${current.title}-${current.lastSeenAt}`
      const visibleItem = filteredAttentionQueue.find((item) => (
        (item.id ?? `${item.taxonomyKey}-${item.title}-${item.lastSeenAt}`) === currentKey
      ))
      if (!visibleItem) {
        setSelectedIssueEvidenceId(null)
        return null
      }
      return visibleItem
    })
  }, [eventId, intelligenceData?.eventId, activeIntelligenceFilter?.type, activeIntelligenceFilter?.label, attentionView, firstAttentionItemKey])

  useEffect(() => {
    if (view !== 'intelligence' || !selectedThemeKey) return
    if (visibleIntelligenceFindings.some((finding) => finding.evidenceThemeKey === selectedThemeKey)) return
    closeThemeEvidence()
  }, [view, selectedThemeKey, activeIntelligenceFilter?.type, activeIntelligenceFilter?.label, intelligenceStrengthFilter, intelligenceData?.eventId])

  useLayoutEffect(() => {
    const attentionPanel = needsAttentionPanel
    if (!attentionPanel || typeof ResizeObserver === 'undefined' || typeof window === 'undefined') return

    const desktopQuery = window.matchMedia('(min-width: 1280px)')
    const syncDetailHeight = () => {
      setNeedsAttentionHeight(desktopQuery.matches ? Math.ceil(attentionPanel.getBoundingClientRect().height) : null)
    }
    const observer = new ResizeObserver(syncDetailHeight)

    observer.observe(attentionPanel)
    syncDetailHeight()
    desktopQuery.addEventListener('change', syncDetailHeight)

    return () => {
      observer.disconnect()
      desktopQuery.removeEventListener('change', syncDetailHeight)
    }
  }, [needsAttentionPanel])

  useEffect(() => {
    const clusterId = selectedIssueDetailItem?.id
    setActionReason('')
    setNoteDraft('')
    if (!clusterId || !accountSlug) {
      setSelectedAlertDetail(null)
      return
    }
    void loadSelectedAlertDetail(clusterId)
  }, [selectedIssueDetailItem?.id, accountSlug, eventId])

  const selectAttentionEvidenceById = (evidenceId: string) => {
    const item = displayAttentionQueue.find((candidate) =>
      candidate.representativeEvidence.some((evidence) => evidence.id === evidenceId),
    )
    if (item) {
      selectAttentionItem(item, evidenceId)
    }
  }

  const updateAttentionStatus = async (clusterId: string, nextStatus: EventIssueClusterStatus, reason?: string) => {
    if (!accountSlug) {
      setStatusErrors((current) => ({
        ...current,
        [clusterId]: 'Account context is required to update status.',
      }))
      return
    }

    setStatusSavingClusterId(clusterId)
    setStatusErrors((current) => {
      const next = { ...current }
      delete next[clusterId]
      return next
    })

    try {
      const res = await fetch(
        `/api/app/events/${eventId}/clusters/${clusterId}/status?account=${encodeURIComponent(accountSlug)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus, reason }),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Failed to update status')
      }
      const updatedStatus = json.data?.status
      setAttentionStatusOverrides((current) => ({
        ...current,
        [clusterId]: updatedStatus ?? nextStatus,
      }))
      setSelectedIssueDetailItem((current) => (
        current?.id === clusterId ? { ...current, status: updatedStatus ?? nextStatus } : current
      ))
      setActionReason('')
      await loadSelectedAlertDetail(clusterId)
    } catch (error) {
      setStatusErrors((current) => ({
        ...current,
        [clusterId]: error instanceof Error ? error.message : 'Failed to update status',
      }))
    } finally {
      setStatusSavingClusterId((current) => (current === clusterId ? null : current))
    }
  }

  const assignAttentionOwner = async (clusterId: string, ownerUserId: string) => {
    if (!accountSlug || !ownerUserId) return
    setStatusSavingClusterId(clusterId)
    try {
      const res = await fetch(
        `/api/app/events/${eventId}/clusters/${clusterId}/status?account=${encodeURIComponent(accountSlug)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerUserId }),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to assign owner')
      await loadSelectedAlertDetail(clusterId)
    } catch (error) {
      setStatusErrors((current) => ({ ...current, [clusterId]: error instanceof Error ? error.message : 'Failed to assign owner' }))
    } finally {
      setStatusSavingClusterId(null)
    }
  }

  const addAttentionNote = async (clusterId: string) => {
    if (!accountSlug || !noteDraft.trim()) return
    setStatusSavingClusterId(clusterId)
    try {
      const res = await fetch(
        `/api/app/events/${eventId}/clusters/${clusterId}/status?account=${encodeURIComponent(accountSlug)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: noteDraft }),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to add note')
      setNoteDraft('')
      await loadSelectedAlertDetail(clusterId)
    } catch (error) {
      setStatusErrors((current) => ({ ...current, [clusterId]: error instanceof Error ? error.message : 'Failed to add note' }))
    } finally {
      setStatusSavingClusterId(null)
    }
  }

  const closeIssueEvidence = () => {
    selectedAlertRequestIdRef.current += 1
    setSelectedAlertLoading(false)
    setSelectedIssueDetailItem(null)
    setSelectedIssueEvidenceId(null)
  }
  const evidenceDrawers = (
    <>
      <EventEvidenceDrawer
        open={Boolean(selectedThemeKey)}
        title={selectedThemeMeta?.label ?? themeEvidenceDetail?.themeLabel ?? 'Theme evidence'}
        eyebrow={selectedThemeMeta?.evidenceHeading ?? 'Evidence'}
        onClose={closeThemeEvidence}
      >
        <EventThemeEvidencePanel loading={themeEvidenceLoading} error={themeEvidenceError} detail={themeEvidenceDetail} fallbackTheme={selectedThemeMeta} heading="Supporting responses" onClear={closeThemeEvidence} />
      </EventEvidenceDrawer>
      <EventEvidenceDrawer
        open={Boolean(selectedIssueDetailItem)}
        title={selectedIssueDetailItem?.title ?? 'Issue evidence'}
        eyebrow="Current event · supporting evidence"
        summary={selectedIssueDetailItem?.summary ?? selectedIssueDetailItem?.recommendedNextStep}
        onClose={closeIssueEvidence}
      >
        {selectedIssueDetailItem && <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-3">
            <div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Evidence</dt><dd className="mt-1 font-bold text-slate-800">{selectedIssueDetailItem.evidenceCount} items</dd></div>
            <div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Status</dt><dd className="mt-1 font-bold text-slate-800">{humanizeIntelligenceLabel(selectedIssueDetailItem.status)}</dd></div>
            <div><dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Source</dt><dd className="mt-1 font-bold text-slate-800">{selectedIssueDetailItem.affectedTarget?.name ?? 'Event-wide feedback'}</dd></div>
          </dl>
          <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">What people said</p><div className="mt-3 space-y-3">{selectedAlertLoading ? <div data-testid="issue-evidence-loading" className="h-28 animate-pulse rounded-2xl bg-slate-100" /> : selectedAlertError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{selectedAlertError}</p> : selectedIssueEvidence.length ? selectedIssueEvidence.map((evidence) => <article key={evidence.id} className="rounded-2xl border border-slate-200 border-l-4 border-l-indigo-200 p-4"><p className="text-[14px] leading-6 text-slate-700">&ldquo;{evidence.transcriptSnippet || evidence.answer.answerTranscript?.text || 'Transcript unavailable.'}&rdquo;</p><p className="mt-2 text-[11px] text-slate-400">{formatIntelligenceDate(evidence.createdAt)} · {humanizeIntelligenceLabel(evidence.priorityLevel)}</p></article>) : <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Evidence will appear as analyzed responses accumulate.</p>}</div></div>
          <EventIntelligenceActionPanel
            eventId={eventId}
            accountSlug={accountSlug ?? ''}
            finding={selectedIssueDetailItem}
            onOpenAction={(actionId) => {
              const params = new URLSearchParams(window.location.search)
              params.set('tab', 'actions')
              params.set('actionId', actionId)
              window.location.assign(`${window.location.pathname}?${params.toString()}`)
            }}
          />
        </div>}
      </EventEvidenceDrawer>
    </>
  )

  // Loading skeleton
  if (view !== 'intelligence' && signalsLoading && !signalsData) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse h-40" />
        ))}
      </div>
    )
  }

  if (view === 'intelligence' && intelligenceData) {
    return (
      <div className="space-y-6">
        {intelligenceError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Refresh failed. Showing the most recent intelligence.</div>}
        {intelligenceLoading && <div role="status" className="sr-only">Refreshing intelligence</div>}
        <EventInEventIntelligence
          currentIssues={activeAttentionQueue}
          currentFindings={visibleIntelligenceFindings.filter((finding) => finding.classification === 'current-event' || (finding.kind === 'risk' && finding.evidenceTier !== 'ISOLATED'))}
          workingFindings={visibleIntelligenceFindings.filter((finding) => finding.kind === 'positive')}
          nextEventFindings={visibleIntelligenceFindings.filter((finding) => finding.classification === 'next-event')}
          afterEventFindings={visibleIntelligenceFindings.filter((finding) => finding.classification === 'after-event')}
          selectedThemeKey={selectedThemeKey}
          selectedIssue={selectedIssueDetailItem}
          strengthFilter={intelligenceStrengthFilter}
          onStrengthFilterChange={onIntelligenceStrengthFilterChange}
          sourceOptions={targetBreakdown.filter((target): target is EventIntelligenceTargetBreakdown & { surveyTargetId: string } => Boolean(target.surveyTargetId)).map((target) => ({ id: target.surveyTargetId, label: target.name }))}
          questionOptions={questionBreakdown.filter((question): question is EventIntelligenceQuestionBreakdown & { questionId: string } => Boolean(question.questionId)).map((question) => ({ id: question.questionId, label: question.label }))}
          selectedSourceId={activeIntelligenceFilter?.type === 'target' ? activeIntelligenceFilter.surveyTargetId ?? '' : ''}
          selectedQuestionId={activeIntelligenceFilter?.type === 'question' ? activeIntelligenceFilter.questionId ?? '' : ''}
          onSourceChange={(id) => {
            const target = targetBreakdown.find((item) => item.surveyTargetId === id)
            if (target?.surveyTargetId) onFilterByTarget?.({ surveyTargetId: target.surveyTargetId, label: target.name })
            else onClearIntelligenceFilter?.()
          }}
          onQuestionChange={(id) => {
            const question = questionBreakdown.find((item) => item.questionId === id)
            if (question?.questionId) onFilterByQuestion?.({ questionId: question.questionId, label: question.label })
            else onClearIntelligenceFilter?.()
          }}
          onReviewFinding={(finding) => openThemeEvidence({
            themeKey: finding.evidenceThemeKey,
            themeKeys: finding.evidenceThemeKeys,
            label: finding.title,
            count: finding.mentionCount,
            sentimentLabel: finding.sentimentLabel,
          }, findingEvidenceHeading(finding.kind))}
          onReviewIssue={(issue) => {
            const item = displayAttentionQueue.find((candidate) => candidate.id === issue.id || candidate.taxonomyKey === issue.taxonomyKey)
            if (item) selectAttentionItem(item)
          }}
        />

        {evidenceDrawers}
      </div>
    )
  }

  if (view === 'intelligence') {
    const sections: Array<{
      key: EventIntelligenceFindingKind
      title: string
      description: string
    }> = [
      { key: 'theme', title: 'Evidence-backed themes', description: 'Repeated themes that are not already promoted into operational review.' },
      { key: 'signal', title: 'Emerging signals', description: 'Early patterns with weak evidence. Treat these as observations, not conclusions.' },
      { key: 'opportunity', title: 'Cross-response opportunities', description: 'Suggested learning horizons derived from repeated analyzed answers.' },
      { key: 'positive', title: 'Positive intelligence', description: 'Evidenced strengths to preserve without automatically creating an action.' },
      { key: 'risk', title: 'Risks and friction', description: 'Evidence-backed friction not already promoted to the operational queue.' },
    ]

    return (
      <div className="space-y-5" data-testid="signals-intelligence-workspace">
        {intelligenceLoading && !intelligenceData ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : intelligenceError ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Event intelligence is unavailable right now.
          </div>
        ) : !intelligenceData ? (
          <EmptyIntelligenceState message="No intelligence yet. Responses will appear here once attendees start answering." />
        ) : (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="intelligence-filters">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Evidence controls</p>
                  <h3 className="mt-1 text-sm font-black text-slate-950">Filter intelligence</h3>
                  <p className="mt-1 text-xs text-slate-500">Filters stay in the URL so this evidence view can be refreshed or shared.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(['strong', 'directional', 'weak'] as const).map((strength) => (
                    <button
                      key={strength}
                      type="button"
                      aria-pressed={intelligenceStrengthFilter === strength}
                      onClick={() => onIntelligenceStrengthFilterChange?.(intelligenceStrengthFilter === strength ? null : strength)}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${intelligenceStrengthFilter === strength ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                    >
                      {EVIDENCE_STRENGTH_LABELS[strength]}
                    </button>
                  ))}
                  {intelligenceStrengthFilter && (
                    <button type="button" onClick={() => onIntelligenceStrengthFilterChange?.(null)} className="px-2 py-2 text-xs font-bold text-indigo-700 hover:underline">
                      Clear strength filter
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-600">
                  Evidence source
                  <select
                    value={activeIntelligenceFilter?.type === 'target' ? activeIntelligenceFilter.surveyTargetId : ''}
                    onChange={(event) => {
                      const target = targetBreakdown.find((item) => item.surveyTargetId === event.target.value)
                      if (target?.surveyTargetId) onFilterByTarget?.({ surveyTargetId: target.surveyTargetId, label: target.name })
                      else onClearIntelligenceFilter?.()
                    }}
                    className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-800"
                  >
                    <option value="">All sources</option>
                    {targetBreakdown.filter((target) => target.surveyTargetId).map((target) => <option key={target.surveyTargetId!} value={target.surveyTargetId!}>{target.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Question
                  <select
                    value={activeIntelligenceFilter?.type === 'question' ? activeIntelligenceFilter.questionId : ''}
                    onChange={(event) => {
                      const question = questionBreakdown.find((item) => item.questionId === event.target.value)
                      if (question?.questionId) onFilterByQuestion?.({ questionId: question.questionId, label: question.label })
                      else onClearIntelligenceFilter?.()
                    }}
                    className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-800"
                  >
                    <option value="">All questions</option>
                    {questionBreakdown.filter((question) => question.questionId).map((question) => <option key={question.questionId!} value={question.questionId!}>{question.label}</option>)}
                  </select>
                </label>
              </div>
              {activeIntelligenceFilter && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">
                  <span>Filtered by {activeIntelligenceFilter.type === 'target' ? 'source' : 'question'}: {activeIntelligenceFilter.label}</span>
                  <button type="button" onClick={onClearIntelligenceFilter} className="font-black underline underline-offset-2">Clear coverage filter</button>
                </div>
              )}
            </section>

            {visibleIntelligenceFindings.length === 0 ? (
              <EmptyIntelligenceState message="No additional patterns are emerging yet." />
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {sections.map((section) => (
                  <section key={section.key} data-testid={`intelligence-${section.key}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-black text-slate-950">{section.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{section.description}</p>
                    {findingsByKind[section.key].length > 0 ? (
                      <div className="mt-3 grid grid-cols-1 gap-3">
                        {findingsByKind[section.key].map((finding) => (
                          <FindingCard
                            key={finding.id}
                            finding={finding}
                            selected={selectedThemeKey === finding.evidenceThemeKey && selectedThemeMeta?.label === finding.title}
                            onSelect={() => openThemeEvidence({
                              themeKey: finding.evidenceThemeKey,
                              themeKeys: finding.evidenceThemeKeys,
                              label: finding.title,
                              count: finding.mentionCount,
                              sentimentLabel: finding.sentimentLabel,
                            }, findingEvidenceHeading(finding.kind))}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">No findings in this category for the current filters.</p>
                    )}
                  </section>
                ))}
              </div>
            )}

            {false && selectedThemeKey && (
              <div ref={themeEvidenceRef}>
                <ThemeEvidencePanel
                  loading={themeEvidenceLoading}
                  error={themeEvidenceError}
                  detail={themeEvidenceDetail}
                  fallbackTheme={selectedThemeMeta}
                  heading={selectedThemeMeta?.evidenceHeading}
                  onClear={closeThemeEvidence}
                />
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  if (intelligenceData) {
    return (
      <div className="space-y-6">
        <EventInEventOverview
          eventId={eventId}
          accountSlug={accountSlug ?? ''}
          summary={overviewSummary}
          sentimentPercent={factualSnapshot?.sentiment.percent ?? null}
          sentimentBreakdown={factualSnapshot?.sentiment ?? { favorable: 0, neutral: 0, negative: 0, total: 0 }}
          responseCount={factualSnapshot?.responseCount ?? 0}
          answerCount={factualSnapshot?.analyzedAnswerCount ?? 0}
          representedFeedbackPoints={representedTargetCount}
          configuredFeedbackPoints={factualSnapshot?.coverage.configuredFeedbackPoints ?? 0}
          themes={canonicalOverviewThemes}
          issues={activeAttentionQueue}
          overview={overview}
          sourceCoverage={targetBreakdown.map((target) => ({
            id: target.surveyTargetId,
            label: target.name,
            count: target.answerCount,
            active: activeIntelligenceFilter?.type === 'target' && activeIntelligenceFilter.surveyTargetId === target.surveyTargetId,
            onSelect: target.surveyTargetId && onFilterByTarget
              ? () => activeIntelligenceFilter?.type === 'target' && activeIntelligenceFilter.surveyTargetId === target.surveyTargetId
                ? onClearIntelligenceFilter?.()
                : onFilterByTarget({ surveyTargetId: target.surveyTargetId!, label: target.name })
              : undefined,
          }))}
          questionCoverage={questionBreakdown.map((question) => ({
            id: question.questionId,
            label: question.label,
            count: question.answerCount,
            active: activeIntelligenceFilter?.type === 'question' && activeIntelligenceFilter.questionId === question.questionId,
            onSelect: question.questionId && onFilterByQuestion
              ? () => activeIntelligenceFilter?.type === 'question' && activeIntelligenceFilter.questionId === question.questionId
                ? onClearIntelligenceFilter?.()
                : onFilterByQuestion({ questionId: question.questionId!, label: question.label })
              : undefined,
          }))}
          hasActiveCoverageFilter={Boolean(activeIntelligenceFilter)}
          onClearCoverageFilter={onClearIntelligenceFilter}
          onReviewTheme={openThemeEvidence}
          onReviewIssue={(issue) => {
            const item = displayAttentionQueue.find((candidate) => candidate.id === issue.id || candidate.taxonomyKey === issue.taxonomyKey)
            if (item) selectAttentionItem(item)
          }}
          followUpHrefs={{
            open: `/app/events/${encodeURIComponent(eventId)}/dashboard?account=${encodeURIComponent(accountSlug ?? '')}&tab=actions&actionView=open`,
            unclaimed: `/app/events/${encodeURIComponent(eventId)}/dashboard?account=${encodeURIComponent(accountSlug ?? '')}&tab=actions&actionView=unclaimed`,
            afterEvent: `/app/events/${encodeURIComponent(eventId)}/dashboard?account=${encodeURIComponent(accountSlug ?? '')}&tab=actions&actionView=after-event`,
          }}
        />

        {selectedIssueDetailItem && (
          <section ref={selectedIssueDetailRef} data-testid="selected-issue-detail-panel" className="hidden scroll-mt-6 rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_8px_26px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">Selected issue</p>
                <h2 className="mt-1 text-[17px] font-bold text-slate-950">{selectedIssueDetailItem.title}</h2>
                {selectedIssueDetailItem.summary && <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">{selectedIssueDetailItem.summary}</p>}
              </div>
              <button type="button" onClick={() => setSelectedIssueDetailItem(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-violet-300 hover:text-violet-700">Close</button>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Attendee evidence ({selectedIssueDetailItem.representativeEvidence.length})</h3>
                {selectedIssueDetailItem.representativeEvidence.length > 0 ? selectedIssueDetailItem.representativeEvidence.map((evidence) => (
                  <button key={evidence.id} type="button" onClick={() => openAttentionEvidence(selectedIssueDetailItem, evidence.id)} className={`block w-full rounded-xl border p-4 text-left ${selectedIssueEvidenceId === evidence.id ? 'border-violet-300 bg-violet-50/50' : 'border-slate-200 bg-slate-50/50 hover:border-violet-300'}`}>
                    <p className="text-[13px] italic leading-6 text-slate-700">“{evidence.transcriptSnippet}”</p>
                    <p className="mt-2 text-[11px] text-slate-500">{formatIntelligenceDate(evidence.createdAt)} · {humanizeIntelligenceLabel(evidence.priorityLevel)}</p>
                  </button>
                )) : <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Evidence will appear as analyzed responses accumulate.</p>}
              </div>
              <aside className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Follow-up</h3>
                <p className="mt-2 text-sm font-semibold text-slate-900">Status: {humanizeIntelligenceLabel(selectedIssueDetailItem.status)}</p>
                {selectedIssueDetailItem.recommendedNextStep && <p className="mt-2 text-xs leading-5 text-slate-600">{selectedIssueDetailItem.recommendedNextStep}</p>}
                {selectedAlertLoading && <p className="mt-3 text-xs text-slate-500">Loading workflow…</p>}
                {selectedAlertError && <p role="alert" className="mt-3 text-xs text-amber-700">{selectedAlertError}</p>}
                {selectedAlertDetail && selectedIssueDetailItem.id && (
                  <div className="mt-4 space-y-3">
                    <label className="block text-[11px] font-bold text-slate-600">Owner
                      <select value={selectedAlertDetail.ownerUserId ?? ''} onChange={(event) => assignAttentionOwner(selectedIssueDetailItem.id!, event.target.value)} disabled={statusSavingClusterId === selectedIssueDetailItem.id} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                        <option value="">Unassigned</option>
                        {selectedAlertDetail.availableOwners.map((owner) => <option key={owner.id} value={owner.id}>{userLabel(owner)}</option>)}
                      </select>
                    </label>
                    <div className="flex gap-2">
                      <input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add an internal note" aria-label="Internal alert note" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                      <button type="button" onClick={() => addAttentionNote(selectedIssueDetailItem.id!)} disabled={!noteDraft.trim() || statusSavingClusterId === selectedIssueDetailItem.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Add</button>
                    </div>
                    <input value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Reason for status change" aria-label="Alert action reason" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                    <div className="flex flex-wrap gap-2">
                      {nextAlertAction(selectedIssueDetailItem.status) && <button type="button" onClick={() => { const action = nextAlertAction(selectedIssueDetailItem.status); if (action) void updateAttentionStatus(selectedIssueDetailItem.id!, action.status, actionReason) }} disabled={statusSavingClusterId === selectedIssueDetailItem.id || (selectedIssueDetailItem.status === 'ACTING' && !actionReason.trim())} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{nextAlertAction(selectedIssueDetailItem.status)?.label}</button>}
                      {isActiveEventIssueClusterStatus(selectedIssueDetailItem.status) && <button type="button" onClick={() => updateAttentionStatus(selectedIssueDetailItem.id!, 'DISMISSED', actionReason)} disabled={!actionReason.trim() || statusSavingClusterId === selectedIssueDetailItem.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Dismiss</button>}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}

        {false && selectedThemeKey && (
          <div ref={themeEvidenceRef}>
            <ThemeEvidencePanel loading={themeEvidenceLoading} error={themeEvidenceError} detail={themeEvidenceDetail} fallbackTheme={selectedThemeMeta} onClear={closeThemeEvidence} />
          </div>
        )}
        {evidenceDrawers}
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Live command-center intelligence from /intelligence */}
      <section className="flex flex-col gap-4">
        {intelligenceLoading && !intelligenceData ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="h-44 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800 lg:col-span-2" />
            <div className="h-44 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ) : intelligenceError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-700">
            Event intelligence is unavailable right now. The rest of the dashboard is still available.
          </div>
        ) : !intelligenceData ? (
          <EmptyIntelligenceState message="No intelligence yet. Responses will appear here once attendees start answering." />
        ) : (
          <>
            <section data-testid="sponsor-activation-value" className="order-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-orange-200 bg-orange-50 text-[9px] font-black text-orange-600">SP</span>
                <h3 className="text-sm font-black tracking-tight text-slate-950 dark:text-zinc-100">Sponsor Activation Value</h3>
              </div>

              {sponsorActivationValues.length > 0 ? (
                <ul
                  data-testid="sponsor-activation-grid"
                  className={sponsorActivationValues.length === 1 ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-2'}
                >
                  {sponsorActivationValues.map((sponsor) => (
                    <li
                      key={sponsor.surveyTargetId ?? sponsor.name}
                      data-testid="sponsor-activation-card"
                      className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{sponsor.name}</p>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            sponsor.sentimentLabel === 'negative'
                              ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
                              : sponsor.sentimentLabel === 'positive'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {sponsor.sentimentLabel === 'neutral' ? 'No signal' : sponsor.sentimentLabel}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:gap-6">
                        <div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-zinc-400">
                            <span>{sponsor.mentions} mention{sponsor.mentions === 1 ? '' : 's'}</span>
                            <span>{sponsor.responseCount} response{sponsor.responseCount === 1 ? '' : 's'}</span>
                            {sponsor.highUrgencyCount > 0 && <span>{sponsor.highUrgencyCount} urgent</span>}
                          </div>
                          {sponsor.topThemes.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {sponsor.topThemes.slice(0, 4).map((theme) => (
                                <span
                                  key={theme.label}
                                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                                >
                                  {theme.label} · {theme.count}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {sponsor.issues.length > 0 && (
                          <ul className="space-y-2 border-t border-slate-200 pt-2 dark:border-zinc-800 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                          {sponsor.issues.map((issue) => (
                            <li key={issue.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${getPriorityBadgeClass(issue.severity)}`}>
                                  {issue.severity}
                                </span>
                              <span className="truncate text-xs font-semibold text-slate-800 dark:text-zinc-200">{issue.title}</span>
                              </div>
                              {issue.evidenceId && (
                                <button
                                  type="button"
                                  onClick={() => selectAttentionEvidenceById(issue.evidenceId as string)}
                                  className="inline-flex items-center text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300"
                                >
                                  View evidence
                                </button>
                              )}
                            </li>
                          ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  No sponsor activation feedback yet.
                </p>
              )}
            </section>

            <div data-testid="event-overview" className="order-1 space-y-3 text-slate-950">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Event overview</p>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{overviewSummary}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getPriorityBadgeClass(livePriority)}`}>
                      {livePriority}
                    </span>
                  </div>
                  <div className="mt-5">
                    <InferredSatisfactionBar summary={inferredSatisfaction} />
                  </div>
                  <p className="mt-3 text-[11px] font-semibold text-slate-400">
                    Scope: {surveyScopeMode === 'survey' ? surveyScopeLabel : 'All Surveys'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Priority Mix</h3>
                    <span className="text-[11px] font-semibold text-slate-400">{activeAttentionItems} attention items</span>
                  </div>
                  <PriorityMixDonut priorityCounts={priorityCounts} />
                </div>
              </div>

              {structuredMetrics.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {structuredMetrics.map((metric) => (
                    <div key={metric.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            {metric.questionType === 'RATING_1_TO_5' ? 'Average rating' : metric.questionType === 'RECOMMENDATION_0_TO_10' ? 'Recommendation average' : 'Yes / No split'}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">{metric.questionLabel}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{[metric.surveyName, metric.surveyTargetName].filter(Boolean).join(' · ') || 'Event-wide'}</p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {metric.sampleStrength.label}
                        </span>
                      </div>
                      <div className="mt-3 flex items-end gap-3">
                        <p className="text-2xl font-black text-slate-950">{metric.questionType === 'YES_NO' ? `${metric.distribution['1'] ?? 0} Yes · ${metric.distribution['0'] ?? 0} No` : metric.average ?? '—'}</p>
                        <p className="pb-0.5 text-xs text-slate-500">
                          {metric.count} response{metric.count === 1 ? '' : 's'}
                          {metric.change != null ? ` · ${metric.change > 0 ? '+' : ''}${metric.change} recent movement` : ''}
                        </p>
                      </div>
                      {metric.questionType !== 'YES_NO' && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Answer distribution">{Object.entries(metric.distribution).map(([value, count]) => <span key={value} className="rounded-md bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">{value}: {count}</span>)}</div>}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="event-intelligence-metric-strip">
                <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 md:grid-cols-5 md:divide-y-0">
                  <div className="min-w-0 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Responses</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{(intelligenceData as EventIntelligenceData).responseCount}</p>
                  </div>
                  <div className="min-w-0 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Answers analyzed</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{(intelligenceData as EventIntelligenceData).answerCount}</p>
                  </div>
                  <div className="min-w-0 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Active attention</p>
                    <p className="mt-1 text-2xl font-black text-rose-600">{activeAttentionItems}</p>
                  </div>
                  <div className="min-w-0 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Affected areas</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{affectedAreaCount}</p>
                  </div>
                  <div className="min-w-0 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Event status</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-black text-slate-950">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {humanizeIntelligenceLabel((intelligenceData as EventIntelligenceData).eventStatus)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-2 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
              <div ref={setNeedsAttentionPanelRef} data-testid="needs-attention-panel" className="rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Live operations</p>
                        <h3 className="mt-1 text-sm font-black uppercase tracking-wide text-slate-950">What needs review</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5" aria-label="Alert view">
                          {(['ACTIVE', 'HISTORY', 'ALL'] as const).map((view) => (
                            <button
                              key={view}
                              type="button"
                              onClick={() => setAttentionView(view)}
                              aria-pressed={attentionView === view}
                              className={`rounded px-2 py-1 text-[11px] font-bold ${
                                attentionView === view ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              {view === 'ACTIVE' ? 'Active' : view === 'HISTORY' ? 'History' : 'All'}
                            </button>
                          ))}
                        </div>
                        {statusSummary.length > 0 ? statusSummary.map(([status, count]) => (
                          <span key={status} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {status}: {count}
                          </span>
                        )) : (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Active: 0</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              'event-summary',
                              formatEventOperationsSummary({
                                eventName: (intelligenceData as EventIntelligenceData).eventName || analysisData.eventName,
                                briefs: actionBriefs,
                              }),
                            )
                          }
                          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700"
                        >
                          {copiedKey === 'event-summary' ? 'Copied' : 'Copy summary'}
                        </button>
                      </div>
                    </div>
                  </div>
                  {filteredAttentionQueue.length > 0 ? (
                    <div className="divide-y divide-slate-200">
                      {visibleAttentionQueue.map((item) => {
                        const priority = normalizePriorityLevel(item.priorityLevel)
                        const evidence = item.representativeEvidence?.[0]
                        const statusError = item.id ? statusErrors[item.id] : undefined
                        const savingStatus = item.id ? statusSavingClusterId === item.id : false
                        const itemKey = item.id ?? `${item.taxonomyKey}-${item.title}-${item.lastSeenAt}`
                        const isSelectedIssue = selectedIssueDetailKey === itemKey
                        const attentionContent = (
                          <>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${getPriorityBadgeClass(priority)}`}>
                                {priority}
                              </span>
                              {evidence?.sentimentScore != null && (
                                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  evidence.sentimentScore < -0.2
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : evidence.sentimentScore > 0.2
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 bg-white text-slate-500'
                                }`}>
                                  {evidence.sentimentScore < -0.2 ? 'Negative' : evidence.sentimentScore > 0.2 ? 'Positive' : 'Neutral'}
                                </span>
                              )}
                              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{humanizeIntelligenceLabel(item.taxonomyKey)}</span>
                              <span className="text-[11px] font-medium text-slate-500">{item.evidenceCount} evidence</span>
                              <span className="text-[11px] font-medium text-slate-500">Last seen {formatIntelligenceDate(item.lastSeenAt)}</span>
                            </div>
                            <h4 className="mt-1.5 text-sm font-bold text-slate-950">{item.title}</h4>
                          </>
                        )
                        return (
                          <div
                            key={itemKey}
                            className={`relative border-l-4 ${getPriorityRailClass(priority)} px-4 py-3 transition-colors ${
                              isSelectedIssue ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/70'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => selectAttentionItem(item)}
                              aria-pressed={isSelectedIssue}
                              className="block w-full text-left"
                            >
                              {attentionContent}
                            </button>
                            {item.recommendedNextStep && (
                              <div className="mt-2 border-t border-slate-200 pt-2">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Recommended action</p>
                                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-700">{item.recommendedNextStep}</p>
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {evidence?.id && accountSlug && (
                                <button
                                  type="button"
                                  onClick={() => openAttentionEvidence(item, evidence.id)}
                                  className="px-1 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:text-indigo-700"
                                >
                                  View evidence
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => copyToClipboard(`brief-${itemKey}`, formatActionBriefText(briefFromAttentionItem(item)))}
                                className="px-1 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:text-indigo-700"
                              >
                                {copiedKey === `brief-${itemKey}` ? 'Copied' : 'Copy brief'}
                              </button>
                              <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
                                <span className="hidden sm:inline">{getSignalStrengthLabel(item.confidence)}</span>
                                {isSelectedIssue && (
                                  <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Viewing</span>
                                )}
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                  {humanizeIntelligenceLabel(item.status || 'ACTIVE')}
                                </span>
                              </div>
                            </div>
                            {savingStatus && <p className="mt-1 text-[11px] text-indigo-600">Saving status...</p>}
                            {statusError && <p className="mt-1 text-[11px] text-amber-700">{statusError}</p>}
                          </div>
                        )
                      })}
                      {queueHasOverflow && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                          <p className="text-xs text-slate-500">
                            Showing {visibleAttentionQueue.length} of {filteredAttentionQueue.length} attention items
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowAllAttentionQueue((current) => !current)}
                            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                          >
                            {showAllAttentionQueue ? 'Show fewer' : 'Show all'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-5">
                      <EmptyIntelligenceState message={attentionView === 'ACTIVE' ? 'No active attention items.' : attentionView === 'HISTORY' ? 'No resolved or dismissed alerts yet.' : 'No attention items yet.'} />
                    </div>
                  )}
                </div>

                <aside
                  ref={selectedIssueDetailRef}
                  data-testid="selected-issue-detail-panel"
                  style={needsAttentionHeight ? { height: needsAttentionHeight } : undefined}
                  className="scroll-mt-4 min-h-0 rounded-xl border border-slate-200 bg-slate-50 p-3 xl:flex xl:flex-col"
                >
                  <div className="min-h-0 xl:flex xl:flex-1 xl:flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wide text-slate-950">Selected Issue Detail</h3>
                      </div>
                    </div>
                    {selectedAttentionItem ? (
                      <>
                        <div data-testid="selected-issue-detail-body" className="mt-3 space-y-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${getPriorityBadgeClass(selectedAttentionItem.priorityLevel)}`}>
                            {normalizePriorityLevel(selectedAttentionItem.priorityLevel)}
                          </span>
                          {selectedEvidence?.sentimentScore != null && (
                            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                              selectedEvidence.sentimentScore < -0.2
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : selectedEvidence.sentimentScore > 0.2
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-600'
                            }`}>
                              {selectedEvidence.sentimentScore < -0.2 ? 'Negative' : selectedEvidence.sentimentScore > 0.2 ? 'Positive' : 'Neutral'}
                            </span>
                          )}
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {humanizeIntelligenceLabel(selectedAttentionItem.taxonomyKey)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-950">{selectedAttentionItem.title}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-indigo-700">{getAttentionSourceLine(selectedAttentionItem)}</p>
                          {selectedAttentionItem.summary && (
                            <p className="mt-2 text-xs leading-5 text-slate-600">{selectedAttentionItem.summary}</p>
                          )}
                        </div>
                        {selectedEvidence ? (
                          <>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Question asked</p>
                              <p className="mt-1 text-xs leading-5 text-slate-700">{selectedAttentionItem.affectedQuestion?.label ?? 'Question metadata unavailable'}</p>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                                Attendee evidence ({selectedAttentionItem.representativeEvidence.length})
                              </p>
                              {selectedAttentionItem.representativeEvidence.map((evidence) => (
                                <button
                                  key={evidence.id}
                                  type="button"
                                  onClick={() => accountSlug && openAttentionEvidence(selectedAttentionItem, evidence.id)}
                                  disabled={!accountSlug}
                                  className={`w-full text-left transition-colors disabled:cursor-default ${selectedEvidence?.id === evidence.id
                                    ? 'rounded-lg border border-indigo-300 bg-indigo-50/50 p-3 ring-1 ring-indigo-100'
                                    : 'rounded-lg border border-slate-200 bg-white p-3 hover:border-indigo-300 disabled:hover:border-slate-200'
                                  }`}
                                >
                                  <p className="text-sm italic leading-6 text-slate-700">&ldquo;{evidence.transcriptSnippet}&rdquo;</p>
                                  <p className="mt-2 text-[11px] font-medium text-slate-400">
                                    {humanizeIntelligenceLabel(evidence.priorityLevel)} / {formatSentimentScore(evidence.sentimentScore)} / {formatIntelligenceDate(evidence.createdAt)}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                            Evidence will appear as analyzed responses accumulate.
                          </p>
                        )}
                        {selectedAttentionItem.recommendedNextStep && (
                          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Recommended next step</p>
                            <p className="mt-0.5 text-sm leading-6 text-slate-700">{selectedAttentionItem.recommendedNextStep}</p>
                          </div>
                        )}
                        {selectedAlertLoading && (
                          <p className="text-xs text-slate-500">Loading alert workflow...</p>
                        )}
                        {selectedAlertError && (
                          <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{selectedAlertError}</p>
                        )}
                        {selectedAlertDetail && selectedAlertDetail.evidence.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                              Linked evidence ({selectedAlertDetail.evidence.length})
                            </p>
                            {selectedAlertDetail.evidence.map((evidence) => {
                              const transcript = evidence.answer.answerTranscript?.text || evidence.transcriptSnippet
                              return (
                                <div key={evidence.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                    {evidence.question?.label ?? 'Question'} · {humanizeIntelligenceLabel(evidence.question?.type ?? 'VOICE')}
                                  </p>
                                  {evidence.answer.numericValue != null ? (
                                    <p className="mt-1 text-sm font-bold text-slate-900">Score: {evidence.answer.numericValue}</p>
                                  ) : transcript ? (
                                    <p className="mt-1 text-xs italic leading-5 text-slate-700">&ldquo;{transcript}&rdquo;</p>
                                  ) : (
                                    <p className="mt-1 text-xs text-slate-500">Evidence is linked, but no transcript text is available.</p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {selectedAlertDetail?.interventionMovement && (
                          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Movement after action</p>
                            <p className="mt-1 text-sm font-bold text-slate-900">{selectedAlertDetail.interventionMovement.label}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              Before: {selectedAlertDetail.interventionMovement.before.average ?? '—'} ({selectedAlertDetail.interventionMovement.before.count}) · After: {selectedAlertDetail.interventionMovement.after.average ?? '—'} ({selectedAlertDetail.interventionMovement.after.count})
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {selectedAlertDetail.interventionMovement.sampleStrength.label}. This is directional movement, not proof of causation.
                            </p>
                          </div>
                        )}
                        {selectedAlertDetail && selectedAttentionItem.id && (
                          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Owner
                              <select
                                value={selectedAlertDetail.ownerUserId ?? ''}
                                onChange={(event) => assignAttentionOwner(selectedAttentionItem.id!, event.target.value)}
                                disabled={statusSavingClusterId === selectedAttentionItem.id}
                                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700"
                              >
                                <option value="">Unassigned</option>
                                {selectedAlertDetail.availableOwners.map((owner) => (
                                  <option key={owner.id} value={owner.id}>{userLabel(owner)}</option>
                                ))}
                              </select>
                            </label>
                            {selectedAlertDetail.notes.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Internal notes</p>
                                {selectedAlertDetail.notes.map((note) => (
                                  <div key={note.id} className="rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700">
                                    <p>{note.body}</p>
                                    <p className="mt-1 text-[10px] text-slate-400">{note.author ? userLabel(note.author) : 'Team member'} · {formatIntelligenceDateTime(note.createdAt)}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <input
                                value={noteDraft}
                                onChange={(event) => setNoteDraft(event.target.value)}
                                placeholder="Add an internal note"
                                aria-label="Internal alert note"
                                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => addAttentionNote(selectedAttentionItem.id!)}
                                disabled={!noteDraft.trim() || statusSavingClusterId === selectedAttentionItem.id}
                                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
                              >
                                Add note
                              </button>
                            </div>
                          </div>
                        )}
                        {(selectedAttentionItem.status === 'ACTING' || isActiveEventIssueClusterStatus(selectedAttentionItem.status)) && (
                          <input
                            value={actionReason}
                            onChange={(event) => setActionReason(event.target.value)}
                            placeholder={selectedAttentionItem.status === 'ACTING' ? 'Resolution or dismissal reason' : 'Dismissal reason'}
                            aria-label="Alert action reason"
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
                          />
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            Status: {humanizeIntelligenceLabel(selectedAttentionItem.status || 'ACTIVE')}
                          </span>
                          {selectedAttentionItem.id && accountSlug && nextAlertAction(selectedAttentionItem.status) && (
                            <button
                              type="button"
                              onClick={() => {
                                const action = nextAlertAction(selectedAttentionItem.status)
                                if (action) void updateAttentionStatus(selectedAttentionItem.id!, action.status, actionReason)
                              }}
                              disabled={statusSavingClusterId === selectedAttentionItem.id || (selectedAttentionItem.status === 'ACTING' && !actionReason.trim())}
                              className="rounded-md bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:opacity-50"
                            >
                              {nextAlertAction(selectedAttentionItem.status)?.label}
                            </button>
                          )}
                          {selectedAttentionItem.id && accountSlug && isActiveEventIssueClusterStatus(selectedAttentionItem.status) && (
                            <button
                              type="button"
                              onClick={() => updateAttentionStatus(selectedAttentionItem.id!, 'DISMISSED', actionReason)}
                              disabled={!actionReason.trim() || statusSavingClusterId === selectedAttentionItem.id}
                              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`detail-brief-${selectedIssueDetailKey}`, formatActionBriefText(briefFromAttentionItem(selectedAttentionItem)))}
                            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                          >
                            {copiedKey === `detail-brief-${selectedIssueDetailKey}` ? 'Copied' : 'Copy brief'}
                          </button>
                        </div>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-bold text-slate-800">Select an issue to review evidence.</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Use View evidence in the attention queue to inspect a specific issue here.
                        </p>
                      </div>
                    )}
                  </div>
                </aside>
              </div>

            <div className="order-3 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
              <section data-testid="what-is-working" className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Attendee strengths</p>
                <h3 className="mt-1 text-sm font-black text-slate-950">What is working</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)]">
                  <SatisfactionDistribution summary={inferredSatisfaction} />
                  {overview.keep.length > 0 ? (
                    <div className="grid content-start gap-2 sm:grid-cols-2">
                      {overview.keep.slice(0, 4).map((theme) => (
                        <button
                          key={theme.themeKey}
                          type="button"
                          aria-pressed={selectedThemeKey === theme.themeKey}
                          onClick={() => openThemeEvidence(theme)}
                          className={`rounded-lg border bg-white p-3 text-left transition-colors hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 ${selectedThemeKey === theme.themeKey ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-emerald-100'}`}
                        >
                          <p className="text-sm font-semibold text-slate-950">{theme.label}</p>
                          <p className="mt-1 text-xs text-emerald-700">{theme.count} positive mention{theme.count === 1 ? '' : 's'}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyIntelligenceState message="No positive patterns yet." />
                  )}
                </div>
              </section>

              <section data-testid="open-follow-up" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Workflow</p>
                <h3 className="mt-1 text-sm font-black text-slate-950">Open follow-up</h3>
                <p className="mt-1 text-xs text-slate-500">Acknowledged, owned, or noted issues in the current workflow.</p>
                {overview.openFollowUp.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {overview.openFollowUp.slice(0, 4).map((issue) => (
                      <button
                        key={issue.id ?? issue.taxonomyKey}
                        type="button"
                        onClick={() => {
                          const item = displayAttentionQueue.find((candidate) => candidate.id === issue.id || candidate.taxonomyKey === issue.taxonomyKey)
                          if (item) selectAttentionItem(item)
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-slate-900">{issue.title}</span>
                          <span className="mt-1 block text-[11px] text-slate-500">{humanizeIntelligenceLabel(issue.status)}</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-indigo-700">Review</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3"><EmptyIntelligenceState message="No acknowledged follow-up yet." /></div>
                )}
              </section>
            </div>

            <div className="order-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
              <section data-testid="overview-decisions" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Decision summary</p>
                <h3 className="mt-1 text-sm font-black text-slate-950">Keep, improve, and revisit</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                    <h4 className="text-xs font-black text-emerald-800">Keep</h4>
                    <div className="mt-2 space-y-1.5">
                      {overview.keep.slice(0, 3).map((theme) => (
                        <button key={theme.themeKey} type="button" onClick={() => openThemeEvidence(theme)} className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-800 hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30">
                          {theme.label}
                        </button>
                      ))}
                      {overview.keep.length === 0 && <p className="text-xs text-slate-500">No evidenced strengths yet.</p>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                    <h4 className="text-xs font-black text-amber-800">Improve during this event</h4>
                    <div className="mt-2 space-y-1.5">
                      {overview.improveNow.slice(0, 3).map((issue) => (
                        <button
                          key={issue.id ?? issue.taxonomyKey}
                          type="button"
                          onClick={() => {
                            const item = displayAttentionQueue.find((candidate) => candidate.id === issue.id || candidate.taxonomyKey === issue.taxonomyKey)
                            if (item) selectAttentionItem(item)
                          }}
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-800 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                        >
                          {issue.title}
                        </button>
                      ))}
                      {overview.improveNow.length === 0 && <p className="text-xs text-slate-500">No credible friction or mixed pattern has emerged in the current evidence.</p>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                    <h4 className="text-xs font-black text-indigo-800">Revisit next event</h4>
                    <div className="mt-2 space-y-1.5">
                      {overview.revisitNextEvent.slice(0, 3).map((action) => (
                        <button
                          key={action.themeKey}
                          type="button"
                          onClick={() => openThemeEvidence({ themeKey: action.themeKey!, label: action.title, count: action.count ?? 0, sentimentLabel: null })}
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-800 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                        >
                          {action.title}
                        </button>
                      ))}
                      {overview.revisitNextEvent.length === 0 && <p className="text-xs text-slate-500">No next-event recommendation has emerged from the current evidence.</p>}
                    </div>
                  </div>
                </div>
              </section>

              <section data-testid="coverage-and-confidence" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Evidence quality</p>
                    <h3 className="mt-1 text-sm font-black text-slate-950">Coverage and confidence</h3>
                  </div>
                  {activeIntelligenceFilter && onClearIntelligenceFilter && (
                    <button type="button" onClick={onClearIntelligenceFilter} className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">
                      Clear coverage filter
                    </button>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Sources heard from', representedTargetCount],
                    ['Questions answered', representedQuestionCount],
                    ['Strong findings', overview.confidence.strong],
                    ['Directional', overview.confidence.directional],
                    ['Emerging', overview.confidence.emerging],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-lg font-black text-slate-950">{value}</p>
                      <p className="mt-0.5 text-[10px] font-semibold leading-4 text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">Answer volume shows coverage; confidence describes evidence strength, not operational performance.</p>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Sources</p>
                    {targetBreakdown.length > 0 ? targetBreakdown.slice(0, 4).map((target) => (
                      <SourceRow
                        key={target.surveyTargetId ?? target.name}
                        label={target.name}
                        count={target.answerCount}
                        max={maxTargetAnswers}
                        meta={`${target.answerCount} answer${target.answerCount === 1 ? '' : 's'}`}
                        active={activeIntelligenceFilter?.type === 'target' && activeIntelligenceFilter.surveyTargetId === target.surveyTargetId}
                        onClick={target.surveyTargetId && onFilterByTarget ? () => activeIntelligenceFilter?.type === 'target' && activeIntelligenceFilter.surveyTargetId === target.surveyTargetId ? onClearIntelligenceFilter?.() : onFilterByTarget({ surveyTargetId: target.surveyTargetId!, label: target.name }) : undefined}
                      />
                    )) : <EmptyIntelligenceState message="No source coverage yet." />}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Questions</p>
                    {questionBreakdown.length > 0 ? questionBreakdown.slice(0, 4).map((question) => (
                      <SourceRow
                        key={question.questionId ?? question.label}
                        label={question.label}
                        count={question.answerCount}
                        max={maxQuestionAnswers}
                        meta={`${question.answerCount} answer${question.answerCount === 1 ? '' : 's'}`}
                        active={activeIntelligenceFilter?.type === 'question' && activeIntelligenceFilter.questionId === question.questionId}
                        onClick={question.questionId && onFilterByQuestion ? () => activeIntelligenceFilter?.type === 'question' && activeIntelligenceFilter.questionId === question.questionId ? onClearIntelligenceFilter?.() : onFilterByQuestion({ questionId: question.questionId!, label: question.label }) : undefined}
                      />
                    )) : <EmptyIntelligenceState message="No question coverage yet." />}
                  </div>
                </div>
              </section>
            </div>

            {false && selectedThemeKey && (
              <div ref={themeEvidenceRef} className="order-6">
                <ThemeEvidencePanel loading={themeEvidenceLoading} error={themeEvidenceError} detail={themeEvidenceDetail} fallbackTheme={selectedThemeMeta} onClear={closeThemeEvidence} />
              </div>
            )}
          </>
        )}
      </section>

    </div>
  )
}
