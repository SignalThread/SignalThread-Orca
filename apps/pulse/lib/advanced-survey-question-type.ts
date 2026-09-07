import type { AdvancedBuilderQuestion, AdvancedQuestionType } from './advanced-temporary-ai-suggestions'
import { DEFAULT_SPEAKER_FEEDBACK_QUESTION } from './speaker-feedback-question'

/**
 * Changes a builder question's actual response type while retaining the
 * shared properties. Type-specific settings are deliberately reset so stale
 * single-choice options cannot leak into a different response format.
 */
export function changeAdvancedQuestionType(
  question: AdvancedBuilderQuestion,
  nextType: AdvancedQuestionType,
): AdvancedBuilderQuestion {
  if (question.type === nextType) return question
  const { options: _options, ...shared } = question
  if (nextType === 'SPEAKER_FEEDBACK') {
    return { ...shared, type: nextType, text: question.text.trim() ? question.text : DEFAULT_SPEAKER_FEEDBACK_QUESTION }
  }
  return nextType === 'SINGLE_CHOICE'
    ? { ...shared, type: nextType, options: ['Option one', 'Option two'] }
    : { ...shared, type: nextType }
}
