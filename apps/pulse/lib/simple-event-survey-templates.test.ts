import { QuestionType } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { getSimpleEventSurveyTemplate, SIMPLE_EVENT_SURVEY_TEMPLATES } from './simple-event-survey-templates'

describe('Simple Event survey templates', () => {
  it('keeps the five supported starting points separate from ordinary survey persistence', () => {
    expect(SIMPLE_EVENT_SURVEY_TEMPLATES.map((template) => template.id)).toEqual([
      'event-feedback', 'attendee-experience', 'sponsor-exhibitor-feedback', 'post-event-wrap-up',
    ])
    expect(SIMPLE_EVENT_SURVEY_TEMPLATES.every((template) => template.questions.every((question) => [QuestionType.RATING_1_TO_5, QuestionType.OPEN_RESPONSE].includes(question.type)))).toBe(true)
  })

  it.each([
    ['event-feedback', 5, 'Overall, how would you rate your experience at this event?'],
    ['attendee-experience', 5, 'How would you rate your arrival and check-in experience?'],
    ['sponsor-exhibitor-feedback', 5, 'Overall, how would you rate your experience as a sponsor or exhibitor?'],
    ['post-event-wrap-up', 6, 'Overall, how would you rate the event?'],
  ] as const)('defines %s as editable normal questions', (id, count, firstQuestion) => {
    const template = getSimpleEventSurveyTemplate(id)
    expect(template?.questions).toHaveLength(count)
    expect(template?.questions[0]).toMatchObject({ text: firstQuestion, required: true })
    expect(template?.questions.map((question) => question.id)).toEqual(Array.from({ length: count }, (_, index) => `${id}-${index + 1}`))
  })

  it('does not expose a Net Promoter starting point', () => {
    expect(getSimpleEventSurveyTemplate('net-promoter')).toBeNull()
  })
})
