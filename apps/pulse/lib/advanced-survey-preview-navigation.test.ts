import { describe, expect, it } from 'vitest'
import {
  buildAdvancedSurveyPreviewScreens,
  moveAdvancedSurveyPreviewIndex,
  normalizeAdvancedSurveyPreviewIndex,
  resolveAdvancedSurveyPreviewPosition,
  resolveAdvancedSurveyPreviewQuestion,
} from './advanced-survey-preview-navigation'

describe('Advanced Survey preview navigation', () => {
  it('keeps a one-question preview on its only question', () => {
    expect(normalizeAdvancedSurveyPreviewIndex(0, 1)).toBe(0)
    expect(moveAdvancedSurveyPreviewIndex({ index: 0, questionCount: 1, direction: -1 })).toBe(0)
    expect(moveAdvancedSurveyPreviewIndex({ index: 0, questionCount: 1, direction: 1 })).toBe(0)
  })

  it('moves through a three-question preview without crossing either boundary', () => {
    expect(moveAdvancedSurveyPreviewIndex({ index: 0, questionCount: 3, direction: 1 })).toBe(1)
    expect(moveAdvancedSurveyPreviewIndex({ index: 1, questionCount: 3, direction: 1 })).toBe(2)
    expect(moveAdvancedSurveyPreviewIndex({ index: 2, questionCount: 3, direction: 1 })).toBe(2)
    expect(moveAdvancedSurveyPreviewIndex({ index: 0, questionCount: 3, direction: -1 })).toBe(0)
  })

  it('keeps the preview index valid after deletion, reordering, and an empty list', () => {
    // Deleting the third question from a three-question survey falls back to
    // the new nearest last question. Reordering does not invalidate an index.
    expect(normalizeAdvancedSurveyPreviewIndex(2, 2)).toBe(1)
    expect(normalizeAdvancedSurveyPreviewIndex(2, 3)).toBe(2)
    expect(normalizeAdvancedSurveyPreviewIndex(4, 0)).toBe(0)
  })

  it('selects each configured question without mutating the survey question list', () => {
    const questions = [
      { id: 'q1', text: 'How was arrival?', type: 'RATING_1_TO_5' },
      { id: 'q2', text: 'Would you recommend this event?', type: 'YES_NO' },
      { id: 'q3', text: 'Which area needs attention?', type: 'SINGLE_CHOICE', options: ['Registration', 'Expo'] },
    ]

    const first = resolveAdvancedSurveyPreviewQuestion(questions, 0)
    const second = resolveAdvancedSurveyPreviewQuestion(questions, moveAdvancedSurveyPreviewIndex({ index: first.index, questionCount: questions.length, direction: 1 }))
    const third = resolveAdvancedSurveyPreviewQuestion(questions, moveAdvancedSurveyPreviewIndex({ index: second.index, questionCount: questions.length, direction: 1 }))

    expect(first.question).toMatchObject({ id: 'q1', type: 'RATING_1_TO_5' })
    expect(second.question).toMatchObject({ id: 'q2', text: 'Would you recommend this event?', type: 'YES_NO' })
    expect(third.question).toMatchObject({ id: 'q3', options: ['Registration', 'Expo'] })
    expect(questions).toEqual([
      { id: 'q1', text: 'How was arrival?', type: 'RATING_1_TO_5' },
      { id: 'q2', text: 'Would you recommend this event?', type: 'YES_NO' },
      { id: 'q3', text: 'Which area needs attention?', type: 'SINGLE_CHOICE', options: ['Registration', 'Expo'] },
    ])
  })

  it.each([
    { presentationMode: 'READ_ALOUD' as const, responseMode: 'VOICE_ONLY' as const },
    { presentationMode: 'SCREEN' as const, responseMode: 'TEXT_ONLY' as const },
    { presentationMode: 'SCREEN' as const, responseMode: 'VOICE_AND_TEXT' as const },
    { presentationMode: 'ATTENDEE_CHOOSES' as const, responseMode: 'VOICE_AND_TEXT' as const },
  ])('always starts preview at T&C regardless of response mode', (settings) => {
    expect(buildAdvancedSurveyPreviewScreens(['q1'], settings))
      .toEqual([{ screen: 'START' }, { screen: 'QUESTION', questionId: 'q1', questionIndex: 0 }])
  })

  it('keeps T&C reachable when navigating from questions back to the start', () => {
    const screens = buildAdvancedSurveyPreviewScreens(['q1', 'q2'], { presentationMode: 'READ_ALOUD', responseMode: 'VOICE_ONLY' })
    expect(screens).toEqual([
      { screen: 'START' },
      { screen: 'QUESTION', questionId: 'q1', questionIndex: 0 },
      { screen: 'QUESTION', questionId: 'q2', questionIndex: 1 },
    ])
    expect(resolveAdvancedSurveyPreviewPosition(screens, screens[0])).toEqual({ index: 0, screen: { screen: 'START' } })
    expect(resolveAdvancedSurveyPreviewPosition(screens, screens[1])).toEqual({ index: 1, screen: { screen: 'QUESTION', questionId: 'q1', questionIndex: 0 } })
  })

  it('preserves current question identity across text, Additional text, and type rerenders', () => {
    const position = { screen: 'QUESTION' as const, questionId: 'q2', questionIndex: 1 }
    const settings = { presentationMode: 'READ_ALOUD' as const, responseMode: 'VOICE_ONLY' as const }
    const before = buildAdvancedSurveyPreviewScreens(['q1', 'q2'], settings)
    // Content and Additional text are intentionally absent from navigation;
    // changing either only rerenders the shared attendee renderer.
    const afterContentEdit = buildAdvancedSurveyPreviewScreens(['q1', 'q2'], settings)
    const afterTypeEdit = buildAdvancedSurveyPreviewScreens(['q1', 'q2'], settings)

    expect(resolveAdvancedSurveyPreviewPosition(before, position).screen).toMatchObject({ questionId: 'q2' })
    expect(resolveAdvancedSurveyPreviewPosition(afterContentEdit, position).screen).toMatchObject({ questionId: 'q2' })
    expect(resolveAdvancedSurveyPreviewPosition(afterTypeEdit, position).screen).toMatchObject({ questionId: 'q2' })
  })

  it('uses the nearest remaining question rather than T&C when a question becomes unavailable', () => {
    const screens = buildAdvancedSurveyPreviewScreens(['q1', 'q3'], { presentationMode: 'ATTENDEE_CHOOSES', responseMode: 'VOICE_AND_TEXT' })
    expect(resolveAdvancedSurveyPreviewPosition(screens, { screen: 'QUESTION', questionId: 'q2', questionIndex: 1 }).screen)
      .toEqual({ screen: 'QUESTION', questionId: 'q3', questionIndex: 1 })
  })

  it('keeps the question viewport active instead of falling back to T&C when no question remains answerable', () => {
    const screens = buildAdvancedSurveyPreviewScreens([], { presentationMode: 'ATTENDEE_CHOOSES', responseMode: 'VOICE_AND_TEXT' })
    expect(screens).toEqual([
      { screen: 'START' },
      { screen: 'QUESTION', questionId: null, questionIndex: 0 },
    ])
    expect(resolveAdvancedSurveyPreviewPosition(screens, { screen: 'QUESTION', questionId: 'q1', questionIndex: 0 }).screen)
      .toEqual({ screen: 'QUESTION', questionId: null, questionIndex: 0 })
  })
})
