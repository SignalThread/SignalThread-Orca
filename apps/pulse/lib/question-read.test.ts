import { describe, expect, it } from 'vitest'
import { resolveEventQuestionsFromSource, toQuestionBuilderQuestions } from './question-read'

describe('resolveEventQuestionsFromSource', () => {
  it('prefers Question rows over stale questionsJson when rows exist', () => {
    expect(
      resolveEventQuestionsFromSource({
        questions: [
          { key: 'q-2', label: 'Second', ttsText: null, order: 2, required: false },
          { key: 'q-1', label: 'First', ttsText: 'Speak first', order: 1, required: true },
        ],
        questionsJson: [
          { key: 'legacy', label: 'Legacy question', order: 99, required: true },
        ],
      }),
    ).toEqual([
      { key: 'q-1', label: 'First', ttsText: 'Speak first', order: 1, required: true },
      { key: 'q-2', label: 'Second', ttsText: null, order: 2, required: false },
    ])
  })

  it('falls back to questionsJson only when no Question rows exist', () => {
    expect(
      resolveEventQuestionsFromSource({
        questions: [],
        questionsJson: [
          { id: 'q-2', text: 'Second question', order: 2, isRequired: false },
          { key: 'q-1', label: 'First question', order: 1, required: true },
        ],
      }),
    ).toEqual([
      { key: 'q-1', label: 'First question', ttsText: null, order: 1, required: true },
      { key: 'q-2', label: 'Second question', ttsText: null, order: 2, required: false },
    ])
  })
})

describe('toQuestionBuilderQuestions', () => {
  it('converts resolved questions into the existing draft editor shape', () => {
    expect(
      toQuestionBuilderQuestions([
        { key: 'q-1', label: 'First question', ttsText: null, order: 0, required: true },
      ]),
    ).toEqual([
      { id: 'q-1', text: 'First question', order: 0 },
    ])
  })

  it('excludes survey-owned questions from legacy event question reads', () => {
    expect(resolveEventQuestionsFromSource({
      questions: [
        { key: 'legacy', label: 'Legacy', ttsText: null, order: 0, required: true, surveyId: null },
        { key: 'survey', label: 'Survey', ttsText: null, order: 0, required: true, surveyId: 'survey_123' },
      ],
      questionsJson: [],
    })).toEqual([{ key: 'legacy', label: 'Legacy', ttsText: null, order: 0, required: true }])
  })
})
