type SurveyTargetMetadata = unknown

type SurveyTargetReader = {
  surveyTarget: {
    findMany(args: {
      where: { eventId: string }
      select: { id: true; metadata: true }
    }): Promise<Array<{ id: string; metadata: unknown }>>
  }
}

const RESULT_ONLY_SCOPES = new Set(['SESSION', 'SPEAKER_ASSIGNMENT', 'SPEAKER'])

/**
 * Session and speaker intelligence may persist canonical survey-side records
 * without turning those records into planner-owned listening points. These
 * records remain available to intelligence queries, but must not appear in
 * Setup, deployment readiness, or listening-plan mutations.
 */
export function isResultOnlySurveyTargetMetadata(metadata: SurveyTargetMetadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const value = metadata as Record<string, unknown>
  return value.listeningPoint === false
    && typeof value.resultScope === 'string'
    && RESULT_ONLY_SCOPES.has(value.resultScope)
}

export function isPlannerManagedSurveyTarget(target: { metadata?: SurveyTargetMetadata } | null | undefined) {
  return !isResultOnlySurveyTargetMetadata(target?.metadata)
}

/**
 * Resolve planner-owned target ids with one narrow metadata query. Callers can
 * then constrain relation-heavy survey queries at the database boundary instead
 * of hydrating result-only session/speaker survey trees and filtering in memory.
 */
export async function loadPlannerSurveyTargetIds(db: SurveyTargetReader, eventId: string) {
  const targets = await db.surveyTarget.findMany({
    where: { eventId },
    select: { id: true, metadata: true },
  })
  return targets.filter(isPlannerManagedSurveyTarget).map((target) => target.id)
}
