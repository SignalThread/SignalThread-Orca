import { describe, expect, it } from 'vitest'
import { changeAdvancedQuestionType } from './advanced-survey-question-type'
import { DEFAULT_SPEAKER_FEEDBACK_QUESTION, SPEAKER_NAME_TOKEN } from './speaker-feedback-question'

describe('changeAdvancedQuestionType', () => {
  it('changes the underlying type while preserving shared question fields and initializing single-choice defaults', () => {
    const question = { id: 'question_1', text: 'How was the session?', type: 'YES_NO' as const, required: false }

    expect(changeAdvancedQuestionType(question, 'SINGLE_CHOICE')).toEqual({
      id: 'question_1', text: 'How was the session?', type: 'SINGLE_CHOICE', required: false,
      options: ['Option one', 'Option two'],
    })
  })

  it('removes incompatible old options when changing away from single choice', () => {
    const question = { id: 'question_1', text: 'Which area helped?', type: 'SINGLE_CHOICE' as const, required: true, options: ['Registration', 'Sessions'] }

    expect(changeAdvancedQuestionType(question, 'RATING_1_TO_5')).toEqual({
      id: 'question_1', text: 'Which area helped?', type: 'RATING_1_TO_5', required: true,
    })
  })

  it('adds the dynamic speaker default only when changing an empty question to speaker feedback', () => {
    const changed = changeAdvancedQuestionType({ id: 'question_1', text: '   ', type: 'OPEN_RESPONSE', required: true }, 'SPEAKER_FEEDBACK')

    expect(changed).toEqual({
      id: 'question_1', text: DEFAULT_SPEAKER_FEEDBACK_QUESTION, type: 'SPEAKER_FEEDBACK', required: true,
    })
    expect(changed.text).toContain(SPEAKER_NAME_TOKEN)
  })

  it('preserves existing text when changing to speaker feedback and never re-adds a default for its current type', () => {
    const existing = { id: 'question_1', text: 'How clear was the presentation?', type: 'OPEN_RESPONSE' as const, required: true }
    const changed = changeAdvancedQuestionType(existing, 'SPEAKER_FEEDBACK')
    const cleared = { ...changed, text: '' }

    expect(changed.text).toBe(existing.text)
    expect(changeAdvancedQuestionType(cleared, 'SPEAKER_FEEDBACK')).toBe(cleared)
  })
})
