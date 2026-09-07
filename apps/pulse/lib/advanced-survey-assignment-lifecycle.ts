import { EventType } from '@prisma/client'
import { surveyHasResponses } from '@/lib/survey-response-history'

type SurveyResponseCounter = Parameters<typeof surveyHasResponses>[0]

/**
 * Canonical lifecycle rule for every Advanced survey assignment surface.
 *
 * A response snapshots its SurveyTarget and PublicSurveyLink at launch, so an
 * assignment change can be forward-only. We deliberately do not reject that
 * transition: reconciliation must preserve response rows and update only the
 * current deployment state.
 */
export async function getAdvancedSurveyAssignmentHistory(
  input: { eventType: EventType; surveyId: string },
  db: SurveyResponseCounter,
) {
  if (input.eventType !== EventType.ADVANCED) return { hasResponses: false }
  return { hasResponses: await surveyHasResponses(db, input.surveyId) }
}
