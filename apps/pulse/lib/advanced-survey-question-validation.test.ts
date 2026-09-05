import { describe, expect, it } from 'vitest'
import { advancedSurveyQuestionValidationIssues } from './advanced-survey-question-validation'

describe('Advanced survey question validation', () => {
  it('identifies missing question text and choices by field', () => {
    expect(advancedSurveyQuestionValidationIssues({
      text: '',
      type: 'SINGLE_CHOICE',
      options: ['Only choice', '  '],
    }, 1)).toEqual([
      { field: 'text', message: 'Question 2 needs question text.' },
      { field: 'options', message: 'Question 2 needs at least two choices.' },
    ])
  })

  it('clears field issues once required values are valid', () => {
    expect(advancedSurveyQuestionValidationIssues({
      text: 'Which session format worked best?',
      type: 'SINGLE_CHOICE',
      options: ['Talk', 'Workshop'],
    }, 0)).toEqual([])
  })

  it('does not require choices for non-choice questions', () => {
    expect(advancedSurveyQuestionValidationIssues({
      text: 'What should we improve?',
      type: 'OPEN_RESPONSE',
    }, 0)).toEqual([])
  })
})
