import { describe, it, expect } from 'vitest'
import type { FetchedData } from '@/lib/analytics/signals'
import {
  collectAnswerIdsForThemeKey,
  collectAnswerIdsForActionOpportunity,
  sentimentBucket,
  representativeQuoteSentimentLabel,
} from '@/lib/insights/source-answers'

function mockResponses(
  rows: Array<{
    answerId: string
    themes?: string[]
    actions?: string[]
    sentimentScore?: number | null
  }>
): FetchedData['responses'] {
  return [
    {
      id: 'resp1',
      status: 'COMPLETED',
      startedAt: new Date('2025-01-15T12:00:00Z'),
      answers: rows.map((r) => ({
        id: r.answerId,
        status: 'COMPLETED',
        answerTranscript: { id: `tr-${r.answerId}` },
        answerAnalysis: {
          sentimentScore: r.sentimentScore ?? 0,
          sentimentLabel: 'MIXED',
          themesJson: r.themes ? { themes: r.themes } : { themes: [] },
          actionsJson: r.actions
            ? {
                actionItems: r.actions.map((text) => ({ text, priority: 'Medium' })),
              }
            : { actionItems: [] },
        },
      })),
    },
  ]
}

describe('sentimentBucket', () => {
  it('classifies thresholds like the signals pipeline', () => {
    expect(sentimentBucket(0.5)).toBe('positive')
    expect(sentimentBucket(-0.5)).toBe('negative')
    expect(sentimentBucket(0)).toBe('neutral')
    expect(sentimentBucket(null)).toBe('neutral')
  })
})

describe('representativeQuoteSentimentLabel', () => {
  it('uses readable labels only', () => {
    expect(representativeQuoteSentimentLabel('positive', 0.15)).toBe('Positive')
    expect(representativeQuoteSentimentLabel('negative', -0.15)).toBe('Negative')
    expect(representativeQuoteSentimentLabel('neutral', 0)).toBe('Mixed')
    expect(representativeQuoteSentimentLabel('positive', 0.5)).toBe('Positive · Strong signal')
    expect(representativeQuoteSentimentLabel('neutral', 0.5)).toBe('Mixed · Strong signal')
  })
})

describe('collectAnswerIdsForThemeKey', () => {
  it('returns answer ids whose themes normalize to the key', () => {
    const responses = mockResponses([
      { answerId: 'a1', themes: ['Wait Times'] },
      { answerId: 'a2', themes: ['Other'] },
    ])
    const ids = collectAnswerIdsForThemeKey(responses, 'wait times')
    expect(ids.sort()).toEqual(['a1'])
  })

  it('dedupes by answer (one id per answer)', () => {
    const responses = mockResponses([
      { answerId: 'a1', themes: ['Wait Times', 'wait times'] },
    ])
    const ids = collectAnswerIdsForThemeKey(responses, 'wait times')
    expect(ids).toEqual(['a1'])
  })

  it('ignores non-completed responses', () => {
    const responses: FetchedData['responses'] = [
      {
        id: 'r1',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        answers: [
          {
            id: 'a1',
            status: 'COMPLETED',
            answerTranscript: { id: 'tr-a1' },
            answerAnalysis: {
              sentimentScore: 0,
              sentimentLabel: 'NEUTRAL',
              themesJson: { themes: ['Wait Times'] },
              actionsJson: { actionItems: [] },
            },
          },
        ],
      },
    ]
    expect(collectAnswerIdsForThemeKey(responses, 'wait times')).toEqual([])
  })
})

describe('collectAnswerIdsForActionOpportunity', () => {
  it('matches raw action text to answers', () => {
    const responses = mockResponses([
      { answerId: 'x1', actions: ['Fix WiFi outages'], themes: [] },
      { answerId: 'x2', actions: ['Other action'], themes: [] },
    ])
    const ids = collectAnswerIdsForActionOpportunity(responses, 'Fix WiFi outages')
    expect(ids.sort()).toEqual(['x1'])
  })
})

describe('drill-down integrity', () => {
  it('theme source ids are a subset of completed answers mentioning the theme', () => {
    const responses = mockResponses([
      { answerId: 'a1', themes: ['Staff'], sentimentScore: 0.2 },
      { answerId: 'a2', themes: ['Staff'], sentimentScore: -0.8 },
      { answerId: 'a3', themes: ['Other'], sentimentScore: 0.9 },
    ])
    const ids = new Set(collectAnswerIdsForThemeKey(responses, 'staff'))
    expect(ids.has('a1')).toBe(true)
    expect(ids.has('a2')).toBe(true)
    expect(ids.has('a3')).toBe(false)
    expect(ids.size).toBe(2)
  })
})
