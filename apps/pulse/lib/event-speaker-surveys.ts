import { EventStatus, SurveyTargetCategory, type Prisma, type PrismaClient } from '@prisma/client'
import { EventAgendaServiceError, requireAgendaEventScope } from '@/lib/event-agenda-service'
import { createUniquePublicSurveyToken } from '@/lib/event-voice-surveys'
import { resolveCurrentSurveyAssignment, surveyAssignmentMetadata } from '@/lib/survey-target-assignment'
import { isEventSurveyDeploymentLaunchable } from '@/lib/event-survey-deployment-lifecycle'
import { prisma } from '@/lib/prisma'

type SpeakerSurveyDb = PrismaClient
type SpeakerSurveyTx = Prisma.TransactionClient

/** Resolve the canonical account speaker and prove that it participates in this event. */
async function requireEventSpeaker(
  input: { accountId: string; eventId: string; speakerId: string },
  db: SpeakerSurveyDb,
) {
  const scope = await requireAgendaEventScope(input, db)
  const speaker = await db.eventSpeakerProfile.findFirst({
    where: {
      id: input.speakerId.trim(),
      accountId: scope.accountId,
      isArchived: false,
      // Includes the null-session roster membership used by Blank/Advanced
      // events and real session assignments used by Template events.
      sessionAssignments: { some: { eventId: scope.eventId } },
    },
    select: { id: true, name: true },
  })
  if (!speaker) {
    throw new EventAgendaServiceError(
      'Speaker must belong to this account and participate in this event',
      404,
      'SPEAKER_NOT_ASSIGNED_TO_EVENT',
    )
  }
  return { scope, speaker }
}

/**
 * One direct SPEAKER target belongs to one canonical speaker in one event.
 * Session assignments are deliberately not part of the target identity.
 */
export async function ensureEventSpeakerSurveyTarget(
  input: { eventId: string; speakerId: string; speakerName: string },
  tx: SpeakerSurveyTx,
) {
  const existing = await tx.surveyTarget.findFirst({
    where: {
      eventId: input.eventId,
      category: SurveyTargetCategory.SPEAKER,
      speakerId: input.speakerId,
    },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) {
    return tx.surveyTarget.update({
      where: { id: existing.id },
      data: { name: input.speakerName, isActive: true },
    })
  }

  // The deterministic event-scoped slug makes concurrent retries converge on
  // the same target through the existing Event+slug unique constraint.
  const slug = `speaker-${input.speakerId}`
  return tx.surveyTarget.upsert({
    where: { eventId_slug: { eventId: input.eventId, slug } },
    create: {
      eventId: input.eventId,
      speakerId: input.speakerId,
      category: SurveyTargetCategory.SPEAKER,
      name: input.speakerName,
      slug,
      isActive: true,
    },
    update: {
      speakerId: input.speakerId,
      category: SurveyTargetCategory.SPEAKER,
      name: input.speakerName,
      isActive: true,
    },
  })
}

export async function getEventSpeakerSurvey(
  input: { accountId: string; eventId: string; speakerId: string },
  db: SpeakerSurveyDb = prisma,
) {
  const { scope, speaker } = await requireEventSpeaker(input, db)
  const target = await db.surveyTarget.findFirst({
    where: { eventId: scope.eventId, category: SurveyTargetCategory.SPEAKER, speakerId: speaker.id },
    orderBy: { createdAt: 'asc' },
    include: {
      publicSurveyLinks: {
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        include: {
          survey: {
            select: {
              id: true,
              name: true,
              status: true,
              responseMode: true,
              _count: { select: { questions: true, responses: true } },
            },
          },
        },
      },
    },
  })
  const attachment = target?.isActive ? resolveCurrentSurveyAssignment(target.publicSurveyLinks) : null
  const availableSurveys = await db.survey.findMany({
    where: {
      eventId: scope.eventId,
      status: { not: EventStatus.ARCHIVED },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      status: true,
      responseMode: true,
      _count: { select: { questions: true } },
    },
  })

  return {
    speaker,
    target: target ? { id: target.id, isActive: target.isActive } : null,
    attachment: attachment ? {
      survey: attachment.survey,
      publicLink: {
        id: attachment.id,
        token: attachment.token,
        isActive: attachment.isActive,
        kioskPath: `/kiosk?token=${encodeURIComponent(attachment.token)}`,
      },
    } : null,
    availableSurveys,
  }
}

export async function attachExistingSurveyToEventSpeaker(
  input: {
    accountId: string
    eventId: string
    speakerId: string
    surveyId: string
    speakerAssignmentId?: string | null
  },
  db: SpeakerSurveyDb = prisma,
) {
  const { scope, speaker } = await requireEventSpeaker(input, db)
  return db.$transaction(async (tx) => {
    const survey = await tx.survey.findFirst({
      where: {
        id: input.surveyId.trim(),
        eventId: scope.eventId,
        status: { not: EventStatus.ARCHIVED },
        surveyTarget: { category: SurveyTargetCategory.SPEAKER },
      },
      select: { id: true, name: true, status: true, _count: { select: { questions: true } } },
    })
    if (!survey) throw new EventAgendaServiceError('Speaker survey not found in this event', 404, 'SURVEY_NOT_FOUND')
    if (survey._count.questions === 0) {
      throw new EventAgendaServiceError('Survey must have at least one question', 409, 'SURVEY_HAS_NO_QUESTIONS')
    }

    const speakerAssignmentId = input.speakerAssignmentId?.trim() || null
    if (speakerAssignmentId) {
      const assignment = await tx.eventSessionSpeakerAssignment.findFirst({
        where: {
          id: speakerAssignmentId,
          accountId: scope.accountId,
          eventId: scope.eventId,
          speakerId: speaker.id,
          sessionId: { not: null },
        },
        select: { id: true },
      })
      if (!assignment) {
        throw new EventAgendaServiceError(
          'Session launch context does not belong to this speaker in this event',
          400,
          'INVALID_SPEAKER_SESSION_CONTEXT',
        )
      }
    }

    const target = await ensureEventSpeakerSurveyTarget({
      eventId: scope.eventId,
      speakerId: speaker.id,
      speakerName: speaker.name,
    }, tx)
    const targetLinks = await tx.publicSurveyLink.findMany({
      where: { surveyTargetId: target.id },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, surveyId: true, speakerAssignmentId: true, isActive: true, metadata: true },
    })
    const existing = targetLinks.find((link) => link.surveyId === survey.id && link.speakerAssignmentId === speakerAssignmentId) ?? null
    const current = resolveCurrentSurveyAssignment(targetLinks)
    if (current && current.id !== existing?.id) {
      await tx.publicSurveyLink.update({
        where: { id: current.id },
        data: { isActive: false, metadata: surveyAssignmentMetadata(current.metadata, 'SUPERSEDED') },
      })
    }
    await tx.publicSurveyLink.updateMany({
      where: { surveyTargetId: target.id, isActive: true, ...(existing ? { id: { not: existing.id } } : {}) },
      data: { isActive: false },
    })
    const publicLink = existing
      ? await tx.publicSurveyLink.update({
          where: { id: existing.id },
          data: { isActive: isEventSurveyDeploymentLaunchable(survey.status), metadata: surveyAssignmentMetadata(existing.metadata, 'CURRENT') },
        })
      : await tx.publicSurveyLink.create({
          data: {
            surveyId: survey.id,
            surveyTargetId: target.id,
            speakerAssignmentId,
            token: await createUniquePublicSurveyToken(tx),
            isActive: isEventSurveyDeploymentLaunchable(survey.status),
            metadata: { assignmentSource: 'SPEAKER_SURVEY_ATTACHMENT', targetType: 'SPEAKER', assignmentState: 'CURRENT' },
          },
        })
    return { target, survey, publicLink, alreadyAttached: Boolean(existing) }
  })
}

export async function removeEventSpeakerSurveyAttachment(
  input: { accountId: string; eventId: string; speakerId: string },
  db: SpeakerSurveyDb = prisma,
) {
  const { scope, speaker } = await requireEventSpeaker(input, db)
  return db.$transaction(async (tx) => {
    const target = await tx.surveyTarget.findFirst({
      where: { eventId: scope.eventId, category: SurveyTargetCategory.SPEAKER, speakerId: speaker.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (!target) return { removed: false, deactivatedLinkCount: 0 }
    const links = await tx.publicSurveyLink.updateMany({
      where: { surveyTargetId: target.id, isActive: true },
      data: { isActive: false },
    })
    await tx.surveyTarget.update({ where: { id: target.id }, data: { isActive: false } })
    return { removed: links.count > 0, deactivatedLinkCount: links.count }
  })
}
