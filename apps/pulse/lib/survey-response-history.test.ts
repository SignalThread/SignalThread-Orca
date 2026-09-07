import { describe, expect, it, vi } from 'vitest'
import { countSurveyResponses, surveyHasResponses, surveyResponseHistoryWhere } from './survey-response-history'

describe('survey response history', () => {
  it('uses only the canonical direct survey relationship in a multi-survey event', async () => {
    const responses = [
      ...Array.from({ length: 5 }, (_, index) => ({ id: `response_b_${index}`, eventId: 'event_x', surveyId: 'survey_b' })),
      { id: 'legacy_event_response', eventId: 'event_x', surveyId: null },
      { id: 'other_event_response', eventId: 'event_y', surveyId: 'survey_other' },
    ]
    const db = {
      response: {
        count: vi.fn(async ({ where }: { where: { surveyId: string } }) => responses.filter((response) => response.surveyId === where.surveyId).length),
      },
    }

    expect(await surveyHasResponses(db, 'survey_a')).toBe(false)
    expect(await surveyHasResponses(db, 'survey_b')).toBe(true)
    expect(await surveyHasResponses(db, 'survey_c')).toBe(false)
    expect(await countSurveyResponses(db, 'survey_b')).toBe(5)
    expect(db.response.count).toHaveBeenCalledWith({ where: { surveyId: 'survey_a' } })
  })

  it('does not attribute a legacy null-survey response to a new survey', () => {
    expect(surveyResponseHistoryWhere('survey_a')).toEqual({ surveyId: 'survey_a' })
  })
})
