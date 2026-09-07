import {
  CollectionPhase,
  EventStatus,
  EventType,
  QuestionResponseTarget,
  QuestionType,
  ResponseMode,
  SurveyAvailabilityMode,
  SurveyPresentationMode,
  SurveyTargetCategory,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createUniquePublicSurveyToken } from '@/lib/event-voice-surveys'
import { normalizeSurveyAvailabilityInput, type SurveyAvailabilityInput } from '@/lib/survey-availability'
import {
  advancedQuestionConfiguration,
  reconcileMalformedAdvancedQuestionTypes,
} from '@/lib/advanced-question-content'
import { surveyHasResponses } from '@/lib/survey-response-history'
import { getAdvancedSurveyAssignmentHistory } from '@/lib/advanced-survey-assignment-lifecycle'
import { advancedSurveyQuestionValidationIssues } from '@/lib/advanced-survey-question-validation'
import { surveyAssignmentMetadata, surveyAssignmentState, type SurveyAssignmentRule } from '@/lib/survey-target-assignment'
import { isPlannerManagedSurveyTarget } from '@/lib/event-survey-scope'
import { ensureSurveyQuestionAudioForSurvey } from '@/lib/question-audio'
import { deriveLocaleFromVoice } from '@/lib/tts-voices'
import {
  defaultNewEventSurveyExperience,
  presentationModeForResponseMode,
  withAdvancedSurveyExperiencePreset,
  type AdvancedSurveyExperiencePreset,
  type AdvancedSurveyResponseMode,
} from '@/lib/advanced-survey-experience'
import {
  withAdvancedSpeakerFeedbackMode,
  withAdvancedSurveyContext,
  type AdvancedSpeakerFeedbackMode,
  type AdvancedSurveyContext,
} from '@/lib/advanced-survey-default-question'

type AdvancedBuilderDb = Pick<PrismaClient, 'event' | 'survey' | 'response'>
  & Partial<Pick<PrismaClient, 'question' | 'surveyTarget' | 'publicSurveyLink'>>

export type AdvancedAssignmentKind = 'EVENT' | 'SESSION' | 'SPEAKER' | 'LOCATION' | 'CUSTOM'
export type AdvancedAssignmentSelection = 'ALL' | 'SELECTED'

export interface AdvancedSurveyAssignmentSpec {
  kind: AdvancedAssignmentKind
  selection: AdvancedAssignmentSelection
  targetIds?: string[]
  customKey?: string
  customName?: string
}

export interface AdvancedSurveyAssignmentWarning {
  code: 'SPEAKER_QUESTIONS_HIDDEN'
  targetNames: string[]
  questionLabels: string[]
  message: string
}

export class AdvancedEventSurveyBuilderError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'AdvancedEventSurveyBuilderError'
    this.status = status
  }
}

/** The shared Event survey builder supports Advanced targeting and Simple event-wide surveys. */
export function isSharedEventSurveyBuilderEvent(eventType: EventType): boolean {
  return eventType === EventType.ADVANCED || eventType === EventType.BLANK
}

export interface SaveAdvancedEventSurveyDraftInput {
  accountId: string
  eventId: string
  surveyId?: string | null
  creationRequestId: string
  name?: string | null
  description?: string | null
  collectionPhase?: CollectionPhase | string | null
  presentationMode?: SurveyPresentationMode | string
  responseMode?: ResponseMode | string
  experiencePreset?: AdvancedSurveyExperiencePreset
  surveyContext?: AdvancedSurveyContext
  speakerFeedbackMode?: AdvancedSpeakerFeedbackMode
  ttsVoice?: string | null
  availability?: SurveyAvailabilityInput | null
  questions?: Array<{
    id: string
    text: string
    type: QuestionType | string
    required?: boolean
    options?: string[]
  }>
}

function withAdvancedSurveyBuilderSettings(
  settingsJson: unknown,
  input: Pick<SaveAdvancedEventSurveyDraftInput, 'experiencePreset' | 'surveyContext' | 'speakerFeedbackMode'>,
): Record<string, unknown> {
  let settings = settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
    ? settingsJson as Record<string, unknown>
    : {}
  if (input.experiencePreset) settings = withAdvancedSurveyExperiencePreset(settings, input.experiencePreset)
  if (input.surveyContext) settings = withAdvancedSurveyContext(settings, input.surveyContext)
  if (input.speakerFeedbackMode) settings = withAdvancedSpeakerFeedbackMode(settings, input.speakerFeedbackMode)
  return settings
}

const advancedDraftSelect = {
  id: true,
  eventId: true,
  surveyTargetId: true,
  creationRequestId: true,
  name: true,
  description: true,
  collectionPhase: true,
  responseMode: true,
  presentationMode: true,
  status: true,
  settingsJson: true,
  ttsProvider: true,
  ttsVoice: true,
  ttsLocale: true,
  availabilityMode: true,
  availabilityTimezone: true,
  availabilityOpensAt: true,
  availabilityClosesAt: true,
  availabilityOpenAnchor: true,
  availabilityCloseAnchor: true,
  availabilityOpenOffsetMinutes: true,
  availabilityCloseOffsetMinutes: true,
  createdAt: true,
  updatedAt: true,
  surveyTarget: {
    select: {
      id: true,
      category: true,
      name: true,
      eventStructureItemId: true,
      speakerId: true,
      metadata: true,
      eventStructureItem: {
        select: {
          id: true,
          name: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          speakerAssignments: {
            orderBy: { sortOrder: 'asc' as const },
            select: { speaker: { select: { id: true, name: true, title: true, organization: true, isArchived: true } } },
          },
        },
      },
    },
  },
  questions: {
    orderBy: { order: 'asc' as const },
    select: {
      id: true,
      key: true,
      label: true,
      type: true,
      order: true,
      required: true,
      responseTarget: true,
      configurationJson: true,
    },
  },
  publicSurveyLinks: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      surveyTargetId: true,
      isActive: true,
      metadata: true,
      surveyTarget: {
        select: {
          id: true,
          category: true,
          name: true,
          eventStructureItemId: true,
          speakerId: true,
          metadata: true,
          eventStructureItem: {
            select: {
              id: true,
              name: true,
              startsAt: true,
              endsAt: true,
              timezone: true,
              speakerAssignments: {
                orderBy: { sortOrder: 'asc' as const },
                select: { speaker: { select: { id: true, name: true, title: true, organization: true, isArchived: true } } },
              },
            },
          },
        },
      },
    },
  },
  _count: { select: { responses: true } },
} satisfies Prisma.SurveySelect

type AdvancedDraftSnapshot = Prisma.SurveyGetPayload<{ select: typeof advancedDraftSelect }>

function singleChoiceOptions(configuration: Prisma.JsonValue | null): string[] {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return []
  const options = (configuration as { options?: unknown }).options
  return Array.isArray(options) ? options.filter((option): option is string => typeof option === 'string' && Boolean(option.trim())) : []
}

function currentAdvancedSurveyTargets(survey: AdvancedDraftSnapshot) {
  const linkTargets = survey.publicSurveyLinks
    .filter((link) => surveyAssignmentState(link) !== 'SUPERSEDED')
    .flatMap((link) => link.surveyTarget ? [link.surveyTarget] : [])
  const targets = linkTargets.length > 0
    ? linkTargets
    : survey.surveyTarget
      ? [survey.surveyTarget]
      : []
  return targets.filter((target, index, all) => all.findIndex((candidate) => candidate.id === target.id) === index)
}

/**
 * Canonical publish/readiness rule for Advanced surveys.
 *
 * The server evaluates the complete current deployment set. Speaker feedback
 * is publishable only when every public assignment is a concrete session with
 * at least one live speaker, so no token can silently lose its speaker context.
 */
export function reviewAdvancedSurveyReadiness(survey: AdvancedDraftSnapshot): string[] {
  const issues: string[] = []
  if (!survey.collectionPhase) issues.push('Choose when this survey will be collected.')
  if (!survey.name.trim() || survey.name === 'Untitled survey') issues.push('Add a survey name.')
  if (survey.questions.length === 0) issues.push('Add at least one question.')
  survey.questions.forEach((question, index) => {
    issues.push(...advancedSurveyQuestionValidationIssues({
      text: question.label,
      type: question.type,
      options: singleChoiceOptions(question.configurationJson),
    }, index).map((issue) => issue.message))
  })
  const targets = currentAdvancedSurveyTargets(survey)
  const sessionTargets = targets.filter((target) => target.category === SurveyTargetCategory.SESSION && target.eventStructureItemId)
  if (survey.questions.some((question) => question.type === QuestionType.SPEAKER_FEEDBACK)) {
    if (targets.length === 0 || sessionTargets.length !== targets.length) {
      issues.push('Assign speaker feedback only to specific sessions before publishing.')
    }
    const speakerlessSessions = sessionTargets.filter((target) => (
      !(target.eventStructureItem?.speakerAssignments ?? []).some((assignment) => (
        !assignment.speaker.isArchived && assignment.speaker.name.trim().length > 0
      ))
    ))
    if (speakerlessSessions.length > 0) {
      issues.push(`Add a speaker to ${speakerlessSessions.map((target) => target.eventStructureItem?.name || target.name).join(', ')} before publishing speaker feedback.`)
    }
  }
  if (survey.availabilityMode === SurveyAvailabilityMode.RELATIVE_TO_EVENT_AREA) {
    if (targets.length === 0 || sessionTargets.length !== targets.length) issues.push('Assign only specific sessions for session-relative availability.')
    const unscheduledSessions = sessionTargets.filter((target) => !target.eventStructureItem?.startsAt || !target.eventStructureItem.endsAt)
    if (unscheduledSessions.length > 0) issues.push(`Add start and end times to ${unscheduledSessions.map((target) => target.eventStructureItem?.name || target.name).join(', ')}.`)
  }
  if (survey.availabilityMode === SurveyAvailabilityMode.CUSTOM_WINDOW) {
    if (!survey.availabilityOpensAt || !survey.availabilityClosesAt) issues.push('Choose both dates and times for the fixed availability window.')
    else if (survey.availabilityOpensAt >= survey.availabilityClosesAt) issues.push('Set the fixed window end after its start.')
  }
  return [...new Set(issues)]
}

function withAdvancedReview(survey: AdvancedDraftSnapshot) {
  return { ...survey, review: { ready: reviewAdvancedSurveyReadiness(survey).length === 0, issues: reviewAdvancedSurveyReadiness(survey) } }
}

/** Loads one canonical Advanced Event survey into the shared builder. */
export async function loadAdvancedEventSurvey(
  input: { accountId: string; eventId: string; surveyId: string },
  db: AdvancedBuilderDb = prisma,
) {
  const event = await db.event.findFirst({
    where: { id: input.eventId, eventType: { in: [EventType.ADVANCED, EventType.BLANK] }, location: { accountId: input.accountId } },
    select: { id: true },
  })
  if (!event) throw new AdvancedEventSurveyBuilderError('Event not found or access denied', 404)
  if (db.question) {
    await reconcileMalformedAdvancedQuestionTypes(
      { surveyId: input.surveyId.trim(), eventId: event.id },
      db as Pick<PrismaClient, 'question'>,
    )
  }
  const survey = await db.survey.findFirst({
    where: { id: input.surveyId.trim(), eventId: event.id, status: { not: EventStatus.ARCHIVED } },
    select: advancedDraftSelect,
  })
  if (!survey) throw new AdvancedEventSurveyBuilderError('Survey not found in this event', 404)
  return withAdvancedReview(survey)
}

function cleanDraftName(value: string | null | undefined) {
  return value?.trim() || 'Untitled survey'
}

function cleanOptionalText(value: string | null | undefined) {
  return value?.trim() || null
}

const ADVANCED_CONTENT_TYPES = new Set<QuestionType>([
  QuestionType.OPEN_RESPONSE,
  QuestionType.RATING_1_TO_5,
  QuestionType.RECOMMENDATION_0_TO_10,
  QuestionType.YES_NO,
  QuestionType.SINGLE_CHOICE,
  QuestionType.SPEAKER_FEEDBACK,
])

function normalizeDraftQuestions(
  questions: NonNullable<SaveAdvancedEventSurveyDraftInput['questions']>,
  creationRequestId: string,
  speakerFeedbackMode: AdvancedSpeakerFeedbackMode = 'EACH_SPEAKER',
) {
  return questions.map((question, order) => {
    const label = question.text.trim() || 'Untitled question'
    if (!ADVANCED_CONTENT_TYPES.has(question.type as QuestionType)) {
      throw new AdvancedEventSurveyBuilderError(`Question ${order + 1} has an unsupported Advanced content type`)
    }
    const type = question.type as QuestionType
    const options = type === QuestionType.SINGLE_CHOICE
      ? [...new Set((question.options ?? []).map((option) => option.trim()).filter(Boolean))]
      : []
    if (options.length > 12) {
      throw new AdvancedEventSurveyBuilderError(`Question ${order + 1} supports at most 12 choices`)
    }
    const stableId = question.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `q${order + 1}`
    return {
      key: `advanced-${creationRequestId}-${stableId}`,
      label,
      type,
      responseTarget: type === QuestionType.SPEAKER_FEEDBACK && speakerFeedbackMode === 'EACH_SPEAKER'
        ? QuestionResponseTarget.SPEAKERS
        : QuestionResponseTarget.GENERAL,
      configurationJson: advancedQuestionConfiguration(type, options),
      order,
      required: question.required ?? true,
    }
  })
}

/**
 * Canonical mutation for the Advanced Event builder's unassigned draft state.
 * It writes Survey directly, never fabricates a SurveyTarget or public link,
 * and is retry-safe through Survey.creationRequestId.
 */
export async function saveAdvancedEventSurveyDraft(
  input: SaveAdvancedEventSurveyDraftInput,
  db: AdvancedBuilderDb = prisma,
  ensureQuestionAudio: typeof ensureSurveyQuestionAudioForSurvey = ensureSurveyQuestionAudioForSurvey,
) {
  const event = await db.event.findFirst({
    where: {
      id: input.eventId,
      location: { accountId: input.accountId },
    },
    select: {
      id: true,
      name: true,
      eventType: true,
      ttsProvider: true,
      ttsVoice: true,
      ttsLocale: true,
      location: { select: { id: true, timezone: true } },
    },
  })

  if (!event) {
    throw new AdvancedEventSurveyBuilderError('Event not found or access denied', 404)
  }
  if (!isSharedEventSurveyBuilderEvent(event.eventType)) {
    throw new AdvancedEventSurveyBuilderError('The shared survey builder is only available for Advanced or Simple Events', 409)
  }

  const requestedResponseMode = input.responseMode && Object.values(ResponseMode).includes(input.responseMode as ResponseMode)
    ? input.responseMode as ResponseMode
    : null
  const collectionPhase = input.collectionPhase && Object.values(CollectionPhase).includes(input.collectionPhase as CollectionPhase)
    ? input.collectionPhase as CollectionPhase
    : null
  if (!input.surveyId && !collectionPhase) {
    throw new AdvancedEventSurveyBuilderError('Choose when this survey will be collected')
  }
  const derivedPresentationMode = requestedResponseMode
    ? presentationModeForResponseMode(requestedResponseMode as AdvancedSurveyResponseMode) as SurveyPresentationMode
    : null
  const data = {
    name: cleanDraftName(input.name),
    ...(collectionPhase ? { collectionPhase } : {}),
    ...(input.description !== undefined ? { description: cleanOptionalText(input.description) } : {}),
    ...(derivedPresentationMode
      ? { presentationMode: derivedPresentationMode }
      : input.presentationMode && Object.values(SurveyPresentationMode).includes(input.presentationMode as SurveyPresentationMode)
      ? { presentationMode: input.presentationMode as SurveyPresentationMode }
      : {}),
    ...(requestedResponseMode
      ? { responseMode: requestedResponseMode }
      : {}),
    ...(input.ttsVoice !== undefined
      ? {
          ttsVoice: cleanOptionalText(input.ttsVoice),
          ttsLocale: input.ttsVoice ? deriveLocaleFromVoice(input.ttsVoice) : null,
        }
      : {}),
    ...(input.availability
      ? normalizeSurveyAvailabilityInput({ ...input.availability, timezone: event.location.timezone })
      : {}),
  }

  if (input.surveyId) {
    const existing = await db.survey.findFirst({
      where: { id: input.surveyId, eventId: event.id },
      select: {
        id: true,
        status: true,
        presentationMode: true,
        settingsJson: true,
        ttsVoice: true,
        surveyTarget: { select: { category: true, eventStructureItemId: true } },
        publicSurveyLinks: { select: { surveyTarget: { select: { category: true, eventStructureItemId: true } } } },
        questions: {
          orderBy: { order: 'asc' },
          select: {
            key: true,
            label: true,
            type: true,
            responseTarget: true,
            configurationJson: true,
            order: true,
            required: true,
          },
        },
      },
    })
    if (!existing) {
      throw new AdvancedEventSurveyBuilderError('Survey draft not found in this event', 404)
    }
    const hasSessionContext = (existing.surveyTarget?.category === SurveyTargetCategory.SESSION && Boolean(existing.surveyTarget.eventStructureItemId))
      || existing.publicSurveyLinks.some((link) => link.surveyTarget?.category === SurveyTargetCategory.SESSION && Boolean(link.surveyTarget.eventStructureItemId))
    const normalizedQuestions = input.questions
      ? normalizeDraftQuestions(input.questions, input.creationRequestId, input.speakerFeedbackMode)
      : undefined
    const existingQuestions = existing.questions ?? []
    const questionsChanged = Boolean(normalizedQuestions && (
      normalizedQuestions.length !== existingQuestions.length
      || normalizedQuestions.some((question, index) => {
        const prior = existingQuestions[index]
        return !prior
          || question.label !== prior.label
          || question.type !== prior.type
          || question.responseTarget !== prior.responseTarget
          || question.order !== prior.order
          || question.required !== prior.required
          || JSON.stringify(question.configurationJson) !== JSON.stringify(prior.configurationJson)
      })
    ))
    const hasResponses = await surveyHasResponses(db, existing.id)
    if (hasResponses && questionsChanged) {
      throw new AdvancedEventSurveyBuilderError(
        'Questions are locked because this survey has responses. Survey details and voice settings can still be updated.',
        409,
      )
    }
    const voiceChanged = input.ttsVoice !== undefined && cleanOptionalText(input.ttsVoice) !== existing.ttsVoice
    const presentationMode = (data.presentationMode ?? existing.presentationMode) as SurveyPresentationMode
    const presentationBecameSpoken = existing.presentationMode === SurveyPresentationMode.SCREEN
      && presentationMode !== SurveyPresentationMode.SCREEN
    const shouldEnsureQuestionAudio = presentationMode !== SurveyPresentationMode.SCREEN
      && (questionsChanged || voiceChanged || presentationBecameSpoken)
    if (input.availability?.mode === 'RELATIVE_TO_EVENT_AREA' && !hasSessionContext) {
      throw new AdvancedEventSurveyBuilderError('Session-relative availability requires a session assignment')
    }

    const survey = await db.survey.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(input.experiencePreset || input.surveyContext || input.speakerFeedbackMode
          ? { settingsJson: withAdvancedSurveyBuilderSettings(existing.settingsJson, input) as Prisma.InputJsonValue }
          : {}),
        ...(normalizedQuestions && questionsChanged
          ? { questions: { deleteMany: {}, create: normalizedQuestions.map((question) => ({ ...question, eventId: event.id })) } }
          : {}),
      },
      select: advancedDraftSelect,
    })
    const deployedSurvey = event.eventType === EventType.BLANK
      ? await ensureSimpleEventWideSurveyDeployment(event, survey.id, db)
      : survey
    if (shouldEnsureQuestionAudio) {
      try {
        await ensureQuestionAudio(deployedSurvey.id, {
          provider: deployedSurvey.ttsProvider ?? undefined,
          voice: deployedSurvey.ttsVoice ?? undefined,
          locale: deployedSurvey.ttsLocale ?? undefined,
        })
      } catch (error) {
        console.error('[saveAdvancedEventSurveyDraft] question audio deferred', {
          surveyId: deployedSurvey.id,
          error: error instanceof Error ? error.message : 'unknown',
        })
      }
    }
    return withAdvancedReview(deployedSurvey)
  }

  const normalizedQuestions = input.questions
    ? normalizeDraftQuestions(input.questions, input.creationRequestId, input.speakerFeedbackMode)
    : []
  if (input.availability?.mode === 'RELATIVE_TO_EVENT_AREA') {
    throw new AdvancedEventSurveyBuilderError('Session-relative availability requires a session assignment')
  }

  const survey = await db.survey.upsert({
    where: {
      eventId_creationRequestId: {
        eventId: event.id,
        creationRequestId: input.creationRequestId,
      },
    },
    create: {
      eventId: event.id,
      surveyTargetId: null,
      creationRequestId: input.creationRequestId,
      // Every new Event survey starts voice-first. Explicit input still wins
      // through `data`, and retry updates retain persisted values.
      responseMode: defaultNewEventSurveyExperience.responseMode as ResponseMode,
      presentationMode: defaultNewEventSurveyExperience.presentationMode as SurveyPresentationMode,
      status: EventStatus.DRAFT,
      ttsProvider: event.ttsProvider,
      ttsVoice: event.ttsVoice,
      ttsLocale: event.ttsLocale,
      ...(input.experiencePreset || input.surveyContext || input.speakerFeedbackMode
        ? { settingsJson: withAdvancedSurveyBuilderSettings(null, input) as Prisma.InputJsonValue }
        : {}),
      ...data,
      questions: { create: normalizedQuestions.map((question) => ({ ...question, eventId: event.id })) },
    },
    update: {
      ...data,
      ...(input.questions
        ? { questions: { deleteMany: {}, create: normalizedQuestions.map((question) => ({ ...question, eventId: event.id })) } }
        : {}),
    },
    select: advancedDraftSelect,
  })
  const surveyWithExperiencePreset = input.experiencePreset || input.surveyContext
    ? await db.survey.update({
        where: { id: survey.id },
        data: { settingsJson: withAdvancedSurveyBuilderSettings(survey.settingsJson, input) as Prisma.InputJsonValue },
        select: advancedDraftSelect,
      })
    : survey
  const deployedSurvey = event.eventType === EventType.BLANK
    ? await ensureSimpleEventWideSurveyDeployment(event, surveyWithExperiencePreset.id, db)
    : surveyWithExperiencePreset
  if (deployedSurvey.presentationMode !== SurveyPresentationMode.SCREEN && input.questions?.length) {
    try {
      await ensureQuestionAudio(deployedSurvey.id, {
        provider: deployedSurvey.ttsProvider ?? undefined,
        voice: deployedSurvey.ttsVoice ?? undefined,
        locale: deployedSurvey.ttsLocale ?? undefined,
      })
    } catch (error) {
      console.error('[saveAdvancedEventSurveyDraft] question audio deferred', {
        surveyId: deployedSurvey.id,
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  }
  return withAdvancedReview(deployedSurvey)
}

/**
 * Simple Events always deploy event-wide. Keep that invariant beside the
 * shared builder persistence path so a template, scratch survey, and later
 * autosave all use the same SurveyTarget/PublicSurveyLink architecture.
 */
async function ensureSimpleEventWideSurveyDeployment(
  event: { id: string; name: string; location: { id: string; timezone: string | null } },
  surveyId: string,
  db: AdvancedBuilderDb,
) {
  if (!db.surveyTarget || !db.publicSurveyLink) {
    throw new AdvancedEventSurveyBuilderError('Simple Event deployment is unavailable', 500)
  }
  const target = await db.surveyTarget.findFirst({
    where: { eventId: event.id, category: SurveyTargetCategory.EVENT, eventStructureItemId: null, speakerId: null },
    select: { id: true },
  }) ?? await db.surveyTarget.create({
    data: {
      eventId: event.id,
      locationId: event.location.id,
      category: SurveyTargetCategory.EVENT,
      name: event.name,
      slug: 'simple-event-wide',
      isActive: true,
    },
    select: { id: true },
  })
  await db.survey.update({ where: { id: surveyId }, data: { surveyTargetId: target.id } })
  const link = await db.publicSurveyLink.findFirst({ where: { surveyId, surveyTargetId: target.id }, select: { id: true } })
  if (!link) {
    await db.publicSurveyLink.create({
      data: { surveyId, surveyTargetId: target.id, token: await createUniquePublicSurveyToken({ publicSurveyLink: db.publicSurveyLink }), isActive: false },
    })
  }
  const deployedSurvey = await db.survey.findUnique({ where: { id: surveyId }, select: advancedDraftSelect })
  if (!deployedSurvey) throw new AdvancedEventSurveyBuilderError('Survey draft not found in this event', 404)
  return deployedSurvey
}

function assignmentSlugPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'assignment'
}

function speakerQuestionExclusionWarning(
  questions: Array<{ label: string; type: QuestionType }> | undefined,
  targetNames: string[],
): AdvancedSurveyAssignmentWarning | null {
  const speakerQuestions = (questions ?? []).filter((question) => question.type === QuestionType.SPEAKER_FEEDBACK)
  if (speakerQuestions.length === 0 || targetNames.length === 0) return null

  const questionCount = speakerQuestions.length
  const targetLabel = targetNames.length === 1
    ? targetNames[0]
    : `${targetNames.slice(0, -1).join(', ')} and ${targetNames.at(-1)}`
  const targetVerb = targetNames.length === 1 ? 'has' : 'have'
  const questionSubject = questionCount === 1 ? 'that question' : 'those questions'

  return {
    code: 'SPEAKER_QUESTIONS_HIDDEN',
    targetNames,
    questionLabels: speakerQuestions.map((question) => question.label),
    message: `This survey has ${questionCount} speaker question${questionCount === 1 ? '' : 's'}. ${targetLabel} ${targetVerb} no speakers — ${questionSubject} won't be shown to attendees.`,
  }
}

/** Reconciles the explicit assignment set for one Advanced Event survey. */
export async function reconcileAdvancedSurveyAssignments(
  input: { accountId: string; eventId: string; surveyId: string; assignments: AdvancedSurveyAssignmentSpec[] },
  db: PrismaClient = prisma,
) {
  const event = await db.event.findFirst({
    where: { id: input.eventId, location: { accountId: input.accountId } },
    select: { id: true, name: true, locationId: true, eventType: true },
  })
  if (!event) throw new AdvancedEventSurveyBuilderError('Event not found or access denied', 404)
  if (event.eventType !== EventType.ADVANCED) throw new AdvancedEventSurveyBuilderError('Assignments are only available in the Advanced Event builder', 409)

  const duplicateKind = input.assignments.find((spec, index) => input.assignments.findIndex((candidate) => candidate.kind === spec.kind) !== index)
  if (duplicateKind) throw new AdvancedEventSurveyBuilderError(`Only one ${duplicateKind.kind.toLowerCase()} assignment rule is allowed`)

  return db.$transaction(async (tx) => {
    const survey = await tx.survey.findFirst({
      where: { id: input.surveyId, eventId: event.id },
      select: {
        id: true,
        status: true,
        availabilityMode: true,
        questions: { select: { label: true, type: true } },
      },
    })
    if (!survey) throw new AdvancedEventSurveyBuilderError('Survey draft not found in this event', 404)
    const assignmentHistory = await getAdvancedSurveyAssignmentHistory({ eventType: event.eventType, surveyId: survey.id }, tx)

    const desiredTargets: Array<{ id: string; category: SurveyTargetCategory; assignmentRule: SurveyAssignmentRule }> = []
    const addDesiredTarget = (
      target: { id: string; category: SurveyTargetCategory },
      assignmentRule: SurveyAssignmentRule,
    ) => desiredTargets.push({ id: target.id, category: target.category, assignmentRule })
    const speakerlessSessionNames: string[] = []
    for (let spec of input.assignments) {
      if (spec.kind === 'EVENT') {
        const existing = await tx.surveyTarget.findFirst({ where: { eventId: event.id, category: SurveyTargetCategory.EVENT, eventStructureItemId: null, speakerId: null } })
        addDesiredTarget(
          existing ?? await tx.surveyTarget.create({ data: { eventId: event.id, locationId: event.locationId, category: SurveyTargetCategory.EVENT, name: event.name, slug: 'advanced-event-wide', isActive: true } }),
          { kind: 'EVENT', selection: 'SELECTED' },
        )
        continue
      }

      if (spec.selection === 'ALL') {
        if (spec.kind === 'CUSTOM') throw new AdvancedEventSurveyBuilderError('Custom assignments must be explicit')
        // "All" is a bulk operation over canonical targets, not a synthetic
        // target. Each resolved row therefore receives its own public link and
        // launch context while the link metadata remembers the ALL rule.
        if (spec.kind === 'SESSION' || spec.kind === 'LOCATION') {
          const allowedKinds = spec.kind === 'SESSION' ? ['SESSION'] : ['EVENT', 'AREA', 'SPONSOR_ACTIVATION', 'CUSTOM_TOUCHPOINT']
          spec = {
            ...spec,
            targetIds: (await tx.eventStructureItem.findMany({
              where: { eventId: event.id, isActive: true, kind: { in: allowedKinds as never } },
              select: { id: true },
            })).map((item) => item.id),
          }
        } else if (spec.kind === 'SPEAKER') {
          spec = {
            ...spec,
            targetIds: (await tx.eventSpeakerProfile.findMany({
              where: { accountId: input.accountId, isArchived: false, sessionAssignments: { some: { eventId: event.id } } },
              select: { id: true },
            })).map((speaker) => speaker.id),
          }
        }
      }

      if (spec.kind === 'SESSION' || spec.kind === 'LOCATION') {
        const targetIds = [...new Set(spec.targetIds ?? [])]
        const allowedKinds = spec.kind === 'SESSION'
          ? ['SESSION']
          : ['EVENT', 'AREA', 'SPONSOR_ACTIVATION', 'CUSTOM_TOUCHPOINT']
        const items = await tx.eventStructureItem.findMany({
          where: { id: { in: targetIds }, eventId: event.id, isActive: true, kind: { in: allowedKinds as never } },
          select: {
            id: true,
            kind: true,
            name: true,
            slug: true,
            locationId: true,
            speakerAssignments: {
              select: { speaker: { select: { name: true, isArchived: true } } },
            },
          },
        })
        if (items.length !== targetIds.length) throw new AdvancedEventSurveyBuilderError(`One or more selected ${spec.kind.toLowerCase()} targets are invalid`)
        for (const item of items) {
          const category = spec.kind === 'SESSION'
            ? SurveyTargetCategory.SESSION
            : item.kind === 'EVENT'
              ? SurveyTargetCategory.EVENT
              : item.kind === 'CUSTOM_TOUCHPOINT'
                ? SurveyTargetCategory.CUSTOM
                : SurveyTargetCategory.LOCATION
          const existing = (await tx.surveyTarget.findMany({
            where: { eventId: event.id, eventStructureItemId: item.id, category },
            orderBy: { createdAt: 'asc' },
          })).find(isPlannerManagedSurveyTarget)
          addDesiredTarget(
            existing
              ? (existing.isActive ? existing : await tx.surveyTarget.update({ where: { id: existing.id }, data: { isActive: true } }))
              : await tx.surveyTarget.create({ data: { eventId: event.id, locationId: item.locationId, eventStructureItemId: item.id, category, name: item.name, slug: `advanced-${spec.kind.toLowerCase()}-${item.id}`, isActive: true } }),
            { kind: spec.kind, selection: spec.selection },
          )
          if (spec.kind === 'SESSION' && !(item.speakerAssignments ?? []).some((assignment) => !assignment.speaker.isArchived && assignment.speaker.name.trim().length > 0)) {
            speakerlessSessionNames.push(item.name)
          }
        }
        continue
      }

      if (spec.kind === 'SPEAKER') {
        const targetIds = [...new Set(spec.targetIds ?? [])]
        const speakers = await tx.eventSpeakerProfile.findMany({
          where: { id: { in: targetIds }, accountId: input.accountId, isArchived: false, sessionAssignments: { some: { eventId: event.id } } },
          select: { id: true, name: true },
        })
        if (speakers.length !== targetIds.length) throw new AdvancedEventSurveyBuilderError('One or more selected speakers are invalid')
        for (const speaker of speakers) {
          const existing = (await tx.surveyTarget.findMany({
            where: { eventId: event.id, category: SurveyTargetCategory.SPEAKER, speakerId: speaker.id },
            orderBy: { createdAt: 'asc' },
          })).find(isPlannerManagedSurveyTarget)
          addDesiredTarget(
            existing
              ? (existing.isActive ? existing : await tx.surveyTarget.update({ where: { id: existing.id }, data: { isActive: true } }))
              : await tx.surveyTarget.create({ data: { eventId: event.id, speakerId: speaker.id, category: SurveyTargetCategory.SPEAKER, name: speaker.name, slug: `advanced-speaker-${speaker.id}`, isActive: true } }),
            { kind: 'SPEAKER', selection: spec.selection },
          )
        }
        continue
      }

      const customName = spec.customName?.trim()
      const customKey = spec.customKey?.trim()
      if (!customName || !customKey) throw new AdvancedEventSurveyBuilderError('Custom assignments require a name')
      const slug = `advanced-custom-${assignmentSlugPart(customKey)}`
      const existing = await tx.surveyTarget.findUnique({ where: { eventId_slug: { eventId: event.id, slug } } })
      addDesiredTarget(
        existing ?? await tx.surveyTarget.create({ data: { eventId: event.id, category: SurveyTargetCategory.CUSTOM, name: customName, slug, metadata: { advancedAssignment: { kind: 'CUSTOM', selection: 'SELECTED', customKey } }, isActive: true } }),
        { kind: 'CUSTOM', selection: 'SELECTED' },
      )
    }

    const desiredIds = [...new Set(desiredTargets.map((target) => target.id))]
    const assignmentRuleByTargetId = new Map(desiredTargets.map((target) => [target.id, target.assignmentRule]))
    if (
      survey.availabilityMode === SurveyAvailabilityMode.RELATIVE_TO_EVENT_AREA
      && !desiredTargets.some((target) => target.category === SurveyTargetCategory.SESSION)
    ) {
      throw new AdvancedEventSurveyBuilderError('Keep a session assignment while using session-relative availability')
    }
    const existingLinks = await tx.publicSurveyLink.findMany({
      where: { surveyId: survey.id },
      select: { id: true, surveyId: true, surveyTargetId: true, speakerAssignmentId: true, isActive: true, metadata: true },
    })
    // CURRENT links represent the mutable deployment state. SUPERSEDED links
    // are historical lifecycle records and are never revived. Reusing a
    // current link keeps a distributed token stable while Response rows retain
    // the target that was copied at capture time.
    const currentLinks = existingLinks.filter((link) => surveyAssignmentState(link) !== 'SUPERSEDED')
    // A target can have exactly one current deployment across all surveys.
    // Reconciliation used to scope this lookup to the survey being edited,
    // leaving an older survey's link CURRENT after a swap (and resurrecting it
    // after detaching the newer link). Include both the old and desired target
    // sets so assign, swap, and detach all transition the same canonical state.
    const affectedTargetIds = [...new Set([
      ...desiredIds,
      ...currentLinks.flatMap((link) => link.surveyTargetId ? [link.surveyTargetId] : []),
    ])]
    if (affectedTargetIds.length > 0) {
      const competingLinks = await tx.publicSurveyLink.findMany({
        where: {
          surveyTargetId: { in: affectedTargetIds },
          surveyId: { not: survey.id },
        },
        select: { id: true, metadata: true },
      })
      for (const link of competingLinks) {
        if (surveyAssignmentState(link) === 'SUPERSEDED') continue
        await tx.publicSurveyLink.update({
          where: { id: link.id },
          data: { isActive: false, metadata: surveyAssignmentMetadata(link.metadata, 'SUPERSEDED') },
        })
      }
    }
    // Old rows created before capture-time target snapshots cannot safely
    // follow a retargeted link. Keep those links on their historical target
    // and create a new deployment only for that legacy edge case.
    const incompleteHistory = assignmentHistory.hasResponses && currentLinks.length > 0
      ? await tx.response.findMany({
          where: {
            publicSurveyLinkId: { in: currentLinks.map((link) => link.id) },
            surveyTargetId: null,
          },
          select: { publicSurveyLinkId: true },
        })
      : []
    const nonRetargetableLinkIds = new Set(incompleteHistory.flatMap((response) => response.publicSurveyLinkId ? [response.publicSurveyLinkId] : []))
    const consumedLinkIds = new Set<string>()
    for (const targetId of desiredIds) {
      const existingLink = currentLinks.find((link) => link.surveyTargetId === targetId && !consumedLinkIds.has(link.id))
      if (existingLink) {
        await tx.publicSurveyLink.update({
          where: { id: existingLink.id },
          data: {
            isActive: survey.status === EventStatus.ACTIVE,
            metadata: surveyAssignmentMetadata(existingLink.metadata, 'CURRENT', assignmentRuleByTargetId.get(targetId)),
          },
        })
        consumedLinkIds.add(existingLink.id)
        continue
      }
      const reusableLink = currentLinks.find((link) => !consumedLinkIds.has(link.id) && !nonRetargetableLinkIds.has(link.id))
      if (reusableLink) {
        await tx.publicSurveyLink.update({
          where: { id: reusableLink.id },
          data: {
            surveyTargetId: targetId,
            // Builder assignments do not carry a session-specific speaker
            // launch context. Historical responses keep their copied context.
            speakerAssignmentId: null,
            isActive: survey.status === EventStatus.ACTIVE,
            metadata: surveyAssignmentMetadata(reusableLink.metadata, 'CURRENT', assignmentRuleByTargetId.get(targetId)),
          },
        })
        consumedLinkIds.add(reusableLink.id)
        continue
      }
      await tx.publicSurveyLink.create({
        data: {
          surveyId: survey.id,
          surveyTargetId: targetId,
          token: await createUniquePublicSurveyToken(tx),
          isActive: survey.status === EventStatus.ACTIVE,
          metadata: {
            assignmentSource: 'ADVANCED_SURVEY_BUILDER',
            assignmentState: 'CURRENT',
            advancedAssignment: assignmentRuleByTargetId.get(targetId)!,
          },
        },
      })
    }
    for (const link of currentLinks.filter((candidate) => !consumedLinkIds.has(candidate.id))) {
      await tx.publicSurveyLink.update({
        where: { id: link.id },
        data: { isActive: false, metadata: surveyAssignmentMetadata(link.metadata, 'SUPERSEDED') },
      })
    }
    await tx.survey.update({ where: { id: survey.id }, data: { surveyTargetId: desiredIds[0] ?? null } })

    const assignmentWarnings = [speakerQuestionExclusionWarning(survey.questions, speakerlessSessionNames)].filter(
      (warning): warning is AdvancedSurveyAssignmentWarning => Boolean(warning),
    )
    return {
      ...withAdvancedReview(await tx.survey.findUniqueOrThrow({ where: { id: survey.id }, select: advancedDraftSelect })),
      assignmentWarnings,
    }
  })
}

/** Publishes a shared Advanced or Simple Event survey after validation. */
export async function publishAdvancedEventSurvey(
  input: { accountId: string; eventId: string; surveyId: string },
  db: PrismaClient = prisma,
) {
  const event = await db.event.findFirst({
    where: { id: input.eventId, location: { accountId: input.accountId } },
    select: { id: true, eventType: true },
  })
  if (!event) throw new AdvancedEventSurveyBuilderError('Event not found or access denied', 404)
  if (!isSharedEventSurveyBuilderEvent(event.eventType)) throw new AdvancedEventSurveyBuilderError('Publishing here is only available for Advanced or Simple Events', 409)

  return db.$transaction(async (tx) => {
    const survey = await tx.survey.findFirst({
      where: { id: input.surveyId, eventId: event.id },
      select: advancedDraftSelect,
    })
    if (!survey) throw new AdvancedEventSurveyBuilderError('Survey draft not found in this event', 404)
    if (survey.status !== EventStatus.DRAFT) throw new AdvancedEventSurveyBuilderError('Only a draft survey can be published', 409)
    const issues = reviewAdvancedSurveyReadiness(survey)
    if (issues.length > 0) throw new AdvancedEventSurveyBuilderError(issues.join(' '), 409)

    await tx.survey.update({ where: { id: survey.id }, data: { status: EventStatus.ACTIVE } })
    const currentLinkIds = survey.publicSurveyLinks
      .filter((link) => surveyAssignmentState(link) !== 'SUPERSEDED')
      .map((link) => link.id)
    await tx.publicSurveyLink.updateMany({ where: { id: { in: currentLinkIds } }, data: { isActive: true } })
    return withAdvancedReview(await tx.survey.findUniqueOrThrow({ where: { id: survey.id }, select: advancedDraftSelect }))
  })
}
