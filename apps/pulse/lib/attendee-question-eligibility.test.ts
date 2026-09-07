import { QuestionResponseTarget, QuestionType } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { filterAnswerableAttendeeQuestions, isAttendeeQuestionAnswerable } from './attendee-question-eligibility'

const speakerQuestion = {
  id: 'speaker_question',
  type: QuestionType.SPEAKER_FEEDBACK,
  responseTarget: QuestionResponseTarget.SPEAKERS,
}

describe('attendee question eligibility', () => {
  it('excludes speaker-scoped questions when the live session has no speakers', () => {
    expect(isAttendeeQuestionAnswerable(speakerQuestion, { speakers: [] })).toBe(false)
    expect(filterAnswerableAttendeeQuestions([
      { id: 'rating_question', type: QuestionType.RATING_1_TO_5, responseTarget: QuestionResponseTarget.GENERAL },
      speakerQuestion,
    ], { speakers: [] }).map((question) => question.id)).toEqual(['rating_question'])
  })

  it('keeps speaker-scoped questions when the live session has speakers', () => {
    expect(filterAnswerableAttendeeQuestions([speakerQuestion], {
      speakers: [{ id: 'speaker_1', name: 'Avery Lee' }],
    })).toEqual([speakerQuestion])
  })

  it('does not hide ordinary questions when session context is unavailable', () => {
    expect(filterAnswerableAttendeeQuestions([
      { id: 'yes_no', type: QuestionType.YES_NO, responseTarget: QuestionResponseTarget.GENERAL },
    ], null).map((question) => question.id)).toEqual(['yes_no'])
  })
})
