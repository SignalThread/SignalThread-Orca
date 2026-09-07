import { getInferredSatisfactionSummaryFromBreakdown } from '@/lib/analytics/satisfaction'

/**
 * Facts shared by every lifecycle presentation of an event.  Lifecycle views
 * may change the framing around these values, but never recompute them from a
 * different data set.
 */
export type EventIntelligenceFactualSnapshotInput = {
  responseCount: number
  answerCount: number
  avgSentiment: number | null
  targetBreakdown: Array<{ answerCount: number; avgSentiment: number | null }>
  questionBreakdown: Array<{ answerCount: number; avgSentiment: number | null }>
}

export function buildEventIntelligenceFactualSnapshot(input: EventIntelligenceFactualSnapshotInput) {
  const satisfaction = getInferredSatisfactionSummaryFromBreakdown(input)
  const neutral = satisfaction.buckets.find((bucket) => bucket.key === 'neutral')?.count ?? 0
  const dissatisfied = satisfaction.buckets.find((bucket) => bucket.key === 'dissatisfied')?.count ?? 0
  const veryDissatisfied = satisfaction.buckets.find((bucket) => bucket.key === 'veryDissatisfied')?.count ?? 0
  const configuredFeedbackPoints = input.targetBreakdown.length
  const representedFeedbackPoints = input.targetBreakdown.filter((target) => target.answerCount > 0).length

  return {
    responseCount: input.responseCount,
    analyzedAnswerCount: input.answerCount,
    sentiment: {
      percent: satisfaction.scorePercent,
      favorable: satisfaction.favorableCount,
      neutral,
      negative: dissatisfied + veryDissatisfied,
      total: satisfaction.totalAnalyzed,
    },
    coverage: {
      representedFeedbackPoints,
      configuredFeedbackPoints,
      representedPercent: configuredFeedbackPoints > 0
        ? Math.round((representedFeedbackPoints / configuredFeedbackPoints) * 100)
        : 0,
    },
  }
}
