import type { AdvancedSurveyExperienceSettings } from './advanced-survey-experience'

/**
 * Keeps the builder-only attendee preview pointed at an existing question.
 * This state is deliberately separate from survey content and persistence.
 */
export function normalizeAdvancedSurveyPreviewIndex(index: number, questionCount: number) {
  if (questionCount <= 0) return 0
  return Math.min(Math.max(index, 0), questionCount - 1)
}

export function moveAdvancedSurveyPreviewIndex(input: {
  index: number
  questionCount: number
  direction: -1 | 1
}) {
  return normalizeAdvancedSurveyPreviewIndex(input.index + input.direction, input.questionCount)
}

export function resolveAdvancedSurveyPreviewQuestion<T>(questions: readonly T[], index: number) {
  const validIndex = normalizeAdvancedSurveyPreviewIndex(index, questions.length)
  return { index: validIndex, question: questions[validIndex] ?? null }
}

export type AdvancedSurveyPreviewPosition =
  | { screen: 'START' }
  | { screen: 'QUESTION'; questionId: string | null; questionIndex: number }

export type AdvancedSurveyPreviewScreen = AdvancedSurveyPreviewPosition

/**
 * Every preview begins at the attendee's canonical T&C/start screen. Response
 * mode changes question controls; it never removes consent from the flow.
 */
export function buildAdvancedSurveyPreviewScreens(
  questionIds: readonly string[],
  _settings: AdvancedSurveyExperienceSettings,
): AdvancedSurveyPreviewScreen[] {
  const questionScreens = questionIds.map((questionId, questionIndex) => ({
    screen: 'QUESTION' as const,
    questionId,
    questionIndex,
  }))
  const effectiveQuestionScreens: AdvancedSurveyPreviewScreen[] = questionScreens.length > 0
    ? questionScreens
    : [{ screen: 'QUESTION', questionId: null, questionIndex: 0 }]
  // Always retain both the canonical T&C/start screen and a question viewport.
  // The question viewport must never fall back to T&C after eligibility edits.
  return [{ screen: 'START' as const }, ...effectiveQuestionScreens]
}

/**
 * Resolve a stable screen/question identity against current builder content.
 * Question text, question Additional text, settings, and type edits retain
 * the same question ID. Deletion or eligibility changes choose the nearest
 * remaining question, never T&C.
 */
export function resolveAdvancedSurveyPreviewPosition(
  screens: readonly AdvancedSurveyPreviewScreen[],
  position: AdvancedSurveyPreviewPosition,
) {
  const exactIndex = screens.findIndex((screen) => (
    position.screen === 'START'
      ? screen.screen === 'START'
      : screen.screen === 'QUESTION' && screen.questionId === position.questionId
  ))
  if (exactIndex >= 0) return { index: exactIndex, screen: screens[exactIndex] }

  if (position.screen === 'QUESTION') {
    const questionScreens = screens.filter((screen): screen is Extract<AdvancedSurveyPreviewScreen, { screen: 'QUESTION' }> => screen.screen === 'QUESTION')
    const nearest = questionScreens[normalizeAdvancedSurveyPreviewIndex(position.questionIndex, questionScreens.length)]
    if (nearest) return { index: screens.indexOf(nearest), screen: nearest }
  }

  return { index: 0, screen: screens[0] }
}
