import { describe, expect, it } from 'vitest'
import {
  computeInferredSatisfaction,
  formatInferredSatisfactionScore,
  getInferredSatisfactionSummaryFromBreakdown,
  getSatisfactionBucketKey,
  getSatisfactionConfidenceLabel,
  satisfactionGroupsFromBreakdown,
} from './satisfaction'

describe('getSatisfactionBucketKey', () => {
  it('buckets sentiment scores deterministically at the thresholds', () => {
    expect(getSatisfactionBucketKey(0.6)).toBe('verySatisfied')
    expect(getSatisfactionBucketKey(0.2)).toBe('satisfied')
    expect(getSatisfactionBucketKey(0.19)).toBe('neutral')
    expect(getSatisfactionBucketKey(-0.19)).toBe('neutral')
    expect(getSatisfactionBucketKey(-0.2)).toBe('dissatisfied')
    expect(getSatisfactionBucketKey(-0.59)).toBe('dissatisfied')
    expect(getSatisfactionBucketKey(-0.6)).toBe('veryDissatisfied')
  })
})

describe('computeInferredSatisfaction', () => {
  it('returns a "not enough data" state for empty input', () => {
    const summary = computeInferredSatisfaction([])
    expect(summary.totalAnalyzed).toBe(0)
    expect(summary.favorableCount).toBe(0)
    expect(summary.scorePercent).toBeNull()
    expect(summary.confidence).toBe('none')
    expect(getSatisfactionConfidenceLabel(summary)).toBe('Not enough data')
    expect(formatInferredSatisfactionScore(summary)).toBe('N/A')
  })

  it('flags low confidence for tiny samples below the threshold', () => {
    const summary = computeInferredSatisfaction([
      { count: 1, sentimentScore: 0.8 },
      { count: 1, sentimentScore: 0.1 },
    ])
    expect(summary.totalAnalyzed).toBe(2)
    expect(summary.confidence).toBe('low')
    expect(summary.scorePercent).toBe(50)
    expect(getSatisfactionConfidenceLabel(summary)).toBe('Low confidence')
  })

  it('computes a favorable-share score with ok confidence for larger samples', () => {
    const summary = computeInferredSatisfaction([
      { count: 4, sentimentScore: 0.7 }, // very satisfied → favorable
      { count: 2, sentimentScore: 0.3 }, // satisfied → favorable
      { count: 2, sentimentScore: 0 }, // neutral
      { count: 2, sentimentScore: -0.8 }, // very dissatisfied
    ])
    expect(summary.totalAnalyzed).toBe(10)
    expect(summary.favorableCount).toBe(6)
    expect(summary.scorePercent).toBe(60)
    expect(summary.confidence).toBe('ok')
    expect(getSatisfactionConfidenceLabel(summary)).toBe('Inferred satisfaction')
  })

  it('never produces a negative percentage even with all-negative sentiment', () => {
    const summary = computeInferredSatisfaction([
      { count: 6, sentimentScore: -0.9 },
      { count: 4, sentimentScore: -0.3 },
    ])
    expect(summary.scorePercent).toBe(0)
    expect(summary.favorableCount).toBe(0)
  })

  it('ignores non-finite scores and non-positive counts', () => {
    const summary = computeInferredSatisfaction([
      { count: 5, sentimentScore: Number.NaN },
      { count: 0, sentimentScore: 0.9 },
      { count: -3, sentimentScore: 0.9 },
      { count: 5, sentimentScore: 0.9 },
    ])
    expect(summary.totalAnalyzed).toBe(5)
    expect(summary.favorableCount).toBe(5)
    expect(summary.scorePercent).toBe(100)
  })
})

describe('satisfactionGroupsFromBreakdown', () => {
  it('prefers question breakdown over target and fallback', () => {
    const groups = satisfactionGroupsFromBreakdown({
      answerCount: 20,
      avgSentiment: 0.5,
      targetBreakdown: [{ answerCount: 10, avgSentiment: -0.5 }],
      questionBreakdown: [
        { answerCount: 3, avgSentiment: 0.7 },
        { answerCount: 2, avgSentiment: null },
      ],
    })
    expect(groups).toEqual([{ count: 3, sentimentScore: 0.7 }])
  })

  it('falls back to target breakdown when no question sentiment exists', () => {
    const groups = satisfactionGroupsFromBreakdown({
      answerCount: 20,
      avgSentiment: 0.5,
      targetBreakdown: [{ answerCount: 10, avgSentiment: -0.5 }],
      questionBreakdown: [],
    })
    expect(groups).toEqual([{ count: 10, sentimentScore: -0.5 }])
  })

  it('falls back to the event-level average as a last resort', () => {
    const groups = satisfactionGroupsFromBreakdown({
      answerCount: 8,
      avgSentiment: 0.3,
      targetBreakdown: [],
      questionBreakdown: [],
    })
    expect(groups).toEqual([{ count: 8, sentimentScore: 0.3 }])
  })

  it('produces the same score as the Command Center breakdown path', () => {
    const breakdown = {
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
    }
    const summary = getInferredSatisfactionSummaryFromBreakdown(breakdown)
    expect(summary.totalAnalyzed).toBe(10)
    expect(summary.favorableCount).toBe(5)
    expect(summary.scorePercent).toBe(50)
  })
})
