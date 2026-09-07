import { Prisma, type PrismaClient } from '@prisma/client'
import {
  mergeEventSignageSettings,
  type EventSignageVisualConfiguration,
} from './event-signage'
import { prisma } from './prisma'
import { loadPlannerSurveyTargetIds } from './event-survey-scope'

export class EventSignageApplyError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: 'EVENT_NOT_FOUND' | 'SURVEY_SCOPE_MISMATCH' | 'NO_SURVEYS',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'EventSignageApplyError'
  }
}

/**
 * The only signage-design mutation. All UI scopes resolve explicit survey IDs
 * before calling this account- and event-scoped service.
 */
export async function applyEventSurveySignageConfiguration(
  input: {
    accountId: string
    eventId: string
    surveyIds: string[]
    configuration: EventSignageVisualConfiguration
  },
  db: PrismaClient = prisma,
) {
  const surveyIds = Array.from(new Set(input.surveyIds.map((id) => id.trim()).filter(Boolean)))
  if (surveyIds.length === 0) {
    throw new EventSignageApplyError('At least one survey is required', 400, 'NO_SURVEYS')
  }

  const event = await db.event.findFirst({
    where: { id: input.eventId, location: { accountId: input.accountId } },
    select: { id: true },
  })
  if (!event) {
    throw new EventSignageApplyError('Event not found or access denied', 404, 'EVENT_NOT_FOUND')
  }

  const plannerTargetIds = await loadPlannerSurveyTargetIds(db, event.id)
  const authorizedSurveys = await db.survey.findMany({
    where: { id: { in: surveyIds }, eventId: event.id, surveyTargetId: { in: plannerTargetIds } },
    select: { id: true },
  })
  const foundIds = new Set(authorizedSurveys.map((survey) => survey.id))
  const rejectedSurveyIds = surveyIds.filter((id) => !foundIds.has(id))
  if (rejectedSurveyIds.length > 0) {
    throw new EventSignageApplyError(
      'One or more surveys do not belong to this event',
      400,
      'SURVEY_SCOPE_MISMATCH',
      { rejectedSurveyIds },
    )
  }

  await db.$transaction(async (tx) => {
    const surveys = await tx.survey.findMany({
      where: { id: { in: surveyIds }, eventId: event.id },
      select: { id: true, settingsJson: true },
    })
    await Promise.all(surveys.map((survey) => tx.survey.update({
      where: { id: survey.id },
      data: {
        settingsJson: mergeEventSignageSettings(
          survey.settingsJson,
          input.configuration,
        ) as unknown as Prisma.InputJsonObject,
      },
      select: { id: true },
    })))
  })

  return {
    updatedSurveyIds: surveyIds,
    configuration: input.configuration,
  }
}
