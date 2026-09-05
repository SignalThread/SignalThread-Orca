/**
 * Canonical attribution rule for survey lifecycle protection.
 *
 * A response belongs to a Survey only through Response.surveyId. Event-level
 * legacy responses with a null surveyId are intentionally not attributed to
 * every survey in the event.
 */
export function surveyResponseHistoryWhere(surveyId: string) {
  return { surveyId }
}

type SurveyResponseCounter = {
  response: {
    count(args: { where: ReturnType<typeof surveyResponseHistoryWhere> }): Promise<number>
  }
}

export async function countSurveyResponses(db: SurveyResponseCounter, surveyId: string) {
  return db.response.count({ where: surveyResponseHistoryWhere(surveyId) })
}

export async function surveyHasResponses(db: SurveyResponseCounter, surveyId: string) {
  return (await countSurveyResponses(db, surveyId)) > 0
}
