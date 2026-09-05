export type AdvancedSurveyQuestionValidationField = 'text' | 'options'

export interface AdvancedSurveyQuestionValidationIssue {
  field: AdvancedSurveyQuestionValidationField
  message: string
}

/** Canonical field-level readiness checks shared by the Advanced builder and publish review. */
export function advancedSurveyQuestionValidationIssues(
  question: { text: string; type: string; options?: unknown[] | null },
  index: number,
): AdvancedSurveyQuestionValidationIssue[] {
  const number = index + 1
  const issues: AdvancedSurveyQuestionValidationIssue[] = []

  if (!question.text.trim() || question.text === 'Untitled question') {
    issues.push({ field: 'text', message: `Question ${number} needs question text.` })
  }

  const validOptions = Array.isArray(question.options)
    ? question.options.filter((option): option is string => typeof option === 'string' && Boolean(option.trim()))
    : []
  if (question.type === 'SINGLE_CHOICE' && validOptions.length < 2) {
    issues.push({ field: 'options', message: `Question ${number} needs at least two choices.` })
  }

  return issues
}
