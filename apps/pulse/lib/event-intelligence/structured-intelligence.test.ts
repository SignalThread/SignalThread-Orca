import { describe, expect, it } from 'vitest'
import { QuestionType } from '@prisma/client'
import {
  buildMixedSignalCandidates,
  buildStructuredMetrics,
  getSampleStrength,
  type StructuredAnswerRow,
  type VoiceSignalRow,
} from './structured-intelligence'

const now = new Date('2026-07-20T16:00:00.000Z')

function structuredRow(overrides: Partial<StructuredAnswerRow> = {}): StructuredAnswerRow {
  return {
    answerId: 'answer_1',
    responseId: 'response_1',
    completedAt: new Date('2026-07-20T15:50:00.000Z'),
    numericValue: 2,
    questionId: 'rating_question',
    questionType: QuestionType.RATING_1_TO_5,
    questionLabel: 'How was registration?',
    surveyId: 'survey_1',
    surveyName: 'Arrival pulse',
    surveyTargetId: 'target_1',
    surveyTargetName: 'Registration',
    eventStructureItemId: 'area_1',
    eventStructureItemName: 'Registration hall',
    ...overrides,
  }
}

function voiceRow(overrides: Partial<VoiceSignalRow> = {}): VoiceSignalRow {
  return {
    answerId: 'voice_1',
    responseId: 'voice_response_1',
    createdAt: new Date('2026-07-20T15:55:00.000Z'),
    surveyId: 'survey_1',
    surveyTargetId: 'target_1',
    eventStructureItemId: 'area_1',
    sentimentLabel: 'NEGATIVE',
    sentimentScore: -0.7,
    themes: [{ themeKey: 'access_checkin', label: 'Access and check-in' }],
    ...overrides,
  }
}

describe('structured event intelligence', () => {
  it('computes rating averages, complete distributions, windows, grouping, and movement', () => {
    const rows = [
      structuredRow({ answerId: 'a1', responseId: 'r1', numericValue: 2 }),
      structuredRow({ answerId: 'a2', responseId: 'r2', numericValue: 3 }),
      structuredRow({ answerId: 'a3', responseId: 'r3', numericValue: 4 }),
      structuredRow({
        answerId: 'a4',
        responseId: 'r4',
        numericValue: 5,
        completedAt: new Date('2026-07-20T15:20:00.000Z'),
      }),
      structuredRow({
        answerId: 'a5',
        responseId: 'r5',
        numericValue: 4,
        completedAt: new Date('2026-07-20T15:10:00.000Z'),
      }),
    ]

    const [metric] = buildStructuredMetrics(rows, now)

    expect(metric).toMatchObject({
      questionId: 'rating_question',
      surveyTargetId: 'target_1',
      eventStructureItemId: 'area_1',
      count: 5,
      average: 3.6,
      distribution: { '1': 0, '2': 1, '3': 1, '4': 2, '5': 1 },
      recent: { count: 3, average: 3 },
      preceding: { count: 2, average: 4.5 },
      change: -1.5,
      direction: 'DECLINING',
    })
  })

  it('computes recommendation averages and a complete 0–10 distribution without inventing NPS', () => {
    const rows = [0, 5, 10].map((numericValue, index) => structuredRow({
      answerId: `rec_${index}`,
      responseId: `rec_response_${index}`,
      questionId: 'recommendation_question',
      questionType: QuestionType.RECOMMENDATION_0_TO_10,
      questionLabel: 'How likely are you to recommend this event?',
      numericValue,
    }))

    const [metric] = buildStructuredMetrics(rows, now)

    expect(metric.average).toBe(5)
    expect(metric.distribution).toEqual({
      '0': 1, '1': 0, '2': 0, '3': 0, '4': 0, '5': 1,
      '6': 0, '7': 0, '8': 0, '9': 0, '10': 1,
    })
    expect(metric).not.toHaveProperty('nps')
  })

  it('reports Yes/No as a scoped split without creating rating-style alert candidates', () => {
    const rows = [1, 0, 1].map((numericValue, index) => structuredRow({
      answerId: `yes_no_${index}`,
      responseId: `yes_no_response_${index}`,
      questionId: 'yes_no_question',
      questionType: QuestionType.YES_NO,
      questionLabel: 'Would you attend again?',
      numericValue,
    }))
    const [metric] = buildStructuredMetrics(rows, now)

    expect(metric).toMatchObject({ count: 3, average: 0.67, distribution: { '0': 1, '1': 2 } })
    expect(buildMixedSignalCandidates({ eventId: 'event_1', metrics: [metric], structuredRows: rows, voiceRows: [], now })).toEqual([])
  })

  it('keeps same-label questions from separate surveys in separate aggregate rows', () => {
    const metrics = buildStructuredMetrics([
      structuredRow({ answerId: 'survey_a_answer', responseId: 'survey_a_response', surveyId: 'survey_a', questionId: 'survey_a_question', numericValue: 1 }),
      structuredRow({ answerId: 'survey_b_answer', responseId: 'survey_b_response', surveyId: 'survey_b', questionId: 'survey_b_question', numericValue: 5 }),
    ], now)

    expect(metrics).toHaveLength(2)
    expect(metrics.map((metric) => ({ surveyId: metric.surveyId, count: metric.count, average: metric.average }))).toEqual([
      { surveyId: 'survey_a', count: 1, average: 1 },
      { surveyId: 'survey_b', count: 1, average: 5 },
    ])
  })

  it('labels limited, directional, and strong evidence with explainable reasons', () => {
    expect(getSampleStrength({ count: 2 }).level).toBe('LIMITED')
    expect(getSampleStrength({ count: 4 }).level).toBe('DIRECTIONAL')
    expect(getSampleStrength({
      count: 10,
      recentCount: 5,
      precedingCount: 5,
      distribution: { '1': 2, '2': 2, '3': 2, '4': 2, '5': 2 },
    })).toMatchObject({ level: 'STRONG', label: 'Strong signal' })
    expect(getSampleStrength({ count: 1, additionalVoiceResponseCount: 2 }).level).toBe('DIRECTIONAL')
  })

  it('creates deterministic low-score, decline, and structured-plus-voice candidates', () => {
    const structuredRows = [
      ...[1, 2, 2].map((numericValue, index) => structuredRow({
        answerId: `recent_${index}`,
        responseId: `recent_response_${index}`,
        numericValue,
      })),
      ...[4, 4, 5].map((numericValue, index) => structuredRow({
        answerId: `preceding_${index}`,
        responseId: `preceding_response_${index}`,
        numericValue,
        completedAt: new Date(`2026-07-20T15:${10 + index}:00.000Z`),
      })),
    ]
    const voiceRows = [
      voiceRow({ answerId: 'v1', responseId: 'vr1' }),
      voiceRow({ answerId: 'v2', responseId: 'vr2' }),
    ]
    const metrics = buildStructuredMetrics(structuredRows, now)

    const first = buildMixedSignalCandidates({
      eventId: 'event_1', metrics, structuredRows, voiceRows, now,
    })
    const second = buildMixedSignalCandidates({
      eventId: 'event_1', metrics, structuredRows, voiceRows, now,
    })

    expect(first.map((candidate) => candidate.ruleType)).toEqual(expect.arrayContaining([
      'LOW_SCORE', 'MEANINGFUL_DECLINE', 'STRUCTURED_VOICE_AGREEMENT',
    ]))
    expect(second.map((candidate) => candidate.key)).toEqual(first.map((candidate) => candidate.key))
    expect(new Set(first.map((candidate) => candidate.key)).size).toBe(first.length)
    expect(first.find((candidate) => candidate.ruleType === 'STRUCTURED_VOICE_AGREEMENT')).toMatchObject({
      voiceAnswerIds: ['v1', 'v2'],
      surveyTargetId: 'target_1',
    })
  })

  it('creates repeated-theme and cross-area candidates from distinct negative voice responses', () => {
    const voiceRows = [
      voiceRow({ answerId: 'v1', responseId: 'r1', eventStructureItemId: 'area_1' }),
      voiceRow({ answerId: 'v2', responseId: 'r2', eventStructureItemId: 'area_1' }),
      voiceRow({ answerId: 'v3', responseId: 'r3', eventStructureItemId: 'area_2', surveyTargetId: 'target_2' }),
      voiceRow({ answerId: 'v4', responseId: 'r4', eventStructureItemId: 'area_2', surveyTargetId: 'target_2' }),
    ]

    const candidates = buildMixedSignalCandidates({
      eventId: 'event_1', metrics: [], structuredRows: [], voiceRows, now,
    })

    expect(candidates.some((candidate) => candidate.ruleType === 'CROSS_AREA_ISSUE')).toBe(true)
    expect(candidates.filter((candidate) => candidate.ruleType === 'REPEATED_NEGATIVE_THEME')).toHaveLength(0)

    const sameTarget = voiceRows.map((row) => ({ ...row, surveyTargetId: 'target_1' }))
    const repeated = buildMixedSignalCandidates({
      eventId: 'event_1', metrics: [], structuredRows: [], voiceRows: sameTarget, now,
    })
    expect(repeated.some((candidate) => candidate.ruleType === 'REPEATED_NEGATIVE_THEME')).toBe(true)
  })

  it('does not create candidates below minimum evidence or from nonnegative voice rows', () => {
    const structuredRows = [
      structuredRow({ answerId: 'a1', responseId: 'r1', numericValue: 1 }),
      structuredRow({ answerId: 'a2', responseId: 'r2', numericValue: 1 }),
    ]
    const voiceRows = [voiceRow({
      sentimentLabel: 'POSITIVE',
      sentimentScore: 0.8,
    })]

    expect(buildMixedSignalCandidates({
      eventId: 'event_1',
      metrics: buildStructuredMetrics(structuredRows, now),
      structuredRows,
      voiceRows,
      now,
    })).toEqual([])
  })
})
