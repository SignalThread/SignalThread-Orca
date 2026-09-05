import { describe, expect, it, vi } from 'vitest'
import { resolveAnswerQuestionContext } from './answer-question-context'

function makeDb(response: unknown) {
  return {
    response: {
      findUnique: vi.fn().mockResolvedValue(response),
    },
  }
}

describe('resolveAnswerQuestionContext', () => {
  it('preserves legacy event-scoped question matching without assigning questionId', async () => {
    const db = makeDb({
      id: 'resp_legacy',
      eventId: 'evt_123',
      surveyId: null,
      responseMode: 'VOICE_ONLY',
      event: {
        responseMode: 'VOICE_ONLY',
        questions: [
          { key: 'q-1', label: 'Legacy question', ttsText: null, order: 0, required: true },
        ],
        questionsJson: [],
      },
      survey: null,
    })

    await expect(
      resolveAnswerQuestionContext({ responseId: 'resp_legacy', questionKey: 'q-1' }, db as never),
    ).resolves.toEqual({
      responseId: 'resp_legacy',
      eventId: 'evt_123',
      surveyId: null,
      questionId: null,
      questionKey: 'q-1',
      questionType: 'VOICE',
      responseMode: 'VOICE_ONLY',
      scope: 'event',
    })
  })

  it('returns Question.id for survey-scoped responses', async () => {
    const db = makeDb({
      id: 'resp_survey',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      responseMode: 'TEXT_ONLY',
      event: {
        responseMode: 'VOICE_ONLY',
        questions: [],
        questionsJson: [],
      },
      survey: {
        id: 'survey_123',
        responseMode: 'VOICE_AND_TEXT',
        questions: [
          {
            id: 'question_123',
            key: 'survey-q1',
            label: 'Survey question',
            ttsText: null,
            order: 0,
            required: true,
            type: 'RATING_1_TO_5',
          },
        ],
      },
    })

    await expect(
      resolveAnswerQuestionContext({ responseId: 'resp_survey', questionKey: 'survey-q1' }, db as never),
    ).resolves.toEqual({
      responseId: 'resp_survey',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      questionId: 'question_123',
      questionKey: 'survey-q1',
      questionType: 'RATING_1_TO_5',
      responseMode: 'TEXT_ONLY',
      scope: 'survey',
    })
  })

  it('rejects survey responses when the submitted question is not on that survey', async () => {
    const db = makeDb({
      id: 'resp_survey',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      responseMode: 'VOICE_ONLY',
      event: {
        responseMode: 'VOICE_ONLY',
        questions: [],
        questionsJson: [],
      },
      survey: {
        id: 'survey_123',
        responseMode: 'VOICE_ONLY',
        questions: [
          { id: 'question_123', key: 'survey-q1', label: 'Q1', ttsText: null, order: 0, required: true },
        ],
      },
    })

    await expect(
      resolveAnswerQuestionContext({ responseId: 'resp_survey', questionKey: 'other-survey-q1' }, db as never),
    ).rejects.toThrow('Question "other-survey-q1" does not belong to this survey')
  })

  it('rejects unknown legacy event questions cleanly', async () => {
    const db = makeDb({
      id: 'resp_legacy',
      eventId: 'evt_123',
      surveyId: null,
      responseMode: 'VOICE_ONLY',
      event: {
        responseMode: 'VOICE_ONLY',
        questions: [{ key: 'q-1', label: 'Q1', ttsText: null, order: 0, required: true }],
        questionsJson: [],
      },
      survey: null,
    })

    await expect(
      resolveAnswerQuestionContext({ responseId: 'resp_legacy', questionKey: 'missing' }, db as never),
    ).rejects.toThrow('Question with key "missing" does not exist in this event')
  })
})
