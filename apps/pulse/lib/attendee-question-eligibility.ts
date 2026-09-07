export type AttendeeQuestionEligibilityContext = {
  speakers?: Array<{ id: string; name: string }>
} | null | undefined

type AttendeeQuestion = {
  type?: string | null
  responseTarget?: string | null
}

/**
 * A question is included in an attendee run only when the current launch
 * context can supply its answerable content. This deliberately uses the
 * live session roster, rather than a roster copied when the survey was
 * authored or assigned.
 */
export function isAttendeeQuestionAnswerable(
  question: AttendeeQuestion,
  context: AttendeeQuestionEligibilityContext,
) {
  const needsSessionSpeakers = question.responseTarget === 'SPEAKERS'
    || question.type === 'SPEAKER_FEEDBACK'

  return !needsSessionSpeakers || Boolean(context?.speakers?.length)
}

export function filterAnswerableAttendeeQuestions<T extends AttendeeQuestion>(
  questions: readonly T[],
  context: AttendeeQuestionEligibilityContext,
) {
  return questions.filter((question) => isAttendeeQuestionAnswerable(question, context))
}
