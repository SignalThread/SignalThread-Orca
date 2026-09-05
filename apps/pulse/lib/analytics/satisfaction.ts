/**
 * Shared inferred-satisfaction definition.
 *
 * This is the single source of truth for "inferred satisfaction" across the
 * product. Both the Events Home featured-event card and the Command Center
 * (Dashboard2) derive their satisfaction score from these helpers so the two
 * surfaces never disagree.
 *
 * Definition (Command Center approach, product-approved):
 * - Analyzed sentiment answers are bucketed into five satisfaction levels.
 * - The headline score is the share of favorable (satisfied + very satisfied)
 *   answers over the total analyzed answers, so it is always between 0 and 100
 *   and never negative.
 * - A low-sample guard flags tiny samples so the UI can avoid false precision.
 */

export type SatisfactionBucketKey =
  | 'verySatisfied'
  | 'satisfied'
  | 'neutral'
  | 'dissatisfied'
  | 'veryDissatisfied'

/** A weighted group of analyzed answers sharing a representative sentiment score. */
export interface SatisfactionSentimentGroup {
  count: number
  sentimentScore: number
}

export interface SatisfactionBucketSummary {
  key: SatisfactionBucketKey
  label: string
  count: number
}

/**
 * Confidence in the score given the analyzed sample size.
 * - `none`: no analyzed sentiment answers yet (score is null).
 * - `low`: some data, but below the confident-sample threshold.
 * - `ok`: enough analyzed answers to show the score with normal confidence.
 */
export type SatisfactionConfidence = 'none' | 'low' | 'ok'

export interface InferredSatisfactionSummary {
  scorePercent: number | null
  totalAnalyzed: number
  favorableCount: number
  buckets: SatisfactionBucketSummary[]
  confidence: SatisfactionConfidence
}

export const SATISFACTION_BUCKETS: Array<{ key: SatisfactionBucketKey; label: string }> = [
  { key: 'verySatisfied', label: 'Very satisfied' },
  { key: 'satisfied', label: 'Satisfied' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'dissatisfied', label: 'Dissatisfied' },
  { key: 'veryDissatisfied', label: 'Very dissatisfied' },
]

/**
 * Minimum analyzed answers required before the score is treated as confident.
 * Below this, the summary is flagged `low` so the UI shows a low-confidence hint
 * instead of implying precision from a handful of answers.
 */
export const MIN_CONFIDENT_SATISFACTION_SAMPLE = 5

export function getSatisfactionBucketKey(sentimentScore: number): SatisfactionBucketKey {
  if (sentimentScore >= 0.6) return 'verySatisfied'
  if (sentimentScore >= 0.2) return 'satisfied'
  if (sentimentScore >= -0.19) return 'neutral'
  if (sentimentScore >= -0.59) return 'dissatisfied'
  return 'veryDissatisfied'
}

function emptyCounts(): Record<SatisfactionBucketKey, number> {
  return {
    verySatisfied: 0,
    satisfied: 0,
    neutral: 0,
    dissatisfied: 0,
    veryDissatisfied: 0,
  }
}

/**
 * Compute an inferred-satisfaction summary from weighted sentiment groups.
 * Groups with a non-finite score or non-positive count are ignored.
 */
export function computeInferredSatisfaction(
  groups: SatisfactionSentimentGroup[],
): InferredSatisfactionSummary {
  const counts = emptyCounts()

  for (const group of groups) {
    if (!Number.isFinite(group.sentimentScore)) continue
    if (!Number.isFinite(group.count) || group.count <= 0) continue
    counts[getSatisfactionBucketKey(group.sentimentScore)] += group.count
  }

  const totalAnalyzed = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const favorableCount = counts.verySatisfied + counts.satisfied

  const confidence: SatisfactionConfidence =
    totalAnalyzed === 0 ? 'none' : totalAnalyzed < MIN_CONFIDENT_SATISFACTION_SAMPLE ? 'low' : 'ok'

  return {
    scorePercent: totalAnalyzed > 0 ? Math.round((favorableCount / totalAnalyzed) * 100) : null,
    totalAnalyzed,
    favorableCount,
    confidence,
    buckets: SATISFACTION_BUCKETS.map((bucket) => ({
      ...bucket,
      count: counts[bucket.key],
    })),
  }
}

/** The breakdown shape produced by the event-intelligence aggregation layer. */
export interface SatisfactionBreakdownInput {
  answerCount: number
  avgSentiment: number | null
  targetBreakdown: Array<{ answerCount: number; avgSentiment: number | null }>
  questionBreakdown: Array<{ answerCount: number; avgSentiment: number | null }>
}

/**
 * Build satisfaction groups from an event-intelligence breakdown, preferring the
 * finest available grouping (question → target → event-level fallback). This is
 * the exact grouping the Command Center uses, so any consumer that feeds the
 * same breakdown gets the same score.
 */
export function satisfactionGroupsFromBreakdown(
  data: SatisfactionBreakdownInput | null | undefined,
): SatisfactionSentimentGroup[] {
  if (!data) return []

  const questionGroups = data.questionBreakdown
    .filter((question) => question.avgSentiment != null && question.answerCount > 0)
    .map((question) => ({ count: question.answerCount, sentimentScore: question.avgSentiment! }))
  if (questionGroups.length > 0) return questionGroups

  const targetGroups = data.targetBreakdown
    .filter((target) => target.avgSentiment != null && target.answerCount > 0)
    .map((target) => ({ count: target.answerCount, sentimentScore: target.avgSentiment! }))
  if (targetGroups.length > 0) return targetGroups

  if (data.avgSentiment != null && data.answerCount > 0) {
    return [{ count: data.answerCount, sentimentScore: data.avgSentiment }]
  }

  return []
}

export function getInferredSatisfactionSummaryFromBreakdown(
  data: SatisfactionBreakdownInput | null | undefined,
): InferredSatisfactionSummary {
  return computeInferredSatisfaction(satisfactionGroupsFromBreakdown(data))
}

/** Headline score string, e.g. `72%` or `N/A` when there is no data. */
export function formatInferredSatisfactionScore(summary: InferredSatisfactionSummary): string {
  return summary.scorePercent == null ? 'N/A' : `${summary.scorePercent}%`
}

/** Human label describing the confidence/emptiness of a satisfaction summary. */
export function getSatisfactionConfidenceLabel(summary: InferredSatisfactionSummary): string {
  if (summary.confidence === 'none') return 'Not enough data'
  if (summary.confidence === 'low') return 'Low confidence'
  return 'Inferred satisfaction'
}
