/**
 * Event/survey helpers for client-side logic.
 */

const INITIAL_SEED_NAMES = [
  'Customer Feedback Kiosk',
  'Event Feedback',
  'Demo Video',
] as const

export interface EventForGating {
  name: string
  questionsJson?: unknown[] | null
  template?: string | null
}

/**
 * Returns true if the event is an auto-created initial seed survey
 * that should be ignored for onboarding hero gating.
 */
export function isInitialSeedSurvey(event: EventForGating): boolean {
  if (INITIAL_SEED_NAMES.includes(event.name as (typeof INITIAL_SEED_NAMES)[number])) {
    return true
  }
  const questions = event.questionsJson
  if (questions == null || !Array.isArray(questions) || questions.length === 0) {
    return true
  }
  if (event.template === 'DEMO') {
    return true
  }
  return false
}
