import { EventStructureItemKind, QuestionResponseTarget, SurveyTargetCategory, type PrismaClient } from '@prisma/client'

type SessionSurveyContextDb = Pick<PrismaClient, 'eventStructureItem'>

export interface SessionSurveyContext {
  session: { id: string; name: string }
  speakers: Array<{ id: string; name: string }>
  presenterRatingQuestionId: string | null
}

/**
 * Resolves kiosk context from the canonical survey target -> agenda session ->
 * EventSessionSpeakerAssignment path. Speaker names are read at launch time,
 * so agenda changes appear without a copied survey roster.
 */
export async function resolveSessionSurveyContext(
  input: {
    eventId: string
    target: { category: SurveyTargetCategory | string; eventStructureItemId?: string | null }
    questions: Array<{ id: string; responseTarget?: QuestionResponseTarget | string | null }>
  },
  db: SessionSurveyContextDb,
): Promise<SessionSurveyContext | null> {
  if (input.target.category !== SurveyTargetCategory.SESSION || !input.target.eventStructureItemId) {
    return null
  }

  const session = await db.eventStructureItem.findFirst({
    where: {
      id: input.target.eventStructureItemId,
      eventId: input.eventId,
      kind: EventStructureItemKind.SESSION,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      speakerAssignments: {
        orderBy: { sortOrder: 'asc' },
        select: {
          speakerId: true,
          speaker: { select: { name: true, isArchived: true } },
        },
      },
    },
  })

  if (!session) return null

  const speakers = session.speakerAssignments
    .filter((assignment) => !assignment.speaker.isArchived && assignment.speaker.name.trim().length > 0)
    .map((assignment) => ({ id: assignment.speakerId, name: assignment.speaker.name.trim() }))

  return {
    session: { id: session.id, name: session.name },
    speakers,
    presenterRatingQuestionId: input.questions.find(
      (question) => question.responseTarget === QuestionResponseTarget.SPEAKERS,
    )?.id ?? null,
  }
}
