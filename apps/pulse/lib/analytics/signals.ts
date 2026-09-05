/**
 * Analytics Signals Module
 * 
 * Implements 4 deterministic analytics signals per docs/ANALYTICS_SIGNALS_SPEC.md:
 * - Pulse: Overall health indicator
 * - Momentum: Directional trend
 * - Top Friction: Primary negative driver
 * - Biggest Opportunity: Actionable upside
 */

import { prisma } from '@/lib/prisma'
import type { EventDashboardFilters } from '@/lib/event-dashboard-filters'
import { buildEffectiveResponseStructureWhere } from '@/lib/event-dashboard-filters'
import { normalizeThemeKey, toDisplayName } from '@/lib/insights/theme-keys'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'

// ============================================================
// TYPES (matching spec)
// ============================================================

export type PulseLabel = 'GREAT' | 'GOOD' | 'MIXED' | 'NEEDS_ATTENTION'
export type MomentumLabel = 'IMPROVING' | 'FLAT' | 'DECLINING'
export type Confidence = 'HIGH' | 'LOW'
export type OpportunityType = 'theme' | 'action'

export interface PulseSignal {
  score: number | null
  label: PulseLabel | null
  delta: number | null
  confidence: Confidence | null
  components: {
    sentiment: number
    volume: number
    diversity: number
  }
  metadata: {
    responseCount: number
    themeCount: number
    avgSentiment: number
  }
}

export type MomentumConfidence = 0 | 1 | 2  // 0=Low, 1=Medium, 2=High
export type MomentumConfidenceLabel = 'Low' | 'Medium' | 'High'

export interface MomentumSignal {
  label: MomentumLabel | null
  slope: number | null
  sentimentDeltaPoints: number | null  // Point change: currentAvg - previousAvg (scaled to pts)
  confidence: MomentumConfidence
  confidenceLabel: MomentumConfidenceLabel
  metadata: {
    daysWithData: number
    totalResponses: number
    previousResponses: number
    dateRange: {
      start: string
      end: string
    }
  }
}

export type FrictionType = 'negative_theme' | 'lowest_sentiment' | 'watch_item' | null
export type FrictionStatus = 'none' | 'watch' | 'friction'
export type SeverityLevel = 0 | 1 | 2 | 3

export interface TopFrictionSignal {
  status: FrictionStatus
  severity: SeverityLevel  // 0=none, 1=low, 2=medium, 3=high
  theme: string | null
  frictionScore: number | null
  mentionCount: number | null
  negativeMentionsCount: number | null  // Count of negative-sentiment mentions
  avgSentiment: number | null
  lastMention: string | null
  frictionType: FrictionType
  frictionReason: string | null
  components: {
    frequencyWeight: number
    severityWeight: number
    recencyWeight: number
  }
}

export type EffortLevel = 'S' | 'M' | 'L'
export type ImpactLevel = 1 | 2 | 3

export interface OpportunityItem {
  text: string
  impactScore: ImpactLevel   // 1=low, 2=medium, 3=high
  effortScore: EffortLevel   // S=small, M=medium, L=large
  priority: 'High' | 'Medium' | 'Low'
}

export interface BiggestOpportunitySignal {
  type: OpportunityType | null
  text: string | null
  opportunityScore: number | null
  mentionCount: number | null
  priority: string | null
  impactScore: ImpactLevel | null   // 1=low, 2=medium, 3=high
  effortScore: EffortLevel | null   // S=small, M=medium, L=large
  // Ranked list of top opportunities with scores
  opportunities: OpportunityItem[]
  components: {
    improvementPotential: number
    frequencySignal: number
    effortEstimate: number
  }
}

/** Per-theme sentiment breakdown for Key Insights deduplication */
export interface ThemeSentimentItem {
  key: string
  theme: string
  displayName: string
  positiveMentions: number
  negativeMentions: number
  neutralMentions: number
  totalMentions: number
  netScore: number
  positiveRate: number
}

export interface AnalyticsSignals {
  pulse: PulseSignal
  momentum: MomentumSignal
  topFriction: TopFrictionSignal
  biggestOpportunity: BiggestOpportunitySignal
  /** Per-theme sentiment for Key Insights (dedupe working vs opportunities) */
  themeSentimentBreakdown: ThemeSentimentItem[]
  metadata: {
    periodStart: string
    periodEnd: string
    totalResponses: number
    completedResponses: number
    /** All answer rows tied to responses in the window (any status). */
    answersCaptured: number
    /** Answers with completed transcription and analysis (same rule as dashboard analysis API). */
    answersAnalyzed: number
    /**
     * @deprecated Same as `answersCaptured`. Kept for older API clients.
     */
    totalAnswers: number
    computedAt: string
  }
}

/** Key Insights use lifetime survey data; pulse/momentum stay windowed. */
export type KeyInsightsSignalsPayload = Pick<
  AnalyticsSignals,
  'themeSentimentBreakdown' | 'biggestOpportunity'
>

// ============================================================
// CONSTANTS (from spec)
// ============================================================

const VOLUME_BASELINE = 50
const DIVERSITY_BASELINE = 10
const SLOPE_THRESHOLD = 0.02
const R_SQUARED_THRESHOLD = 0.3
const MIN_DAYS_FOR_MOMENTUM = 7
const MIN_RESPONSES_FOR_MOMENTUM = 10
const MIN_RESPONSES_FOR_FRICTION = 5
const MIN_RESPONSES_FOR_OPPORTUNITY = 5
const NEGATIVE_SENTIMENT_THRESHOLD = -0.3
const NEUTRAL_SENTIMENT_LOW = -0.3
const NEUTRAL_SENTIMENT_HIGH = 0.3
const RECENCY_HALFLIFE_DAYS = 7
const MIN_THEME_MENTIONS = 3
const MIN_ACTION_OCCURRENCES = 2

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Map pulse score to label per spec
 */
function scoreToPulseLabel(score: number): PulseLabel {
  if (score >= 80) return 'GREAT'
  if (score >= 60) return 'GOOD'
  if (score >= 40) return 'MIXED'
  return 'NEEDS_ATTENTION'
}

/**
 * Compute linear regression slope and r² value
 */
function linearRegression(points: { x: number; y: number }[]): { slope: number; rSquared: number } {
  const n = points.length
  if (n < 2) return { slope: 0, rSquared: 1 }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0

  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumX2 += p.x * p.x
  }

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return { slope: 0, rSquared: 1 }

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  // Compute r²
  const yMean = sumY / n
  let ssTotal = 0, ssResidual = 0

  for (const p of points) {
    const predicted = slope * p.x + intercept
    ssResidual += (p.y - predicted) ** 2
    ssTotal += (p.y - yMean) ** 2
  }

  const rSquared = ssTotal === 0 ? 1 : 1 - ssResidual / ssTotal

  return { slope, rSquared }
}

/**
 * Compute recency weight with exponential decay
 */
function computeRecencyWeight(lastMention: Date, now: Date): number {
  const daysSince = (now.getTime() - lastMention.getTime()) / (1000 * 60 * 60 * 24)
  return Math.exp(-daysSince / RECENCY_HALFLIFE_DAYS)
}

/**
 * Compute effort estimate based on word count (inverted)
 */
function computeEffortEstimate(text: string): number {
  const wordCount = Math.min(text.split(/\s+/).length, 20)
  return 1.0 - wordCount / 20.0
}

// ============================================================
// DATA FETCHING
// ============================================================

export interface FetchedData {
  responses: {
    id: string
    startedAt: Date
    status: string
    answers: {
      id: string
      status: string
      answerTranscript: { id: string } | null
      answerAnalysis: {
        sentimentScore: number | null
        sentimentLabel: string | null
        themesJson: any
        actionsJson: any
      } | null
    }[]
  }[]
  periodStart: Date
  periodEnd: Date
}

async function fetchResponsesForSignals(
  responseWhere: Record<string, unknown>,
  orderBy?: { startedAt: 'asc' },
): Promise<FetchedData['responses']> {
  const [responses, answers, transcripts, analyses] = await prisma.$transaction([
    prisma.response.findMany({
      where: responseWhere,
      select: { id: true, startedAt: true, status: true },
      ...(orderBy ? { orderBy } : {}),
    }),
    prisma.answer.findMany({
      where: { response: responseWhere },
      select: { id: true, responseId: true, status: true },
    }),
    prisma.answerTranscript.findMany({
      where: { answer: { response: responseWhere } },
      select: { id: true, answerId: true },
    }),
    prisma.answerAnalysis.findMany({
      where: { answer: { response: responseWhere } },
      select: {
        answerId: true,
        sentimentScore: true,
        sentimentLabel: true,
        themesJson: true,
        actionsJson: true,
      },
    }),
  ])
  const transcriptByAnswerId = new Map(transcripts.map((row) => [row.answerId, { id: row.id }]))
  const analysisByAnswerId = new Map(analyses.map((row) => [row.answerId, {
    sentimentScore: row.sentimentScore,
    sentimentLabel: row.sentimentLabel,
    themesJson: row.themesJson,
    actionsJson: row.actionsJson,
  }]))
  const answersByResponseId = new Map<string, FetchedData['responses'][number]['answers']>()
  for (const answer of answers) {
    answersByResponseId.set(answer.responseId, [
      ...(answersByResponseId.get(answer.responseId) ?? []),
      {
        id: answer.id,
        status: answer.status,
        answerTranscript: transcriptByAnswerId.get(answer.id) ?? null,
        answerAnalysis: analysisByAnswerId.get(answer.id) ?? null,
      },
    ])
  }
  return responses.map((response) => ({
    ...response,
    answers: answersByResponseId.get(response.id) ?? [],
  }))
}

/**
 * Count answer rows in a fetched payload. "Analyzed" matches /api/app/events/.../analysis:
 * COMPLETED answer + transcript + answerAnalysis.
 */
export function countWindowAnswerMetrics(
  responses: FetchedData['responses']
): { answersCaptured: number; answersAnalyzed: number } {
  let answersCaptured = 0
  let answersAnalyzed = 0
  for (const r of responses) {
    for (const a of r.answers) {
      answersCaptured++
      if (
        a.status === 'COMPLETED' &&
        a.answerTranscript &&
        a.answerAnalysis
      ) {
        answersAnalyzed++
      }
    }
  }
  return { answersCaptured, answersAnalyzed }
}

async function fetchEventData(
  eventId: string,
  windowDays: number,
  filters: EventDashboardFilters = {},
  lifecyclePhase?: ResolvedEventLifecyclePhase,
): Promise<FetchedData> {
  const periodEnd = new Date()
  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - windowDays)
  const structureWhere = buildEffectiveResponseStructureWhere(filters)

  const responses = await fetchResponsesForSignals({
      eventId,
      ...(lifecyclePhase !== undefined ? responseCollectionPhaseWhere(lifecyclePhase) : {}),
      ...(filters.surveyId ? { surveyId: filters.surveyId } : {}),
      ...structureWhere,
      startedAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    }, { startedAt: 'asc' })

  return { responses, periodStart, periodEnd }
}

/**
 * All responses for an event (full survey lifetime) for Key Insights + insight sync.
 */
export async function fetchEventDataLifetime(
  eventId: string,
  surveyId?: string | null,
  structureFilters: Pick<EventDashboardFilters, 'eventStructureItemId' | 'structureKind'> = {},
  lifecyclePhase?: ResolvedEventLifecyclePhase,
): Promise<FetchedData> {
  const periodEnd = new Date()
  const filters = {
    surveyId,
    ...structureFilters,
  }
  const structureWhere = buildEffectiveResponseStructureWhere(filters)
  const responses = await fetchResponsesForSignals({
      eventId,
      ...(lifecyclePhase !== undefined ? responseCollectionPhaseWhere(lifecyclePhase) : {}),
      ...(surveyId ? { surveyId } : {}),
      ...structureWhere,
    }, { startedAt: 'asc' })
  const periodStart = responses[0]?.startedAt ?? periodEnd
  return { responses, periodStart, periodEnd }
}

export function computeLifetimeKeyInsightsPayload(
  lifetimeData: FetchedData,
  now: Date
): KeyInsightsSignalsPayload {
  const topFriction = computeTopFrictionFromData({
    responses: lifetimeData.responses,
    now,
  })
  return {
    themeSentimentBreakdown: computeThemeSentimentBreakdown(lifetimeData.responses),
    biggestOpportunity: computeBiggestOpportunityFromData({
      responses: lifetimeData.responses,
      topFrictionTheme: topFriction.theme,
    }),
  }
}

/**
 * Compute per-theme sentiment breakdown from responses.
 * Uses normalized key as ONLY grouping key; displayName derived from key only.
 */
function computeThemeSentimentBreakdown(
  responses: FetchedData['responses']
): ThemeSentimentItem[] {
  const completedResponses = responses.filter((r) => r.status === 'COMPLETED')
  const map = new Map<
    string,
    { positive: number; negative: number; neutral: number }
  >()

  for (const response of completedResponses) {
    for (const answer of response.answers) {
      const analysis = answer.answerAnalysis
      if (!analysis?.themesJson?.themes || !Array.isArray(analysis.themesJson.themes)) continue

      const score = analysis.sentimentScore
      let bucket: 'positive' | 'negative' | 'neutral'
      if (score === null) {
        bucket = 'neutral'
      } else if (score > NEUTRAL_SENTIMENT_HIGH) {
        bucket = 'positive'
      } else if (score < NEUTRAL_SENTIMENT_LOW) {
        bucket = 'negative'
      } else {
        bucket = 'neutral'
      }

      for (const theme of analysis.themesJson.themes) {
        if (typeof theme !== 'string' || !theme.trim()) continue
        const key = normalizeThemeKey(theme)
        const existing = map.get(key)
        if (!existing) {
          map.set(key, {
            positive: bucket === 'positive' ? 1 : 0,
            negative: bucket === 'negative' ? 1 : 0,
            neutral: bucket === 'neutral' ? 1 : 0,
          })
        } else {
          if (bucket === 'positive') existing.positive++
          else if (bucket === 'negative') existing.negative++
          else existing.neutral++
        }
      }
    }
  }

  return Array.from(map.entries())
    .map(([key, data]) => {
      const total = data.positive + data.negative + data.neutral
      const posNeg = data.positive + data.negative
      const displayName = toDisplayName(key)
      return {
        key,
        theme: displayName,
        displayName,
        positiveMentions: data.positive,
        negativeMentions: data.negative,
        neutralMentions: data.neutral,
        totalMentions: total,
        netScore: data.positive - data.negative,
        positiveRate: posNeg > 0 ? data.positive / posNeg : 0,
      }
    })
    .filter((t) => t.totalMentions >= MIN_THEME_MENTIONS)
    .sort((a, b) => b.totalMentions - a.totalMentions)
}

// ============================================================
// PULSE COMPUTATION
// ============================================================

interface PulseInput {
  responses: FetchedData['responses']
  periodStart: Date
  periodEnd: Date
  previousPeriodResponses?: FetchedData['responses']
}

function computePulseFromData(input: PulseInput): PulseSignal {
  const { responses, previousPeriodResponses } = input

  const completedResponses = responses.filter(r => r.status === 'COMPLETED')
  const responseCount = completedResponses.length

  // Edge case: no data
  if (responseCount === 0) {
    return {
      score: null,
      label: null,
      delta: null,
      confidence: null,
      components: { sentiment: 25, volume: 0, diversity: 0 },
      metadata: { responseCount: 0, themeCount: 0, avgSentiment: 0 },
    }
  }

  // Collect all sentiment scores and themes
  const sentimentScores: number[] = []
  const allThemes = new Set<string>()

  for (const response of completedResponses) {
    for (const answer of response.answers) {
      if (answer.answerAnalysis) {
        if (answer.answerAnalysis.sentimentScore !== null) {
          sentimentScores.push(answer.answerAnalysis.sentimentScore)
        }
        const themes = answer.answerAnalysis.themesJson?.themes
        if (Array.isArray(themes)) {
          themes.forEach((t: string) => allThemes.add(t))
        }
      }
    }
  }

  // Sentiment component (0-50)
  let rawSentimentAvg = 0
  if (sentimentScores.length > 0) {
    rawSentimentAvg = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
  }
  const normalizedSentiment = (rawSentimentAvg + 1) / 2 // -1→1 to 0→1
  const sentimentComponent = sentimentScores.length > 0 ? normalizedSentiment * 50 : 25

  // Volume component (0-30)
  const volumeComponent = Math.min((responseCount / VOLUME_BASELINE) * 30, 30)

  // Diversity component (0-20)
  const themeCount = allThemes.size
  const diversityComponent = Math.min((themeCount / DIVERSITY_BASELINE) * 20, 20)

  // Total score
  const score = Math.round(sentimentComponent + volumeComponent + diversityComponent)
  const label = scoreToPulseLabel(score)
  const confidence: Confidence = responseCount < 3 ? 'LOW' : 'HIGH'

  // Compute delta if previous period data available
  let delta: number | null = null
  if (previousPeriodResponses && previousPeriodResponses.length > 0) {
    const prevResult = computePulseFromData({
      responses: previousPeriodResponses,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    if (prevResult.score !== null) {
      delta = score - prevResult.score
    }
  }

  return {
    score,
    label,
    delta,
    confidence,
    components: {
      sentiment: Math.round(sentimentComponent * 10) / 10,
      volume: Math.round(volumeComponent * 10) / 10,
      diversity: Math.round(diversityComponent * 10) / 10,
    },
    metadata: {
      responseCount,
      themeCount,
      avgSentiment: Math.round(rawSentimentAvg * 1000) / 1000,
    },
  }
}

// ============================================================
// MOMENTUM COMPUTATION
// ============================================================

const MOMENTUM_POINT_THRESHOLD = 3  // pointDelta > 3 → IMPROVING, < -3 → DECLINING

interface MomentumInput {
  responses: FetchedData['responses']
  previousResponses: FetchedData['responses']
  periodStart: Date
  periodEnd: Date
}

function collectSentimentScores(responses: FetchedData['responses']): number[] {
  const scores: number[] = []
  for (const r of responses) {
    for (const answer of r.answers) {
      if (answer.answerAnalysis?.sentimentScore != null) {
        scores.push(answer.answerAnalysis.sentimentScore)
      }
    }
  }
  return scores
}

function computeMomentumFromData(input: MomentumInput): MomentumSignal {
  const { responses, previousResponses, periodStart, periodEnd } = input

  const completedResponses = responses.filter(r => r.status === 'COMPLETED')
  const previousCompleted = previousResponses.filter(r => r.status === 'COMPLETED')
  const totalResponses = completedResponses.length
  const prevTotalResponses = previousCompleted.length

  // Gating: require ≥ 10 in both windows
  if (totalResponses < MIN_RESPONSES_FOR_MOMENTUM || prevTotalResponses < MIN_RESPONSES_FOR_MOMENTUM) {
    return {
      label: null,
      slope: null,
      sentimentDeltaPoints: null,
      confidence: 0,
      confidenceLabel: 'Low',
      metadata: {
        daysWithData: 0,
        totalResponses,
        previousResponses: prevTotalResponses,
        dateRange: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
      },
    }
  }

  const currentScores = collectSentimentScores(completedResponses)
  const previousScores = collectSentimentScores(previousCompleted)

  if (currentScores.length === 0 || previousScores.length === 0) {
    return {
      label: null,
      slope: null,
      sentimentDeltaPoints: null,
      confidence: 0,
      confidenceLabel: 'Low',
      metadata: {
        daysWithData: 0,
        totalResponses,
        previousResponses: prevTotalResponses,
        dateRange: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
      },
    }
  }

  const currentAvg = currentScores.reduce((a, b) => a + b, 0) / currentScores.length
  const previousAvg = previousScores.reduce((a, b) => a + b, 0) / previousScores.length
  const pointDelta = (currentAvg - previousAvg) * 100  // Scale to pts for display and thresholds

  // Trend direction: pointDelta > 3 → IMPROVING, < -3 → DECLINING, else FLAT
  let label: MomentumLabel
  if (pointDelta > MOMENTUM_POINT_THRESHOLD) {
    label = 'IMPROVING'
  } else if (pointDelta < -MOMENTUM_POINT_THRESHOLD) {
    label = 'DECLINING'
  } else {
    label = 'FLAT'
  }

  // Confidence: HIGH ≥ 20 both, MEDIUM 10–19, LOW otherwise
  const minCount = Math.min(totalResponses, prevTotalResponses)
  let confidence: MomentumConfidence
  let confidenceLabel: MomentumConfidenceLabel
  if (minCount >= 20) {
    confidence = 2
    confidenceLabel = 'High'
  } else if (minCount >= 10) {
    confidence = 1
    confidenceLabel = 'Medium'
  } else {
    confidence = 0
    confidenceLabel = 'Low'
  }

  const dailySentiments = new Map<string, number[]>()
  for (const response of completedResponses) {
    const day = response.startedAt.toISOString().split('T')[0]
    for (const answer of response.answers) {
      if (answer.answerAnalysis && answer.answerAnalysis.sentimentScore !== null) {
        if (!dailySentiments.has(day)) dailySentiments.set(day, [])
        dailySentiments.get(day)!.push(answer.answerAnalysis.sentimentScore)
      }
    }
  }
  const sortedDays = Array.from(dailySentiments.keys()).sort()

  return {
    label,
    slope: null,
    sentimentDeltaPoints: Math.round(pointDelta * 10) / 10,
    confidence,
    confidenceLabel,
    metadata: {
      daysWithData: dailySentiments.size,
      totalResponses,
      previousResponses: prevTotalResponses,
      dateRange: {
        start: sortedDays[0] ?? periodStart.toISOString(),
        end: sortedDays[sortedDays.length - 1] ?? periodEnd.toISOString(),
      },
    },
  }
}

// ============================================================
// TOP FRICTION COMPUTATION
// ============================================================

interface ThemeData {
  theme: string
  mentionCount: number
  avgSentiment: number
  lastMention: Date
}

interface TopFrictionInput {
  responses: FetchedData['responses']
  now: Date
}

function computeTopFrictionFromData(input: TopFrictionInput): TopFrictionSignal {
  const { responses, now } = input

  const completedResponses = responses.filter(r => r.status === 'COMPLETED')

  // Edge case: insufficient data
  if (completedResponses.length < MIN_RESPONSES_FOR_FRICTION) {
    return {
      status: 'none' as FrictionStatus,
      severity: 0 as SeverityLevel,
      theme: null,
      frictionScore: null,
      mentionCount: null,
      negativeMentionsCount: null,
      avgSentiment: null,
      lastMention: null,
      frictionType: null,
      frictionReason: null,
      components: { frequencyWeight: 0, severityWeight: 0, recencyWeight: 0 },
    }
  }

  // Collect ALL theme data with associated sentiment (for fallback hierarchy)
  const negativeThemeMap = new Map<string, { sentiments: number[]; lastMention: Date }>()
  const allThemeMap = new Map<string, { sentiments: number[]; lastMention: Date }>()

  for (const response of completedResponses) {
    for (const answer of response.answers) {
      const analysis = answer.answerAnalysis
      if (!analysis || analysis.sentimentScore === null) continue

      const themes = analysis.themesJson?.themes
      if (!Array.isArray(themes)) continue

      for (const theme of themes) {
        // Track ALL themes for fallback
        if (!allThemeMap.has(theme)) {
          allThemeMap.set(theme, { sentiments: [], lastMention: response.startedAt })
        }
        const allData = allThemeMap.get(theme)!
        allData.sentiments.push(analysis.sentimentScore)
        if (response.startedAt > allData.lastMention) {
          allData.lastMention = response.startedAt
        }

        // Track negative themes specifically
        if (analysis.sentimentScore < NEGATIVE_SENTIMENT_THRESHOLD) {
          if (!negativeThemeMap.has(theme)) {
            negativeThemeMap.set(theme, { sentiments: [], lastMention: response.startedAt })
          }
          const negData = negativeThemeMap.get(theme)!
          negData.sentiments.push(analysis.sentimentScore)
          if (response.startedAt > negData.lastMention) {
            negData.lastMention = response.startedAt
          }
        }
      }
    }
  }

  // Convert negative themes to ThemeData array
  const negativeThemes: ThemeData[] = []
  Array.from(negativeThemeMap.entries()).forEach(([theme, data]) => {
    const avgSentiment = data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length
    negativeThemes.push({
      theme,
      mentionCount: data.sentiments.length,
      avgSentiment,
      lastMention: data.lastMention,
    })
  })

  // Convert all themes to ThemeData array (for fallback)
  const allThemes: ThemeData[] = []
  Array.from(allThemeMap.entries()).forEach(([theme, data]) => {
    const avgSentiment = data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length
    allThemes.push({
      theme,
      mentionCount: data.sentiments.length,
      avgSentiment,
      lastMention: data.lastMention,
    })
  })

  // FALLBACK HIERARCHY:
  // 1. Negative themes (strict threshold)
  // 2. Lowest sentiment theme (even if not below threshold)
  // 3. Most frequently mentioned theme (as "Watch item")
  
  let selectedTheme: ThemeData | null = null
  let frictionType: FrictionType = null
  let frictionReason: string | null = null

  if (negativeThemes.length > 0) {
    // Use negative themes - compute friction scores
    const maxMentionCount = Math.max(...negativeThemes.map(t => t.mentionCount))
    const scoredThemes = negativeThemes.map(t => {
      const frequencyWeight = t.mentionCount / maxMentionCount
      const severityWeight = Math.abs(t.avgSentiment)
      const recencyWeight = computeRecencyWeight(t.lastMention, now)
      const frictionScore = frequencyWeight * 0.50 + severityWeight * 0.35 + recencyWeight * 0.15
      return { ...t, frictionScore, frequencyWeight, severityWeight, recencyWeight }
    })
    scoredThemes.sort((a, b) => b.frictionScore - a.frictionScore)
    selectedTheme = scoredThemes[0]
    frictionType = 'negative_theme'
    frictionReason = 'Top friction point from negative feedback'
  } else if (allThemes.length > 0) {
    // Fallback 2: Find lowest sentiment theme
    const sortedBySentiment = [...allThemes].sort((a, b) => a.avgSentiment - b.avgSentiment)
    const lowestSentiment = sortedBySentiment[0]
    
    // Fallback 3: Most frequently mentioned theme
    const sortedByFrequency = [...allThemes].sort((a, b) => b.mentionCount - a.mentionCount)
    const mostFrequent = sortedByFrequency[0]
    
    // Choose lowest sentiment if it's notably lower, otherwise use frequency
    if (lowestSentiment.avgSentiment < 0.3) {
      selectedTheme = lowestSentiment
      frictionType = 'lowest_sentiment'
      frictionReason = 'Lowest sentiment theme to monitor'
    } else {
      selectedTheme = mostFrequent
      frictionType = 'watch_item'
      frictionReason = 'Most mentioned topic to watch'
    }
  }

  // Calculate total negative mentions
  const totalNegativeMentions = negativeThemes.reduce((sum, t) => sum + t.mentionCount, 0)

  // No themes at all
  if (!selectedTheme) {
    return {
      status: 'none' as FrictionStatus,
      severity: 0 as SeverityLevel,
      theme: null,
      frictionScore: null,
      mentionCount: null,
      negativeMentionsCount: totalNegativeMentions,
      avgSentiment: null,
      lastMention: null,
      frictionType: null,
      frictionReason: null,
      components: { frequencyWeight: 0, severityWeight: 0, recencyWeight: 0 },
    }
  }

  // Compute components for selected theme
  const maxMentionCount = Math.max(...allThemes.map(t => t.mentionCount), 1)
  const frequencyWeight = selectedTheme.mentionCount / maxMentionCount
  const severityWeight = Math.abs(selectedTheme.avgSentiment)
  const recencyWeight = computeRecencyWeight(selectedTheme.lastMention, now)
  const frictionScore = frequencyWeight * 0.50 + severityWeight * 0.35 + recencyWeight * 0.15

  // Determine status based on friction type
  const isRealFriction = frictionType === 'negative_theme' && selectedTheme.avgSentiment < 0
  const isWatchItem = frictionType === 'watch_item' || frictionType === 'lowest_sentiment'
  
  // Compute severity level: 0=none, 1=low, 2=medium, 3=high
  let severity: SeverityLevel = 0
  if (isRealFriction) {
    if (selectedTheme.mentionCount >= 5 && Math.abs(selectedTheme.avgSentiment) >= 0.3) {
      severity = 3
    } else if (selectedTheme.mentionCount >= 3 || Math.abs(selectedTheme.avgSentiment) >= 0.2) {
      severity = 2
    } else {
      severity = 1
    }
  } else if (isWatchItem) {
    // Watch items get severity 1 (low concern)
    severity = 1
  }

  // Determine status: friction > watch > none
  let status: FrictionStatus = 'none'
  if (isRealFriction) {
    status = 'friction'
  } else if (isWatchItem) {
    status = 'watch'
  }

  return {
    status,
    severity,
    theme: selectedTheme.theme,
    frictionScore: Math.round(frictionScore * 1000) / 1000,
    mentionCount: selectedTheme.mentionCount,
    negativeMentionsCount: totalNegativeMentions,
    avgSentiment: Math.round(selectedTheme.avgSentiment * 1000) / 1000,
    lastMention: selectedTheme.lastMention.toISOString(),
    frictionType,
    frictionReason,
    components: {
      frequencyWeight: Math.round(frequencyWeight * 1000) / 1000,
      severityWeight: Math.round(severityWeight * 1000) / 1000,
      recencyWeight: Math.round(recencyWeight * 1000) / 1000,
    },
  }
}

// ============================================================
// BIGGEST OPPORTUNITY COMPUTATION
// ============================================================

interface OpportunityCandidate {
  type: OpportunityType
  text: string
  mentionCount: number
  avgSentiment?: number
  priority?: string
}

interface BiggestOpportunityInput {
  responses: FetchedData['responses']
  topFrictionTheme: string | null
}

function computeBiggestOpportunityFromData(input: BiggestOpportunityInput): BiggestOpportunitySignal {
  const { responses } = input

  const completedResponses = responses.filter(r => r.status === 'COMPLETED')

  // Edge case: insufficient data
  if (completedResponses.length < MIN_RESPONSES_FOR_OPPORTUNITY) {
    return {
      type: null,
      text: null,
      opportunityScore: null,
      mentionCount: null,
      priority: null,
      impactScore: null,
      effortScore: null,
      opportunities: [],
      components: { improvementPotential: 0, frequencySignal: 0, effortEstimate: 0 },
    }
  }

  // Always-surface keywords: severity over frequency
  const ALWAYS_SURFACE_KEYWORDS = ['cleanliness', 'clean', 'staff', 'employee', 'safety', 'hygiene', 'dirty', 'rude', 'unsafe']

  const matchesAlwaysSurface = (text: string): boolean => {
    const lower = text.toLowerCase()
    return ALWAYS_SURFACE_KEYWORDS.some(kw => lower.includes(kw))
  }

  // Collect neutral themes
  const themeMap = new Map<string, { sentiments: number[] }>()
  const actionMap = new Map<string, { count: number; priority: string }>()

  for (const response of completedResponses) {
    for (const answer of response.answers) {
      const analysis = answer.answerAnalysis
      if (!analysis) continue

      // Collect themes from neutral-ish answers
      if (
        analysis.sentimentScore !== null &&
        analysis.sentimentScore >= NEUTRAL_SENTIMENT_LOW &&
        analysis.sentimentScore <= NEUTRAL_SENTIMENT_HIGH
      ) {
        const themes = analysis.themesJson?.themes
        if (Array.isArray(themes)) {
          for (const theme of themes) {
            if (!themeMap.has(theme)) {
              themeMap.set(theme, { sentiments: [] })
            }
            themeMap.get(theme)!.sentiments.push(analysis.sentimentScore)
          }
        }
      }

      // Collect actions (High and Medium, both with count)
      const actions = analysis.actionsJson?.actionItems
      if (Array.isArray(actions)) {
        for (const action of actions) {
          const text = typeof action === 'string' ? action : action?.text
          const priority = typeof action === 'string' ? 'Medium' : action?.priority || 'Medium'

          if (!text) continue

          const key = text.toLowerCase()
          if (!actionMap.has(key)) {
            actionMap.set(key, { count: 0, priority })
          }
          actionMap.get(key)!.count++
        }
      }
    }
  }

  // Build candidate pool
  const candidates: OpportunityCandidate[] = []

  // Source A: Neutral themes (min 3 mentions, or 1 if always-surface)
  Array.from(themeMap.entries()).forEach(([theme, data]) => {
    const minMentions = matchesAlwaysSurface(theme) ? 1 : MIN_THEME_MENTIONS
    if (data.sentiments.length >= minMentions) {
      const avgSentiment = data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length
      candidates.push({
        type: 'theme',
        text: theme,
        mentionCount: data.sentiments.length,
        avgSentiment,
      })
    }
  })

  // Source B: Actions - High priority or always-surface: count >= 1; else min 2
  Array.from(actionMap.entries()).forEach(([text, data]) => {
    const minCount = data.priority === 'High' || matchesAlwaysSurface(text) ? 1 : MIN_ACTION_OCCURRENCES
    if (data.count >= minCount) {
      candidates.push({
        type: 'action',
        text,
        mentionCount: data.count,
        priority: data.priority,
      })
    }
  })

  // Apply exclusion rules (no longer exclude high-priority; they are now candidates)
  // Friction-theme exclusion removed: retail (and other) events should surface
  // cleanliness/friction-related opportunities alongside friction signal
  const filteredCandidates = candidates

  // Edge case: no candidates after exclusions
  if (filteredCandidates.length === 0) {
    return {
      type: null,
      text: null,
      opportunityScore: null,
      mentionCount: null,
      priority: null,
      impactScore: null,
      effortScore: null,
      opportunities: [],
      components: { improvementPotential: 0, frequencySignal: 0, effortEstimate: 0 },
    }
  }

  // Compute opportunity scores
  const maxMentionCount = Math.max(...filteredCandidates.map(c => c.mentionCount))

  const scoredCandidates = filteredCandidates.map(c => {
    // Improvement potential
    let improvementPotential: number
    if (c.type === 'theme' && c.avgSentiment !== undefined) {
      improvementPotential = 0.5 + c.avgSentiment * -0.5
    } else {
      improvementPotential = c.priority === 'High' ? 0.9 : 0.6
    }

    // Frequency signal
    const frequencySignal = c.mentionCount / maxMentionCount

    // Effort estimate
    const effortEstimate = computeEffortEstimate(c.text)

    let opportunityScore =
      improvementPotential * 0.40 +
      frequencySignal * 0.35 +
      effortEstimate * 0.25

    // Severity boost: High-priority and always-surface items rank higher
    if (c.priority === 'High' || matchesAlwaysSurface(c.text)) {
      opportunityScore += 0.3
    }

    return { ...c, opportunityScore, improvementPotential, frequencySignal, effortEstimate }
  })

  // Sort by opportunity score (descending) with tie-breaking; severity over frequency
  scoredCandidates.sort((a, b) => {
    const scoreDiff = b.opportunityScore - a.opportunityScore
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff

    // Tie-break 1: High priority / always-surface first
    const aSeverity = (a.priority === 'High' || matchesAlwaysSurface(a.text)) ? 1 : 0
    const bSeverity = (b.priority === 'High' || matchesAlwaysSurface(b.text)) ? 1 : 0
    if (bSeverity !== aSeverity) return bSeverity - aSeverity

    // Tie-break 2: Higher frequency
    if (b.frequencySignal !== a.frequencySignal) return b.frequencySignal - a.frequencySignal

    // Tie-break 3: Lower word count
    const aWords = a.text.split(/\s+/).length
    const bWords = b.text.split(/\s+/).length
    if (aWords !== bWords) return aWords - bWords

    // Tie-break 4: Action > Theme
    if (a.type !== b.type) return a.type === 'action' ? -1 : 1

    // Tie-break 5: Alphabetical
    return a.text.localeCompare(b.text)
  })

  const top = scoredCandidates[0]

  // Helper to convert priority to impact score (1-3)
  const priorityToImpact = (p: string | undefined): ImpactLevel => {
    if (p === 'High') return 3
    if (p === 'Low') return 1
    return 2 // Medium or default
  }

  // Helper to convert effort estimate (0-1) to effort level (S/M/L)
  const effortToLevel = (e: number): EffortLevel => {
    if (e >= 0.7) return 'S'  // High estimate = Small effort (inverse)
    if (e >= 0.4) return 'M'
    return 'L'
  }

  // Build opportunities array (top 5)
  const opportunities: OpportunityItem[] = scoredCandidates.slice(0, 5).map(c => ({
    text: c.text,
    impactScore: priorityToImpact(c.priority),
    effortScore: effortToLevel(c.effortEstimate),
    priority: (c.priority as 'High' | 'Medium' | 'Low') || 'Medium',
  }))

  return {
    type: top.type,
    text: top.text,
    opportunityScore: Math.round(top.opportunityScore * 1000) / 1000,
    mentionCount: top.mentionCount,
    priority: top.priority || null,
    impactScore: priorityToImpact(top.priority),
    effortScore: effortToLevel(top.effortEstimate),
    opportunities,
    components: {
      improvementPotential: Math.round(top.improvementPotential * 1000) / 1000,
      frequencySignal: Math.round(top.frequencySignal * 1000) / 1000,
      effortEstimate: Math.round(top.effortEstimate * 1000) / 1000,
    },
  }
}

// ============================================================
// MAIN EXPORT
// ============================================================

export interface ComputeSignalsOptions {
  eventId: string
  windowDays?: number
  surveyId?: string | null
  eventStructureItemId?: string | null
  structureKind?: EventDashboardFilters['structureKind']
  /** Events-only evidence cohort. Omit for the legacy Retail analytics path. */
  lifecyclePhase?: ResolvedEventLifecyclePhase
}

export interface ComputeSignalsWithDataResult {
  signals: AnalyticsSignals
  windowData: FetchedData
  windowDays: number
}

/**
 * Computes signals and returns the same window data used for the Key Insights pipeline
 * (so insight sync can attach source answer IDs without a second DB fetch).
 */
export async function computeSignalsWithData(options: ComputeSignalsOptions): Promise<ComputeSignalsWithDataResult> {
  const {
    eventId,
    windowDays = 30,
    surveyId = null,
    eventStructureItemId = null,
    structureKind = null,
    lifecyclePhase,
  } = options
  const now = new Date()
  const filters = {
    surveyId,
    eventStructureItemId,
    structureKind,
  }

  // Fetch current period data
  const data = await fetchEventData(eventId, windowDays, filters, lifecyclePhase)

  // Fetch previous period data for delta computation
  const prevPeriodEnd = new Date(data.periodStart)
  prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 1)
  const prevPeriodStart = new Date(prevPeriodEnd)
  prevPeriodStart.setDate(prevPeriodStart.getDate() - windowDays)

  const previousResponses = await fetchResponsesForSignals({
      eventId,
      ...(lifecyclePhase !== undefined ? responseCollectionPhaseWhere(lifecyclePhase) : {}),
      ...(surveyId ? { surveyId } : {}),
      ...buildEffectiveResponseStructureWhere(filters),
      startedAt: {
        gte: prevPeriodStart,
        lte: prevPeriodEnd,
      },
    })

  // Compute signals in order (per spec)
  const pulse = computePulseFromData({
    responses: data.responses,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    previousPeriodResponses: previousResponses,
  })

  const momentum = computeMomentumFromData({
    responses: data.responses,
    previousResponses: previousResponses as FetchedData['responses'],
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
  })

  const topFriction = computeTopFrictionFromData({
    responses: data.responses,
    now,
  })

  const biggestOpportunity = computeBiggestOpportunityFromData({
    responses: data.responses,
    topFrictionTheme: topFriction.theme,
  })

  const themeSentimentBreakdown = computeThemeSentimentBreakdown(data.responses)

  // Count totals
  const completedResponses = data.responses.filter(r => r.status === 'COMPLETED')
  const { answersCaptured, answersAnalyzed } = countWindowAnswerMetrics(data.responses)

  const signals: AnalyticsSignals = {
    pulse,
    momentum,
    topFriction,
    biggestOpportunity,
    themeSentimentBreakdown,
    metadata: {
      periodStart: data.periodStart.toISOString(),
      periodEnd: data.periodEnd.toISOString(),
      totalResponses: data.responses.length,
      completedResponses: completedResponses.length,
      answersCaptured,
      answersAnalyzed,
      totalAnswers: answersCaptured,
      computedAt: now.toISOString(),
    },
  }

  return { signals, windowData: data, windowDays }
}

export async function computeSignals(options: ComputeSignalsOptions): Promise<AnalyticsSignals> {
  const { signals } = await computeSignalsWithData(options)
  return signals
}
