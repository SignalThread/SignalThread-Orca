import { QuestionResponseTarget, QuestionType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  assertVoiceAnswerType,
  assertQuestionTypesMutable,
  createStructuredAnswer,
  normalizeMixedQuestions,
  validateNumericAnswer,
  submitStructuredAnswer,
} from './mixed-survey-contract'

function structuredDb(overrides: Record<string, unknown> = {}) {
  const responseOverrides = (overrides.response ?? {}) as { survey?: { event?: Record<string, unknown> } } & Record<string, unknown>
  const { survey: surveyOverrides, ...restResponseOverrides } = responseOverrides
  const response = {
    id: 'response_123',
    eventId: 'event_123',
    surveyId: 'survey_123',
    surveyTargetId: 'target_123',
    publicSurveyLinkId: 'link_123',
    status: 'IN_PROGRESS',
    publicSurveyLink: { id: 'link_123', surveyId: 'survey_123', isActive: true, expiresAt: null },
    survey: {
      id: 'survey_123',
      eventId: 'event_123',
      surveyTargetId: 'target_123',
      status: 'ACTIVE',
      surveyTarget: { id: 'target_123', eventId: 'event_123', isActive: true },
      ...surveyOverrides,
      event: { id: 'event_123', status: 'ACTIVE', isActive: true, ...surveyOverrides?.event },
    },
    ...restResponseOverrides,
  }
  const question = {
    id: 'question_123',
    eventId: 'event_123',
    surveyId: 'survey_123',
    key: 'rating',
    label: 'Rate it',
    type: QuestionType.RATING_1_TO_5,
    responseTarget: QuestionResponseTarget.GENERAL,
    ...(overrides.question as object | undefined),
  }
  return {
    response: { findUnique: vi.fn().mockResolvedValue(response) },
    question: { findUnique: vi.fn().mockResolvedValue(question) },
    answer: {
      findFirst: vi.fn().mockResolvedValue(overrides.existing ?? null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'answer_123', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'answer_123', ...data })),
    },
    eventSessionSpeakerAssignment: { findFirst: vi.fn() },
  }
}

describe('mixed survey contract', () => {
  it('defaults old payloads to VOICE and canonicalizes order', () => {
    expect(normalizeMixedQuestions([
      { prompt: 'Explain your rating', order: 9 },
      { prompt: 'Overall rating', type: QuestionType.RATING_1_TO_5, required: false, order: 2 },
    ])).toEqual([
      { id: undefined, key: undefined, prompt: 'Overall rating', type: QuestionType.RATING_1_TO_5, required: false, order: 0 },
      { id: undefined, key: undefined, prompt: 'Explain your rating', type: QuestionType.VOICE, required: true, order: 1 },
    ])
  })

  it('rejects unsupported types and invalid ordering', () => {
    expect(() => normalizeMixedQuestions([{ prompt: 'Q', type: 'BOOLEAN' }])).toThrow('Unsupported question type')
    expect(() => normalizeMixedQuestions([{ prompt: 'Q', order: -1 }])).toThrow('non-negative integer')
    expect(() => normalizeMixedQuestions([{ prompt: 'Q1', order: 0 }, { prompt: 'Q2', order: 0 }])).toThrow('Duplicate question order')
  })

  it.each([
    [QuestionType.RATING_1_TO_5, 1],
    [QuestionType.RATING_1_TO_5, 5],
    [QuestionType.RECOMMENDATION_0_TO_10, 0],
    [QuestionType.RECOMMENDATION_0_TO_10, 10],
    [QuestionType.SPEAKER_FEEDBACK, 5],
    [QuestionType.YES_NO, 1],
    [QuestionType.SINGLE_CHOICE, 0],
  ])('accepts %s boundary value %i', (type, value) => {
    expect(validateNumericAnswer(type, value)).toBe(value)
  })

  it.each([
    [QuestionType.RATING_1_TO_5, 0, 'between 1 and 5'],
    [QuestionType.RATING_1_TO_5, 6, 'between 1 and 5'],
    [QuestionType.RECOMMENDATION_0_TO_10, -1, 'between 0 and 10'],
    [QuestionType.RECOMMENDATION_0_TO_10, 11, 'between 0 and 10'],
  ])('rejects %s out-of-range value %i', (type, value, message) => {
    expect(() => validateNumericAnswer(type, value)).toThrow(message)
  })

  it('rejects answer-type mismatches', () => {
    expect(() => validateNumericAnswer(QuestionType.VOICE, 4)).toThrow('do not accept structured numeric')
    expect(() => validateNumericAnswer(QuestionType.OPEN_RESPONSE, 4)).toThrow('do not accept structured numeric')
    expect(() => assertVoiceAnswerType(QuestionType.OPEN_RESPONSE)).not.toThrow()
    expect(() => assertVoiceAnswerType(QuestionType.RATING_1_TO_5)).toThrow('do not accept voice audio')
  })

  it('blocks changing a persisted question type after responses exist', () => {
    expect(() => assertQuestionTypesMutable(
      [{ id: 'question_1', key: 'q1', type: QuestionType.VOICE }],
      [{ id: 'question_1', key: 'q1', type: QuestionType.RATING_1_TO_5 }],
      2,
    )).toThrow('cannot change after responses')
    expect(() => assertQuestionTypesMutable(
      [{ id: 'question_1', key: 'q1', type: QuestionType.VOICE }],
      [{ id: 'question_1', key: 'q1', type: QuestionType.RATING_1_TO_5 }],
      0,
    )).not.toThrow()
  })

  it('persists a scoped structured answer as completed without audio or processing records', async () => {
    const db = structuredDb()

    await expect(createStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 4 }, db as never))
      .resolves.toMatchObject({ id: 'answer_123', numericValue: 4, status: 'COMPLETED' })
    expect(db.answer.create).toHaveBeenCalledWith({ data: {
      responseId: 'response_123', questionId: 'question_123', questionKey: 'rating', promptLabel: 'Rate it', numericValue: 4, speakerId: null, status: 'COMPLETED',
    } })
  })

  it('continues an in-progress always-open survey response after its parent Event is past', async () => {
    const db = structuredDb({ response: { survey: { event: { status: 'COMPLETED', isActive: true } } } })

    await expect(createStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 4 }, db as never))
      .resolves.toMatchObject({ id: 'answer_123', status: 'COMPLETED' })
  })

  it('returns the same canonical answer for retries and permits correction before finalization', async () => {
    const existing = {
      id: 'answer_123', responseId: 'response_123', questionId: 'question_123', numericValue: 4, status: 'COMPLETED',
    }
    const retryDb = structuredDb({ existing })
    await expect(submitStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 4 }, retryDb as never))
      .resolves.toEqual({ answer: existing, disposition: 'unchanged' })
    expect(retryDb.answer.create).not.toHaveBeenCalled()

    const correctionDb = structuredDb({ existing })
    await expect(submitStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 2 }, correctionDb as never))
      .resolves.toMatchObject({ disposition: 'corrected', answer: { id: 'answer_123', numericValue: 2 } })
    expect(correctionDb.answer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'answer_123' },
      data: expect.objectContaining({ numericValue: 2, status: 'COMPLETED', objectKey: null }),
    }))
  })

  it('rejects finalized responses, invalid public links, and questions outside scope', async () => {
    const finalizedDb = structuredDb({ response: { status: 'COMPLETED' } })
    await expect(submitStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 4 }, finalizedDb as never))
      .rejects.toThrow('already finalized')

    const inactiveLinkDb = structuredDb({ response: {
      publicSurveyLink: { id: 'link_123', surveyId: 'survey_123', isActive: false, expiresAt: null },
    } })
    await expect(submitStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 4 }, inactiveLinkDb as never))
      .rejects.toThrow('link is inactive')

    const db = structuredDb({ question: { surveyId: 'other_survey' } })
    await expect(createStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 4 }, db as never))
      .rejects.toThrow('does not belong to this response survey')
  })

  it('rejects a VOICE question and invalid numeric values before persistence', async () => {
    const voiceDb = structuredDb({ question: { type: QuestionType.VOICE } })
    await expect(submitStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 4 }, voiceDb as never))
      .rejects.toThrow('do not accept structured numeric')
    expect(voiceDb.answer.create).not.toHaveBeenCalled()

    const rangeDb = structuredDb()
    await expect(submitStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', numericValue: 6 }, rangeDb as never))
      .rejects.toThrow('between 1 and 5')
    expect(rangeDb.answer.create).not.toHaveBeenCalled()
  })

  it('stores one presenter rating per stable speaker ID and rejects a speaker outside the session', async () => {
    const db = structuredDb({
      response: {
        survey: { surveyTarget: { id: 'target_123', eventId: 'event_123', isActive: true, category: 'SESSION', eventStructureItemId: 'session_123' } },
      },
      question: { responseTarget: QuestionResponseTarget.SPEAKERS },
    })
    db.eventSessionSpeakerAssignment.findFirst.mockResolvedValue({ id: 'assignment_ada' })

    await expect(submitStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', speakerId: 'speaker_ada', numericValue: 5 }, db as never))
      .resolves.toMatchObject({ answer: { speakerId: 'speaker_ada', numericValue: 5 } })
    expect(db.answer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ speakerId: 'speaker_ada' }) })
    expect(db.eventSessionSpeakerAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sessionId: 'session_123', speakerId: 'speaker_ada' }) }))

    const invalidDb = structuredDb({
      response: { survey: { surveyTarget: { id: 'target_123', eventId: 'event_123', isActive: true, category: 'SESSION', eventStructureItemId: 'session_123' } } },
      question: { responseTarget: QuestionResponseTarget.SPEAKERS },
    })
    invalidDb.eventSessionSpeakerAssignment.findFirst.mockResolvedValue(null)
    await expect(submitStructuredAnswer({ responseId: 'response_123', questionId: 'question_123', speakerId: 'speaker_other', numericValue: 4 }, invalidDb as never))
      .rejects.toThrow('Speaker is not attached to this session')
  })
})
