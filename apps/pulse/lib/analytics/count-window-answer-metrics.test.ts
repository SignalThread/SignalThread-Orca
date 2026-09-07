import { describe, expect, it } from 'vitest'
import { countWindowAnswerMetrics, type FetchedData } from '@/lib/analytics/signals'

describe('countWindowAnswerMetrics', () => {
  it('counts captured vs analyzed answers', () => {
    const responses: FetchedData['responses'] = [
      {
        id: 'r1',
        startedAt: new Date(),
        status: 'COMPLETED',
        answers: [
          {
            id: 'a1',
            status: 'COMPLETED',
            answerTranscript: { id: 't1' },
            answerAnalysis: {
              sentimentScore: 0,
              sentimentLabel: null,
              themesJson: null,
              actionsJson: null,
            },
          },
          {
            id: 'a2',
            status: 'PROCESSING_ANALYSIS',
            answerTranscript: { id: 't2' },
            answerAnalysis: null,
          },
        ],
      },
    ]

    expect(countWindowAnswerMetrics(responses)).toEqual({
      answersCaptured: 2,
      answersAnalyzed: 1,
    })
  })
})
