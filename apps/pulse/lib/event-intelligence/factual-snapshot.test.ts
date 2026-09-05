import { describe, expect, it } from 'vitest'
import { buildEventIntelligenceFactualSnapshot } from './factual-snapshot'

describe('buildEventIntelligenceFactualSnapshot', () => {
  it('keeps lifecycle consumers on one response, sentiment, and coverage basis', () => {
    const snapshot = buildEventIntelligenceFactualSnapshot({
      responseCount: 12,
      answerCount: 20,
      avgSentiment: 0.1,
      questionBreakdown: [
        { answerCount: 10, avgSentiment: 0.7 },
        { answerCount: 6, avgSentiment: 0 },
        { answerCount: 4, avgSentiment: -0.7 },
      ],
      targetBreakdown: [
        { answerCount: 8, avgSentiment: 0.7 },
        { answerCount: 0, avgSentiment: null },
        { answerCount: 4, avgSentiment: -0.7 },
      ],
    })

    expect(snapshot).toEqual({
      responseCount: 12,
      analyzedAnswerCount: 20,
      sentiment: { percent: 50, favorable: 10, neutral: 6, negative: 4, total: 20 },
      coverage: { representedFeedbackPoints: 2, configuredFeedbackPoints: 3, representedPercent: 67 },
    })
  })
})
