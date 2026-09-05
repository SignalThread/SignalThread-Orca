export type AdvancedQuestionType =
  | 'OPEN_RESPONSE'
  | 'RATING_1_TO_5'
  | 'RECOMMENDATION_0_TO_10'
  | 'YES_NO'
  | 'SINGLE_CHOICE'
  | 'SPEAKER_FEEDBACK'

export interface AdvancedBuilderQuestion {
  id: string
  text: string
  type: AdvancedQuestionType
  required: boolean
  options?: string[]
}

/** Replaces one temporary AI suggestion without changing its stable UI key. */
export function replaceTemporaryAiSuggestion(
  suggestions: AdvancedBuilderQuestion[],
  suggestionId: string,
  replacement: Omit<AdvancedBuilderQuestion, 'id'>,
): AdvancedBuilderQuestion[] {
  return suggestions.map((question) => question.id === suggestionId ? { ...replacement, id: question.id } : question)
}

/** Removes exactly the temporary suggestion selected by the operator. */
export function removeTemporaryAiSuggestion(suggestions: AdvancedBuilderQuestion[], suggestionId: string): AdvancedBuilderQuestion[] {
  return suggestions.filter((question) => question.id !== suggestionId)
}

/** Updates wording in the temporary suggestion state without changing its type or stable UI key. */
export function updateTemporaryAiSuggestionText(
  suggestions: AdvancedBuilderQuestion[],
  suggestionId: string,
  text: string,
): AdvancedBuilderQuestion[] {
  return suggestions.map((question) => question.id === suggestionId ? { ...question, text } : question)
}

/** Promotes the current temporary suggestion state into persisted-builder question drafts. */
export function keepTemporaryAiSuggestions(
  suggestions: AdvancedBuilderQuestion[],
  createId: () => string,
): AdvancedBuilderQuestion[] {
  return suggestions.map((question) => ({ ...question, id: createId() }))
}
