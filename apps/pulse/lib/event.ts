import { prisma } from './prisma'
import { CollectionPhase, QuestionType, ResponseMode, ResponseStatus, type Prisma } from '@prisma/client'
import { getResolvedEventQuestions } from './question-read'
import { getEventQuestionsForRuntime, getSurveyQuestionsForRuntime, type RuntimeQuestionAudioResult } from './question-audio'
import { validateNumericAnswer } from './mixed-survey-contract'
import { resolveSurveyLaunchReadiness } from './survey-availability'
import {
  resolveAttemptResponseMode,
  type AttendeeResponseMode,
} from './response-mode'
import { resolveEffectiveResponseTarget } from './effective-response-target'
import { resolveSessionSurveyContext, type SessionSurveyContext } from './session-survey-context'
import { filterAnswerableAttendeeQuestions } from './attendee-question-eligibility'
import { resolveAdvancedQuestionMergeFields } from './advanced-survey-default-question'

type PrismaLike = typeof prisma

export type CreateKioskLaunchResponseInput =
  | { eventId: string; token?: never; selectedResponseMode?: AttendeeResponseMode }
  | { token: string; eventId?: never; selectedResponseMode?: AttendeeResponseMode }

export interface CreateKioskLaunchResponseResult {
  mode: 'eventId' | 'token'
  event: {
    id: string
    responseMode: string
  }
  survey?: {
    id: string
    surveyTargetId: string
    responseMode: string
  }
  target?: {
    id: string
  }
  publicLink?: {
    id: string
  }
  response: {
    id: string
    eventId: string
    anonymousId: string
    surveyId?: string | null
    surveyTargetId?: string | null
    publicSurveyLinkId?: string | null
    responseMode: ResponseMode
  }
  questions: RuntimeQuestionAudioResult[]
  sessionContext?: SessionSurveyContext | null
  speakerContext?: { speaker: { id: string; name: string } } | null
}

export class ResponseCompletionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ResponseCompletionError'
  }
}

export interface PublicSurveyLaunchContext {
  publicLink: {
    id: string
    token: string
    isActive: boolean
    expiresAt: Date | null
    surveyTargetId: string | null
    speakerAssignmentId: string | null
    speakerAssignment: { id: string; eventId: string; speakerId: string; sessionId: string | null } | null
    surveyTarget: {
      id: string
      eventId: string
      name: string
      isActive: boolean
      category: string
      eventStructureItemId: string | null
      speakerId: string | null
      speaker: { id: string; name: string } | null
      eventStructureItem: {
        name: string
        kind: string
        startsAt: Date | null
        endsAt: Date | null
        timezone: string | null
      } | null
    } | null
    survey: {
      id: string
      eventId: string
      description: string | null
      surveyTargetId: string
      responseMode: string
      collectionPhase: CollectionPhase | null
      presentationMode: string
      status: string
      availabilityMode: 'OPEN_IMMEDIATELY' | 'CUSTOM_WINDOW' | 'RELATIVE_TO_EVENT_AREA'
      availabilityTimezone: string | null
      availabilityOpensAt: Date | null
      availabilityClosesAt: Date | null
      availabilityOpenAnchor: 'START' | 'END' | null
      availabilityCloseAnchor: 'START' | 'END' | null
      availabilityOpenOffsetMinutes: number | null
      availabilityCloseOffsetMinutes: number | null
      availabilityOverride: 'FORCE_OPEN' | 'FORCE_CLOSED' | null
      _count: { questions: number }
      questions: Array<{ id: string; responseTarget: string }>
      ttsProvider?: string | null
      ttsVoice?: string | null
      ttsLocale?: string | null
      surveyTarget: {
        id: string
        eventId: string
        name: string
        isActive: boolean
        category: string
        eventStructureItemId: string | null
        speakerId: string | null
        speaker: { id: string; name: string } | null
        eventStructureItem: {
          name: string
          kind: string
          startsAt: Date | null
          endsAt: Date | null
          timezone: string | null
        } | null
      }
      event: {
        id: string
        name: string
        eventType: string
        status: string
        isActive: boolean
        responseMode: string
        ttsProvider: string
        ttsVoice: string
        ttsLocale: string
        location: {
          id: string
          name: string
          timezone: string
          googleReviewUrl: string | null
          account: {
            id: string
            accountType: string
            settingsJson: Prisma.JsonValue
          }
        }
      }
    }
  }
  survey: PublicSurveyLaunchContext['publicLink']['survey']
  target: NonNullable<PublicSurveyLaunchContext['publicLink']['surveyTarget']>
  event: PublicSurveyLaunchContext['publicLink']['survey']['event']
  sessionContext: SessionSurveyContext | null
  speakerContext: { speaker: { id: string; name: string } } | null
}

/**
 * Get an event by ID
 * Requires a valid eventId — no default fallback
 */
export async function getOrCreateEvent(eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId },
    include: {
      location: { select: { account: { select: { accountType: true } } } },
    },
  })

  if (!event) {
    throw new Error(`Event with ID "${eventId}" not found. Events must be created with a Location in the new multi-tenant schema.`)
  }

  if (!event.isActive || event.status !== 'ACTIVE') {
    throw new Error('Event is not launchable')
  }

  return event
}

/**
 * Seed default questions for an event
 * 3 prompted questions + 1 freeform catchall
 * 
 * Idempotent: uses upsert by (eventId, key)
 * Updates existing questions if text/order/settings change
 * No duplicates created - key ensures uniqueness
 */
async function seedDefaultQuestions(eventId: string) {
  // Questions are resolved from the Question table with Event.questionsJson fallback.
  // This function remains a no-op for backward compatibility.
  console.log(`[Event] seedDefaultQuestions called for ${eventId} - questions are managed by Question rows with Event.questionsJson fallback`)
}

/**
 * Create a new anonymous attendee and response for a kiosk session
 */
export async function createKioskResponse(
  eventId: string,
  responseMode: AttendeeResponseMode = 'VOICE_ONLY',
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId },
    select: { location: { select: { account: { select: { accountType: true } } } } },
  })
  if (event?.location.account.accountType === 'EVENTS') {
    throw new Error('Event survey responses require a phase-tagged survey link')
  }
  // Create response with anonymous ID (no separate Attendee table in new schema)
  const response = await prisma.response.create({
    data: {
      eventId,
      responseMode,
      status: 'IN_PROGRESS',
      // anonymousId is auto-generated by default(cuid())
    },
  })

  return { response }
}

/**
 * Resolve and validate a public survey token for kiosk launch.
 *
 * Launchability rule:
 * - PublicSurveyLink must be active and unexpired.
 * - Event must be active and ACTIVE.
 * - Survey must be ACTIVE.
 * - SurveyTarget must be active and belong to the same Event as the Survey.
 */
export async function resolvePublicSurveyLaunchContext(
  tokenRaw: string,
  db: PrismaLike = prisma,
): Promise<PublicSurveyLaunchContext> {
  const token = tokenRaw?.trim()
  if (!token) {
    throw new Error('Public survey token is required')
  }

  const publicLink = await db.publicSurveyLink.findUnique({
    where: { token },
    include: {
      speakerAssignment: {
        select: { id: true, eventId: true, speakerId: true, sessionId: true },
      },
      surveyTarget: {
        include: {
          speaker: { select: { id: true, name: true } },
          eventStructureItem: {
            select: { name: true, kind: true, startsAt: true, endsAt: true, timezone: true },
          },
        },
      },
      survey: {
        include: {
          surveyTarget: {
            include: {
              speaker: { select: { id: true, name: true } },
              eventStructureItem: {
                select: {
                  name: true,
                  kind: true,
                  startsAt: true,
                  endsAt: true,
                  timezone: true,
                },
              },
            },
          },
          _count: {
            select: {
              questions: true,
            },
          },
          questions: {
            orderBy: { order: 'asc' },
            select: { id: true, responseTarget: true },
          },
          event: {
            select: {
              id: true,
              name: true,
              eventType: true,
              status: true,
              isActive: true,
              responseMode: true,
              ttsProvider: true,
              ttsVoice: true,
              ttsLocale: true,
              location: {
                select: {
                  id: true,
                  name: true,
                  timezone: true,
                  googleReviewUrl: true,
                  account: {
                    select: {
                      id: true,
                      accountType: true,
                      settingsJson: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!publicLink) {
    throw new Error('Public survey link not found')
  }

  if (!publicLink.isActive) {
    throw new Error('Public survey link is inactive')
  }

  if (publicLink.expiresAt && publicLink.expiresAt.getTime() <= Date.now()) {
    throw new Error('Public survey link has expired')
  }

  const survey = publicLink.survey
  const effectiveTarget = resolveEffectiveResponseTarget({ publicSurveyLink: publicLink, survey })
  if (!effectiveTarget) {
    throw new Error('Survey target could not be resolved')
  }
  const target = effectiveTarget.target
  const event = survey.event

  // Event lifecycle is date-derived for organizer presentation. Response
  // availability belongs to the published Survey + PublicSurveyLink window,
  // so a past Event must not close an otherwise active always-open survey.
  if (!event.isActive || event.status === 'DRAFT' || event.status === 'PAUSED' || event.status === 'ARCHIVED') {
    throw new Error('Event is not launchable')
  }

  if (survey.status !== 'ACTIVE') {
    throw new Error('Survey is not launchable')
  }

  if (!target.isActive) {
    throw new Error('Survey target is inactive')
  }

  if (target.eventId !== survey.eventId || survey.eventId !== event.id) {
    throw new Error('Survey target does not belong to the survey event')
  }

  if (target.category === 'SPEAKER') {
    if (!target.speakerId) throw new Error('Speaker survey target is missing its speaker')
    if (publicLink.speakerAssignment && (
      publicLink.speakerAssignment.eventId !== event.id
      || publicLink.speakerAssignment.speakerId !== target.speakerId
    )) {
      throw new Error('Speaker survey launch context does not match this speaker')
    }
  } else if (publicLink.speakerAssignmentId) {
    throw new Error('Only speaker surveys may include speaker session launch context')
  }

  if (event.location.account.accountType === 'EVENTS') {
    const readiness = resolveSurveyLaunchReadiness({
      survey,
      publicLink,
      targetActive: target.isActive,
      questionCount: survey._count.questions,
      eventStructureItem: target.eventStructureItem,
      locationTimezone: event.location.timezone,
    })

    if (!readiness.responseEligible) {
      if (readiness.availability.state === 'NOT_YET_OPEN') {
        throw new Error(`Survey is not launchable yet. ${readiness.availability.message}`)
      }
      if (readiness.availability.state === 'CLOSED') {
        throw new Error('Survey is not launchable because it is closed.')
      }
      if (readiness.availability.state === 'INVALID') {
        throw new Error('Survey is not launchable because its availability schedule is invalid.')
      }
      throw new Error('Survey is not launchable')
    }
  }

  const sessionContext = await resolveSessionSurveyContext({
    eventId: event.id,
    target,
    questions: survey.questions ?? [],
  }, db)
  const speakerContext = target.category === 'SPEAKER' && target.speaker
    ? { speaker: target.speaker }
    : null

  return {
    publicLink: {
      ...publicLink,
      survey: { ...survey, surveyTargetId: target.id, surveyTarget: target },
    },
    survey: { ...survey, surveyTargetId: target.id, surveyTarget: target },
    target,
    event,
    sessionContext,
    speakerContext,
  }
}

/**
 * Resolve a public kiosk launch and create an anonymous in-progress Response.
 *
 * eventId mode preserves the legacy event-level kiosk behavior.
 * token mode resolves PublicSurveyLink -> Survey -> SurveyTarget -> Event and
 * scopes the response/questions to that survey.
 */
export async function createKioskLaunchResponse(
  input: CreateKioskLaunchResponseInput,
  db: PrismaLike = prisma,
): Promise<CreateKioskLaunchResponseResult> {
  if (input.eventId) {
    const event = await getOrCreateEvent(input.eventId)
    if (event.location.account.accountType === 'EVENTS') {
      throw new Error('Event survey responses require a phase-tagged survey link')
    }
    const responseMode = resolveAttemptResponseMode(event.responseMode, input.selectedResponseMode)
    const { response } = await createKioskResponse(event.id, responseMode)
    const questions = await getEventQuestionsForRuntime(event.id)

    return {
      mode: 'eventId',
      event: {
        id: event.id,
        responseMode,
      },
      response: { ...response, responseMode },
      questions,
    }
  }

  const { publicLink, survey, target, event, sessionContext, speakerContext } = await resolvePublicSurveyLaunchContext(input.token ?? '', db)
  // Events surveys offer VOICE_AND_TEXT inside every question. Legacy/Retail
  // launches retain their existing start-of-attempt selection behavior.
  const responseMode = event.location.account.accountType === 'EVENTS' && survey.responseMode === 'VOICE_AND_TEXT'
    ? ResponseMode.VOICE_AND_TEXT
    : resolveAttemptResponseMode(survey.responseMode, input.selectedResponseMode)

  if (event.location.account.accountType === 'EVENTS' && !survey.collectionPhase) {
    throw new Error('Event survey must have a collection phase before collecting responses')
  }

  const response = await db.response.create({
    data: {
      eventId: event.id,
      surveyId: survey.id,
      surveyTargetId: target.id,
      publicSurveyLinkId: publicLink.id,
      speakerAssignmentId: publicLink.speakerAssignmentId,
      collectionPhase: survey.collectionPhase,
      responseMode,
      status: 'IN_PROGRESS',
    },
  })

  const runtimeQuestions = await getSurveyQuestionsForRuntime(
    survey.id,
    {
      survey,
      event,
      account: event.location.account,
    },
    {
      questionDb: db,
      db,
    },
  )
  const resolvedRuntimeQuestions = runtimeQuestions.map((question) => {
    // Per-speaker rating cards resolve {speaker_name} one live speaker at a
    // time. Other questions can resolve their launch entity immediately.
    const preservePerSpeakerToken = question.responseTarget === 'SPEAKERS'
    const label = preservePerSpeakerToken
      ? question.label
      : resolveAdvancedQuestionMergeFields(question.label, {
          eventName: event.name,
          sessionName: sessionContext?.session.name,
          speakerName: speakerContext?.speaker.name ?? sessionContext?.speakers.map((speaker) => speaker.name).join(' and '),
          areaName: target.category === 'LOCATION' ? target.name : null,
        })
    return label === question.label
      ? question
      : { ...question, label, ttsText: label, audioUrl: null, fallbackReason: 'runtime-merge-fields' }
  })
  // The attendee's survey is resolved against the current launch context.
  // A speaker-scoped question cannot be answered without a live speaker roster,
  // so it is not part of this response's runnable question set.
  const questions = filterAnswerableAttendeeQuestions(resolvedRuntimeQuestions, sessionContext)
  return {
    mode: 'token',
    event: {
      id: event.id,
      responseMode,
    },
    survey: {
      id: survey.id,
      surveyTargetId: target.id,
      responseMode,
    },
    target: {
      id: target.id,
    },
    publicLink: {
      id: publicLink.id,
    },
    response: { ...response, responseMode },
    questions,
    sessionContext,
    speakerContext,
  }
}

/**
 * Get enabled questions for an event (ordered)
 */
export async function getEventQuestions(eventId: string) {
  return getResolvedEventQuestions(eventId, prisma)
}

/**
 * Mark response as completed
 */
export async function completeResponse(responseId: string) {
  const current = await prisma.response.findUnique({
    where: { id: responseId },
    select: {
      id: true,
      eventId: true,
      status: true,
      completedAt: true,
      surveyId: true,
      survey: {
        select: {
          questions: {
            select: { id: true, key: true, type: true, responseTarget: true, required: true },
            orderBy: { order: 'asc' },
          },
        },
      },
      surveyTarget: {
        select: { category: true, eventStructureItemId: true },
      },
      answers: {
        select: {
          id: true,
          questionId: true,
          questionKey: true,
          numericValue: true,
          objectKey: true,
          mimeType: true,
          status: true,
        },
      },
    },
  })

  if (!current) {
    throw new ResponseCompletionError(`Response ${responseId} not found`, 404)
  }

  if (current.status === ResponseStatus.COMPLETED) {
    console.log('[Response Completed]', responseId)
    return current
  }

  if (current.status !== ResponseStatus.IN_PROGRESS) {
    throw new ResponseCompletionError(`Response ${responseId} is already finalized`, 409)
  }

  // Legacy eventId responses retain their established completion behavior.
  // Mixed surveys are token-scoped and validated against canonical Question rows.
  if (current.surveyId) {
    if (!current.survey) {
      throw new ResponseCompletionError('Response survey context could not be loaded', 400)
    }

    const sessionContext = current.surveyTarget
      ? await resolveSessionSurveyContext({
          eventId: current.eventId,
          target: current.surveyTarget,
          questions: current.survey.questions,
        }, prisma)
      : null
    const missingRequired = filterAnswerableAttendeeQuestions(current.survey.questions, sessionContext).filter((question) => {
      if (!question.required) return false
      const answers = current.answers.filter((answer) => answer.questionId === question.id)

      if (question.type === QuestionType.VOICE || question.type === QuestionType.OPEN_RESPONSE) {
        return !answers.some((answer) =>
          answer.numericValue == null
          && Boolean(answer.objectKey)
          && Boolean(answer.mimeType)
          && ['UPLOADED', 'PROCESSING_TRANSCRIPT', 'PROCESSING_ANALYSIS', 'COMPLETED'].includes(answer.status)
        )
      }

      return !answers.some((answer) => {
        if (answer.status !== 'COMPLETED' || answer.numericValue == null) return false
        try {
          validateNumericAnswer(question.type, answer.numericValue)
          return true
        } catch {
          return false
        }
      })
    })

    if (missingRequired.length > 0) {
      throw new ResponseCompletionError(
        `Required questions are incomplete: ${missingRequired.map((question) => question.key).join(', ')}`,
        409,
      )
    }
  }

  const response = await prisma.response.update({
    where: { id: responseId },
    data: {
      status: ResponseStatus.COMPLETED,
      completedAt: new Date(),
    },
  })

  console.log('[Response Completed]', responseId)

  return response
}
