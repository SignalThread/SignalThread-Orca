import { randomBytes } from 'crypto'
import { EventStatus, type Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveCurrentSurveyAssignment } from '@/lib/survey-target-assignment'

type DeploymentLifecycleTx = Prisma.TransactionClient

/** One published Survey makes each of its current, valid target links launchable. */
export function isEventSurveyDeploymentLaunchable(status: EventStatus) {
  return status === EventStatus.ACTIVE
}

/**
 * Repairs historical link state without activating expired links or links that
 * have been superseded on their target. The optional primary SurveyTarget is
 * repaired only when a legacy survey has no links at all.
 */
export async function reconcileActiveEventSurveyDeployments(
  input: { eventId: string; surveyId?: string; now?: Date },
  db: Pick<PrismaClient, '$transaction'> = prisma,
) {
  return db.$transaction((tx) => reconcileActiveEventSurveyDeploymentsInTransaction(tx, input))
}

export async function reconcileActiveEventSurveyDeploymentsInTransaction(
  tx: DeploymentLifecycleTx,
  input: { eventId: string; surveyId?: string; now?: Date },
) {
  const now = input.now ?? new Date()
  const surveyWhere = {
    eventId: input.eventId,
    status: EventStatus.ACTIVE,
    ...(input.surveyId ? { id: input.surveyId } : {}),
  }
  const candidates = await tx.publicSurveyLink.findMany({
    where: {
      isActive: false,
      survey: surveyWhere,
      surveyTarget: { eventId: input.eventId, isActive: true },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      metadata: true,
      surveyTarget: {
        select: {
          publicSurveyLinks: {
            orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
            select: { id: true, metadata: true },
          },
        },
      },
    },
  })
  const linkIds = candidates
    .filter((link) => resolveCurrentSurveyAssignment(link.surveyTarget?.publicSurveyLinks ?? [])?.id === link.id)
    .map((link) => link.id)
  if (linkIds.length) {
    await tx.publicSurveyLink.updateMany({ where: { id: { in: linkIds } }, data: { isActive: true } })
  }

  const legacySurveysWithoutLinks = await tx.survey.findMany({
    where: {
      ...surveyWhere,
      surveyTargetId: { not: null },
      surveyTarget: { eventId: input.eventId, isActive: true },
      publicSurveyLinks: { none: {} },
    },
    select: { id: true, surveyTargetId: true },
  })
  if (legacySurveysWithoutLinks.length) {
    await tx.publicSurveyLink.createMany({
      data: legacySurveysWithoutLinks.map((survey) => ({
        surveyId: survey.id,
        surveyTargetId: survey.surveyTargetId!,
        token: randomBytes(18).toString('base64url'),
        isActive: true,
        metadata: { assignmentSource: 'LIFECYCLE_RECONCILIATION', assignmentState: 'CURRENT' },
      })),
      skipDuplicates: true,
    })
  }

  return { activatedLinkIds: linkIds, createdLinkCount: legacySurveysWithoutLinks.length }
}
