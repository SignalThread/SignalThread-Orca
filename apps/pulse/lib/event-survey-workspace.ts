import {
  EventStatus,
  QuestionResponseTarget,
  QuestionType,
  ResponseMode,
  SurveyAvailabilityMode,
  SurveyTargetCategory,
  type Prisma,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveEventQuestionsFromSource } from '@/lib/question-read'
import { loadPlannerSurveyTargetIds } from '@/lib/event-survey-scope'

type EventSurveyWorkspaceDb = Pick<typeof prisma, 'event' | 'survey' | 'surveyTarget'>

const eventWorkspaceSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  eventType: true,
  isActive: true,
  startDate: true,
  endDate: true,
  responseMode: true,
  ttsProvider: true,
  ttsVoice: true,
  ttsLocale: true,
  questionsJson: true,
  questions: {
    where: { surveyId: null },
    select: {
      key: true,
      label: true,
      ttsText: true,
      order: true,
      required: true,
    },
    orderBy: { order: 'asc' as const },
  },
  _count: {
    select: {
      responses: { where: { surveyId: null } },
    },
  },
  location: {
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      account: {
        select: {
          accountType: true,
        },
      },
    },
  },
} satisfies Prisma.EventSelect

const normalizedSurveySelectWithoutResponseTarget = {
    id: true,
    eventId: true,
    surveyTargetId: true,
    name: true,
    description: true,
    collectionPhase: true,
    responseMode: true,
    status: true,
    ttsProvider: true,
    ttsVoice: true,
    ttsLocale: true,
    settingsJson: true,
    availabilityMode: true,
    availabilityTimezone: true,
    availabilityOpensAt: true,
    availabilityClosesAt: true,
    availabilityOpenAnchor: true,
    availabilityCloseAnchor: true,
    availabilityOpenOffsetMinutes: true,
    availabilityCloseOffsetMinutes: true,
    availabilityOverride: true,
    surveyTarget: {
      select: {
        id: true,
        eventId: true,
        locationId: true,
        eventStructureItemId: true,
        category: true,
        name: true,
        slug: true,
        description: true,
        metadata: true,
        isActive: true,
        eventStructureItem: {
          select: {
            startsAt: true,
            endsAt: true,
            timezone: true,
          },
        },
      },
    },
    questions: {
      orderBy: { order: 'asc' },
      select: {
        id: true,
        key: true,
        label: true,
        ttsText: true,
        order: true,
        required: true,
        type: true,
      },
    },
    publicSurveyLinks: {
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        surveyId: true,
        token: true,
        slug: true,
        isActive: true,
        expiresAt: true,
        metadata: true,
        surveyTarget: {
          select: {
            id: true,
            eventId: true,
            locationId: true,
            eventStructureItemId: true,
            category: true,
            name: true,
            slug: true,
            description: true,
            metadata: true,
            isActive: true,
            eventStructureItem: {
              select: {
                startsAt: true,
                endsAt: true,
                timezone: true,
              },
            },
          },
        },
      },
    },
    _count: {
      select: {
        responses: { where: { status: 'COMPLETED' } },
      },
    },
} satisfies Prisma.SurveySelect

const normalizedSurveySelectWithResponseTarget = {
  ...normalizedSurveySelectWithoutResponseTarget,
  questions: {
    ...normalizedSurveySelectWithoutResponseTarget.questions,
    select: {
      ...normalizedSurveySelectWithoutResponseTarget.questions.select,
      responseTarget: true,
    },
  },
} satisfies Prisma.SurveySelect

type NormalizedSurveyRow = Prisma.SurveyGetPayload<{
  select: typeof normalizedSurveySelectWithResponseTarget
}>

function isMissingQuestionResponseTargetColumn(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2022') return false
  return JSON.stringify('meta' in error ? error.meta : null).includes('responseTarget')
}

async function loadNormalizedSurveys(
  db: EventSurveyWorkspaceDb,
  eventId: string,
  plannerTargetIds: string[],
): Promise<NormalizedSurveyRow[]> {
  const where = {
    eventId,
    OR: [
      { surveyTargetId: null },
      { surveyTargetId: { in: plannerTargetIds } },
      // Survey.surveyTargetId is a legacy authoring pointer. A reusable
      // definition can have its current deployment on another target, which
      // is represented exclusively by a target-scoped public link.
      { publicSurveyLinks: { some: { surveyTargetId: { in: plannerTargetIds } } } },
    ],
  } satisfies Prisma.SurveyWhereInput
  try {
    const surveys = await db.survey.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: normalizedSurveySelectWithResponseTarget,
    })
    return surveys
  } catch (error) {
    // During a rolling schema deployment, older databases may not yet have the
    // structured presenter-rating column. Existing rows predate that feature,
    // so their deterministic compatibility value is GENERAL.
    if (!isMissingQuestionResponseTargetColumn(error)) throw error
    const surveys = await db.survey.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: normalizedSurveySelectWithoutResponseTarget,
    })
    return surveys.map((survey) => ({
      ...survey,
      questions: Array.isArray(survey.questions)
        ? survey.questions.map((question) => ({
            ...question,
            responseTarget: QuestionResponseTarget.GENERAL,
          }))
        : [],
    } as NormalizedSurveyRow))
  }
}

function buildLegacySurvey(event: Prisma.EventGetPayload<{ select: typeof eventWorkspaceSelect }>) {
  const questions = resolveEventQuestionsFromSource(event)
  if (questions.length === 0) return null

  const compatibilityId = `legacy-event:${event.id}`
  const target = {
    id: `${compatibilityId}:target`,
    eventId: event.id,
    locationId: null,
    eventStructureItemId: null,
    category: SurveyTargetCategory.EVENT,
    name: 'Overall Event',
    slug: `legacy-event-${event.id}`,
    description: event.description,
    metadata: null,
    isActive: event.isActive,
    eventStructureItem: null,
  }
  const publicLink = {
    id: `${compatibilityId}:link`,
    surveyId: compatibilityId,
    surveyTargetId: target.id,
    token: '',
    slug: null,
    isActive: event.isActive && event.status === EventStatus.ACTIVE,
    expiresAt: null,
    metadata: null,
    surveyTarget: target,
    kioskPath: `/kiosk?eventId=${encodeURIComponent(event.id)}`,
  }

  return {
    id: compatibilityId,
    eventId: event.id,
    surveyTargetId: target.id,
    name: event.name,
    description: event.description,
    responseMode: event.responseMode ?? ResponseMode.VOICE_ONLY,
    status: event.status,
    ttsProvider: event.ttsProvider,
    ttsVoice: event.ttsVoice,
    ttsLocale: event.ttsLocale,
    settingsJson: null,
    availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY,
    availabilityTimezone: null,
    availabilityOpensAt: null,
    availabilityClosesAt: null,
    availabilityOpenAnchor: null,
    availabilityCloseAnchor: null,
    availabilityOpenOffsetMinutes: null,
    availabilityCloseOffsetMinutes: null,
    availabilityOverride: null,
    collectionPhase: null,
    surveyTarget: target,
    questions: questions.map((question) => ({
      id: `${compatibilityId}:question:${question.key}`,
      ...question,
      type: QuestionType.VOICE,
      responseTarget: QuestionResponseTarget.GENERAL,
    })),
    publicSurveyLinks: [publicLink],
    _count: { responses: event._count.responses },
  }
}

/**
 * Canonical read boundary for the Event workspace survey package.
 *
 * Precedence is intentionally based on whether any normalized Survey exists,
 * not on whether one happens to be planner-visible:
 * 1. Any normalized Survey rows -> normalized data is authoritative.
 * 2. No Survey rows + valid Event-level questions -> read-only legacy adapter.
 * 3. Neither -> an empty workspace package.
 *
 * This function performs reads only. It never migrates or synchronizes legacy
 * Event data into Survey, SurveyTarget, PublicSurveyLink, or Question rows.
 */
export async function loadEventSurveyWorkspacePackage(
  eventId: string,
  accountId: string,
  db: EventSurveyWorkspaceDb = prisma,
) {
  const event = await db.event.findFirst({
    where: {
      id: eventId,
      location: { accountId },
    },
    select: eventWorkspaceSelect,
  })
  if (!event) return null

  const normalizedSurvey = await db.survey.findFirst({
    where: { eventId: event.id },
    select: { id: true },
  })

  if (normalizedSurvey) {
    const plannerTargetIds = await loadPlannerSurveyTargetIds(db, event.id)
    const surveys = await loadNormalizedSurveys(db, event.id, plannerTargetIds)
    return { ...event, surveys, surveySource: 'NORMALIZED' as const }
  }

  const legacySurvey = buildLegacySurvey(event)
  return {
    ...event,
    surveys: legacySurvey ? [legacySurvey] : [],
    surveySource: legacySurvey ? 'LEGACY_EVENT' as const : 'EMPTY' as const,
  }
}
