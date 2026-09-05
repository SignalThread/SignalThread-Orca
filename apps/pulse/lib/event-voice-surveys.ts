import { randomBytes } from 'crypto'
import { CollectionPhase, EventStatus, EventStructureItemKind, Prisma, QuestionResponseTarget, QuestionType, ResponseMode, SurveyTargetCategory, type PrismaClient } from '@prisma/client'
import { requireEventsAccountType } from './account-product-mode'
import { normalizeMixedQuestions } from './mixed-survey-contract'
import { prisma } from './prisma'
import { ensureSurveyQuestionAudioForSurvey } from './question-audio'
import {
  normalizeSurveyAvailabilityInput,
  type SurveyAvailabilityInput,
} from './survey-availability'
import { resolveEventListeningWindow } from './event-listening-window'
import { reconcileActiveEventSurveyDeploymentsInTransaction } from './event-survey-deployment-lifecycle'
import { surveyHasResponses } from './survey-response-history'

type PrismaTx = Prisma.TransactionClient

export interface CreateEventVoiceSurveyQuestionInput {
  prompt: string
  helperText?: string | null
  type?: QuestionType | string
  order?: number
  required?: boolean
  responseTarget?: QuestionResponseTarget | string
}

export interface CreateEventVoiceSurveyInput {
  eventId: string
  collectionPhase?: CollectionPhase
  surveyTargetId?: string | null
  eventStructureItemId?: string | null
  /** Direct canonical EventSpeakerProfile identity for a SPEAKER target. */
  speakerId?: string | null
  targetCategory?: SurveyTargetCategory | null
  targetName?: string | null
  targetDescription?: string | null
  targetMetadata?: Prisma.InputJsonValue | null
  locationId?: string | null
  surveyName?: string
  surveyTitle?: string
  surveyDescription?: string | null
  surveyStatus?: EventStatus
  ttsProvider?: string | null
  ttsVoice?: string | null
  ttsLocale?: string | null
  responseMode?: ResponseMode
  questions: CreateEventVoiceSurveyQuestionInput[]
  availability?: SurveyAvailabilityInput | null
  creationRequestId?: string | null
}

export type CreateEventVoiceSurveyResult = Awaited<ReturnType<typeof createEventVoiceSurveyInTransaction>> & {
  questionAudioStatus: 'READY' | 'DEFERRED'
}

export async function createEventVoiceSurvey(
  input: CreateEventVoiceSurveyInput,
  db: PrismaClient = prisma,
  ensureQuestionAudio: typeof ensureSurveyQuestionAudioForSurvey = ensureSurveyQuestionAudioForSurvey,
): Promise<CreateEventVoiceSurveyResult> {
  let result: Awaited<ReturnType<typeof createEventVoiceSurveyInTransaction>>
  try {
    result = await db.$transaction((tx) => createEventVoiceSurveyInTransaction(input, tx))
  } catch (error) {
    const isCreationKeyRace = Boolean(
      optionalTrimmed(input.creationRequestId)
      && error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'P2002',
    )
    if (!isCreationKeyRace) throw error

    // A concurrent request with the same key won the unique constraint. Once
    // its transaction commits, the canonical lookup path returns that result.
    result = await db.$transaction((tx) => createEventVoiceSurveyInTransaction(input, tx))
  }

  if (result.survey.responseMode === ResponseMode.TEXT_ONLY) {
    // Text-only completion never consumes question audio. Do not generate an
    // unnecessary cache asset for an organizer-selected text survey.
    return { ...result, questionAudioStatus: 'READY' }
  }

  try {
    await ensureQuestionAudio(result.survey.id, {
      provider: result.survey.ttsProvider ?? undefined,
      voice: result.survey.ttsVoice ?? undefined,
      locale: result.survey.ttsLocale ?? undefined,
    })
    return { ...result, questionAudioStatus: 'READY' }
  } catch (error) {
    // Survey creation is already committed atomically. Audio assets are a
    // recoverable cache and can be generated on the next retry/runtime read.
    console.error('[createEventVoiceSurvey] question audio deferred', {
      surveyId: result.survey.id,
      error,
    })
    return { ...result, questionAudioStatus: 'DEFERRED' }
  }
}

export interface ActivateEventVoiceSurveyInput {
  eventId: string
  accountId: string
  surveyId: string
}

export class EventVoiceSurveyLifecycleError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'EventVoiceSurveyLifecycleError'
    this.status = status
  }
}

export async function activateEventVoiceSurvey(
  input: ActivateEventVoiceSurveyInput,
  db: PrismaClient = prisma,
) {
  const eventId = requireTrimmed(input.eventId, 'eventId')
  const accountId = requireTrimmed(input.accountId, 'accountId')
  const surveyId = requireTrimmed(input.surveyId, 'surveyId')

  const existing = await loadScopedEventVoiceSurvey(db, { eventId, accountId, surveyId })

  return db.$transaction(async (tx) => {
    const survey = await tx.survey.update({
      where: { id: existing.id },
      data: { status: EventStatus.ACTIVE },
    })

    const target = await tx.surveyTarget.update({
      where: { id: existing.surveyTargetId },
      data: { isActive: true },
    })

    const firstLink = existing.publicSurveyLinks[0] ?? null
    if (firstLink) {
      await reconcileActiveEventSurveyDeploymentsInTransaction(tx, { eventId, surveyId: existing.id })
    }
    const publicLink = firstLink
      ? await tx.publicSurveyLink.findUnique({ where: { id: firstLink.id } })
      : await tx.publicSurveyLink.create({
          data: {
            surveyId: existing.id,
            surveyTargetId: existing.surveyTargetId,
            token: await createUniquePublicSurveyToken(tx),
            isActive: true,
          },
        })

    return { survey, target, publicLink }
  })
}

export async function unpublishEventVoiceSurvey(
  input: ActivateEventVoiceSurveyInput,
  db: PrismaClient = prisma,
) {
  const eventId = requireTrimmed(input.eventId, 'eventId')
  const accountId = requireTrimmed(input.accountId, 'accountId')
  const surveyId = requireTrimmed(input.surveyId, 'surveyId')
  const existing = await loadScopedEventVoiceSurvey(db, { eventId, accountId, surveyId })

  return db.$transaction(async (tx) => {
    const survey = await tx.survey.update({
      where: { id: existing.id },
      data: { status: EventStatus.DRAFT },
    })

    const target = await tx.surveyTarget.update({
      where: { id: existing.surveyTargetId },
      data: { isActive: true },
    })

    const firstLink = existing.publicSurveyLinks[0] ?? null
    await tx.publicSurveyLink.updateMany({ where: { surveyId: existing.id }, data: { isActive: false } })
    const publicLink = firstLink ? await tx.publicSurveyLink.findUnique({ where: { id: firstLink.id } }) : null

    return { survey, target, publicLink }
  })
}

export async function archiveEventVoiceSurvey(
  input: ActivateEventVoiceSurveyInput,
  db: PrismaClient = prisma,
) {
  const eventId = requireTrimmed(input.eventId, 'eventId')
  const accountId = requireTrimmed(input.accountId, 'accountId')
  const surveyId = requireTrimmed(input.surveyId, 'surveyId')
  const existing = await loadScopedEventVoiceSurvey(db, { eventId, accountId, surveyId })

  return db.$transaction(async (tx) => {
    const survey = await tx.survey.update({
      where: { id: existing.id },
      data: { status: EventStatus.ARCHIVED },
    })

    const target = await tx.surveyTarget.update({
      where: { id: existing.surveyTargetId },
      data: { isActive: false },
    })

    const firstLink = existing.publicSurveyLinks[0] ?? null
    await tx.publicSurveyLink.updateMany({ where: { surveyId: existing.id }, data: { isActive: false } })
    const publicLink = firstLink ? await tx.publicSurveyLink.findUnique({ where: { id: firstLink.id } }) : null

    return { survey, target, publicLink }
  })
}

export async function restoreArchivedEventVoiceSurvey(
  input: ActivateEventVoiceSurveyInput,
  db: PrismaClient = prisma,
) {
  const eventId = requireTrimmed(input.eventId, 'eventId')
  const accountId = requireTrimmed(input.accountId, 'accountId')
  const surveyId = requireTrimmed(input.surveyId, 'surveyId')
  const existing = await loadScopedEventVoiceSurvey(db, { eventId, accountId, surveyId })

  return db.$transaction(async (tx) => {
    const survey = await tx.survey.update({
      where: { id: existing.id },
      data: { status: EventStatus.DRAFT },
    })

    const target = await tx.surveyTarget.update({
      where: { id: existing.surveyTargetId },
      data: { isActive: true },
    })

    const firstLink = existing.publicSurveyLinks[0] ?? null
    await tx.publicSurveyLink.updateMany({ where: { surveyId: existing.id }, data: { isActive: false } })
    const publicLink = firstLink ? await tx.publicSurveyLink.findUnique({ where: { id: firstLink.id } }) : null

    return { survey, target, publicLink }
  })
}

export async function deleteEventVoiceSurvey(
  input: ActivateEventVoiceSurveyInput,
  db: PrismaClient = prisma,
) {
  const eventId = requireTrimmed(input.eventId, 'eventId')
  const accountId = requireTrimmed(input.accountId, 'accountId')
  const surveyId = requireTrimmed(input.surveyId, 'surveyId')
  // Deletion is a survey lifecycle action. Unlike deployment actions, it is
  // valid for a draft definition that has not been assigned to a target yet.
  const existing = await loadScopedEventVoiceSurveyForDeletion(db, { eventId, accountId, surveyId })

  if (await surveyHasResponses(db, existing.id)) {
    throw new EventVoiceSurveyLifecycleError(
      'This survey has responses, so it cannot be deleted. Archive it to preserve history.',
      409,
    )
  }

  return db.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { surveyId: existing.id } })
    const survey = await tx.survey.delete({ where: { id: existing.id } })
    // A reusable Survey may now have assignment links to multiple targets.
    // Clean up only targets made empty by this deletion; an unassigned survey
    // simply has no target cleanup to perform.
    const affectedTargetIds = Array.from(new Set([
      existing.surveyTargetId,
      ...existing.publicSurveyLinks.map((link) => link.surveyTargetId),
    ].filter((targetId): targetId is string => Boolean(targetId))))

    for (const targetId of affectedTargetIds) {
      const [remainingTargetSurveys, remainingTargetDeployments] = await Promise.all([
        tx.survey.count({ where: { surveyTargetId: targetId } }),
        tx.publicSurveyLink.count({ where: { surveyTargetId: targetId } }),
      ])

      if (remainingTargetSurveys === 0 && remainingTargetDeployments === 0) {
        await tx.surveyTarget.delete({ where: { id: targetId } })
      }
    }

    return { survey }
  })
}

async function loadScopedEventVoiceSurvey(
  db: PrismaClient,
  input: ActivateEventVoiceSurveyInput,
) {
  const existing = await findScopedEventVoiceSurvey(db, input)

  if (!existing.surveyTargetId) {
    throw new EventVoiceSurveyLifecycleError('Assign this survey before using deployment lifecycle controls', 409)
  }

  return { ...existing, surveyTargetId: existing.surveyTargetId }
}

/**
 * Loads a survey for a deletion operation without imposing the target-required
 * deployment lifecycle invariant. Account and event scope remain enforced.
 */
async function loadScopedEventVoiceSurveyForDeletion(
  db: PrismaClient,
  input: ActivateEventVoiceSurveyInput,
) {
  return findScopedEventVoiceSurvey(db, input)
}

async function findScopedEventVoiceSurvey(
  db: PrismaClient,
  input: ActivateEventVoiceSurveyInput,
) {
  const existing = await db.survey.findFirst({
    where: {
      id: input.surveyId,
      eventId: input.eventId,
      event: {
        location: {
          accountId: input.accountId,
        },
      },
    },
    select: {
      id: true,
      surveyTargetId: true,
      event: {
        select: {
          location: {
            select: {
              account: {
                select: {
                  accountType: true,
                },
              },
            },
          },
        },
      },
      publicSurveyLinks: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, surveyTargetId: true },
      },
      _count: {
        select: {
          responses: true,
        },
      },
    },
  })

  if (!existing) {
    throw new EventVoiceSurveyLifecycleError('Survey not found in this event', 404)
  }

  requireEventsAccountType(
    existing.event.location.account.accountType,
    'Event voice survey lifecycle controls are only available for EVENTS accounts',
  )
  return existing
}

export async function createEventVoiceSurveyInTransaction(
  input: CreateEventVoiceSurveyInput,
  tx: PrismaTx,
) {
  const normalized = normalizeCreateEventVoiceSurveyInput(input)

  const event = await tx.event.findUnique({
    where: { id: normalized.eventId },
    select: {
      id: true,
      locationId: true,
      startDate: true,
      endDate: true,
      listeningWindowOpensAt: true,
      listeningWindowClosesAt: true,
      location: {
        select: {
          accountId: true,
          account: {
            select: {
              accountType: true,
            },
          },
        },
      },
    },
  })

  if (!event) {
    throw new Error(`Event ${normalized.eventId} not found`)
  }

  requireEventsAccountType(
    event.location.account.accountType,
    'Event voice surveys are only available for EVENTS accounts',
  )

  // Event-wide surveys use the event listening window by default. Session
  // surveys deliberately keep their own availability rules and never inherit
  // this window as a fabricated session schedule.
  if (!input.availability && normalized.targetCategory === SurveyTargetCategory.EVENT) {
    const window = resolveEventListeningWindow(event)
    if (window.opensAt && window.closesAt) {
      normalized.availability = normalizeSurveyAvailabilityInput({
        mode: 'CUSTOM_WINDOW', timezone: 'UTC', opensAt: window.opensAt, closesAt: window.closesAt,
      })
    }
  }

  if (normalized.creationRequestId) {
    const existingSurvey = await tx.survey.findUnique({
      where: {
        eventId_creationRequestId: {
          eventId: event.id,
          creationRequestId: normalized.creationRequestId,
        },
      },
      include: {
        surveyTarget: true,
        questions: { orderBy: { order: 'asc' } },
        publicSurveyLinks: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    })

    if (existingSurvey) {
      const { surveyTarget, questions, publicSurveyLinks, ...survey } = existingSurvey
      if (!surveyTarget) {
        throw new Error(`Survey ${survey.id} is unassigned and cannot satisfy an assigned creation retry`)
      }
      const publicLink = publicSurveyLinks[0]
      if (!publicLink) {
        throw new Error(`Survey ${survey.id} is missing its public link`)
      }
      return {
        target: surveyTarget,
        survey,
        questions,
        publicLink,
        scope: {
          accountId: event.location.accountId,
          eventId: event.id,
          eventLocationId: event.locationId,
          targetLocationId: surveyTarget.locationId,
          eventStructureItemId: surveyTarget.eventStructureItemId,
        },
      }
    }
  }

  if (normalized.locationId) {
    const targetLocation = await tx.location.findUnique({
      where: { id: normalized.locationId },
      select: { id: true, accountId: true },
    })

    if (!targetLocation || targetLocation.accountId !== event.location.accountId) {
      throw new Error('Target location must belong to the same account as the event')
    }
  }

  const existingTarget = normalized.surveyTargetId
    ? await tx.surveyTarget.findFirst({
        where: { id: normalized.surveyTargetId, eventId: event.id, isActive: true },
        include: { eventStructureItem: true },
      })
    : null
  if (normalized.surveyTargetId && !existingTarget) {
    throw new Error('Survey target not found for this event/account')
  }

  const selectedSpeaker = normalized.speakerId
    ? await tx.eventSpeakerProfile.findFirst({
        where: {
          id: normalized.speakerId,
          accountId: event.location.accountId,
          isArchived: false,
          sessionAssignments: { some: { eventId: event.id } },
        },
        select: { id: true, name: true },
      })
    : null
  if (normalized.speakerId && !selectedSpeaker) {
    throw new Error('Speaker must belong to this account and be assigned to this event')
  }
  if (selectedSpeaker && existingTarget && (
    existingTarget.category !== SurveyTargetCategory.SPEAKER
    || existingTarget.speakerId !== selectedSpeaker.id
  )) {
    throw new Error('Survey target does not belong to this speaker')
  }

  const existingSpeakerTarget = selectedSpeaker && !existingTarget
    ? await tx.surveyTarget.findFirst({
        where: {
          eventId: event.id,
          category: SurveyTargetCategory.SPEAKER,
          speakerId: selectedSpeaker.id,
        },
        include: { surveys: { where: { status: { not: EventStatus.ARCHIVED } }, select: { id: true }, take: 1 } },
      })
    : null
  if (existingSpeakerTarget?.isActive && (existingSpeakerTarget.surveys?.length ?? 0) > 0) {
    throw new EventVoiceSurveyLifecycleError('This speaker already has an active survey in this event', 409)
  }

  const selectedStructureItem = existingTarget?.eventStructureItem ?? (normalized.eventStructureItemId
    ? await tx.eventStructureItem.findFirst({
        where: {
          id: normalized.eventStructureItemId,
          eventId: event.id,
          isActive: true,
          event: {
            location: {
              accountId: event.location.accountId,
            },
          },
        },
        select: {
          id: true,
          kind: true,
          name: true,
          slug: true,
          description: true,
          locationId: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          metadata: true,
        },
      })
    : null)

  if (normalized.eventStructureItemId && !selectedStructureItem) {
    throw new Error('Event structure item not found for this event/account')
  }

  const targetSnapshot = existingTarget
    ? {
        eventStructureItemId: existingTarget.eventStructureItemId,
        category: existingTarget.category,
        name: existingTarget.name,
        slugBase: existingTarget.slug,
        description: existingTarget.description,
        metadata: existingTarget.metadata as Prisma.InputJsonValue | null,
        locationId: existingTarget.locationId,
      }
    : selectedSpeaker
    ? {
        eventStructureItemId: null,
        category: SurveyTargetCategory.SPEAKER,
        name: selectedSpeaker.name,
        slugBase: `speaker-${selectedSpeaker.id}`,
        description: normalized.targetDescription,
        metadata: normalized.targetMetadata,
        locationId: null,
        speakerId: selectedSpeaker.id,
      }
    : selectedStructureItem
    ? {
        eventStructureItemId: selectedStructureItem.id,
        category: mapEventStructureItemKindToSurveyTargetCategory(selectedStructureItem.kind),
        name: selectedStructureItem.name,
        slugBase: selectedStructureItem.slug,
        description: selectedStructureItem.description,
        metadata: selectedStructureItem.metadata as Prisma.InputJsonValue | null,
        locationId: selectedStructureItem.locationId,
      }
    : {
        eventStructureItemId: null,
        category: normalized.targetCategory as SurveyTargetCategory,
        name: normalized.targetName as string,
        slugBase: slugFromName(normalized.targetName as string) || 'target',
        description: normalized.targetDescription,
        metadata: normalized.targetMetadata,
        locationId: normalized.locationId,
      }

  if (normalized.availability.availabilityMode === 'RELATIVE_TO_EVENT_AREA') {
    const targetHasTiming = Boolean(selectedStructureItem?.startsAt && selectedStructureItem?.endsAt)
    const canUseEventTiming = targetSnapshot.category !== SurveyTargetCategory.SESSION
      && Boolean(event.startDate && event.endDate)
    if (!targetHasTiming && !canUseEventTiming) {
      throw new EventVoiceSurveyLifecycleError('Schedule around this survey requires a scheduled session or event. Choose exact dates and times instead.')
    }
  }

  const structureItem = targetSnapshot.category === SurveyTargetCategory.SPEAKER
    ? null
    : selectedStructureItem
    ? { id: selectedStructureItem.id, slug: selectedStructureItem.slug }
    : await resolveOrCreateEventStructureItemForSurveyTarget(tx, {
        eventId: event.id,
        targetCategory: targetSnapshot.category,
        targetName: targetSnapshot.name,
        targetDescription: targetSnapshot.description,
        targetMetadata: targetSnapshot.metadata,
        locationId: targetSnapshot.locationId,
      })
  const targetSlug = existingTarget?.slug ?? existingSpeakerTarget?.slug ?? await createUniqueSurveyTargetSlug(tx, event.id, targetSnapshot.name, targetSnapshot.slugBase)

  const target = existingTarget ?? existingSpeakerTarget
    ? await tx.surveyTarget.update({
        where: { id: (existingTarget ?? existingSpeakerTarget)!.id },
        data: { isActive: true },
      })
    : await tx.surveyTarget.create({
    data: {
      eventId: event.id,
      locationId: targetSnapshot.locationId,
      eventStructureItemId: structureItem?.id ?? null,
      speakerId: selectedSpeaker?.id ?? null,
      category: targetSnapshot.category,
      name: targetSnapshot.name,
      slug: targetSlug,
      description: targetSnapshot.description,
      metadata: targetSnapshot.metadata ?? undefined,
      isActive: true,
    },
    })

  for (const question of normalized.questions) {
    if (question.responseTarget !== QuestionResponseTarget.SPEAKERS) continue
    if (question.type !== QuestionType.RATING_1_TO_5) {
      throw new Error('Only 1–5 rating questions can target presenters')
    }
    if (targetSnapshot.category !== SurveyTargetCategory.SESSION) {
      throw new Error('Presenter ratings are only available for session surveys')
    }
  }

  const survey = await tx.survey.create({
    data: {
      eventId: event.id,
      surveyTargetId: target.id,
      name: normalized.surveyName,
      collectionPhase: normalized.collectionPhase,
      description: normalized.surveyDescription,
      responseMode: normalized.responseMode,
      status: normalized.surveyStatus,
      ttsProvider: normalized.ttsProvider,
      ttsVoice: normalized.ttsVoice,
      ttsLocale: normalized.ttsLocale,
      creationRequestId: normalized.creationRequestId,
      ...normalized.availability,
    },
  })

  const sortedQuestionInputs = normalized.questions.slice().sort((a, b) => a.order - b.order)
  const questions = await createSurveyQuestions(tx, {
    eventId: event.id,
    surveyId: survey.id,
    questionKeyPrefix: `${targetSlug}-${target.id.slice(-8)}`,
    questions: sortedQuestionInputs,
  })
  const questionHelpers = Object.fromEntries(
    questions.flatMap((question, index) => {
      const helperText = sortedQuestionInputs[index]?.helperText
      return helperText ? [[question.key, helperText]] : []
    }),
  )
  const surveyWithSettings =
    Object.keys(questionHelpers).length > 0
      ? await tx.survey.update({
          where: { id: survey.id },
          data: {
            settingsJson: {
              questionHelpers,
            },
          },
        })
      : survey

  const publicLink = await tx.publicSurveyLink.create({
    data: {
      surveyId: survey.id,
      surveyTargetId: target.id,
      token: await createUniquePublicSurveyToken(tx),
      isActive: normalized.surveyStatus === EventStatus.ACTIVE,
    },
  })

  return {
    target,
    survey: surveyWithSettings,
    questions,
    publicLink,
    scope: {
      accountId: event.location.accountId,
      eventId: event.id,
      eventLocationId: event.locationId,
      targetLocationId: targetSnapshot.locationId,
      eventStructureItemId: structureItem?.id ?? null,
      speakerId: selectedSpeaker?.id ?? null,
    },
  }
}

function normalizeCreateEventVoiceSurveyInput(input: CreateEventVoiceSurveyInput) {
  const eventId = requireTrimmed(input.eventId, 'eventId')
  const collectionPhase = input.collectionPhase
  if (!collectionPhase || !Object.values(CollectionPhase).includes(collectionPhase)) {
    throw new Error('collectionPhase is required')
  }
  const surveyTargetId = optionalTrimmed(input.surveyTargetId)
  const eventStructureItemId = optionalTrimmed(input.eventStructureItemId)
  const speakerId = optionalTrimmed(input.speakerId)
  const targetName = eventStructureItemId || surveyTargetId || speakerId
    ? optionalTrimmed(input.targetName)
    : requireTrimmed(input.targetName, 'targetName')
  const surveyName = requireTrimmed(input.surveyName ?? input.surveyTitle, 'surveyName')
  const targetDescription = optionalTrimmed(input.targetDescription)
  const targetMetadata = input.targetMetadata ?? null
  const surveyDescription = optionalTrimmed(input.surveyDescription)
  const locationId = optionalTrimmed(input.locationId)
  const ttsProvider = optionalTrimmed(input.ttsProvider)?.toLowerCase() ?? null
  const ttsVoice = optionalTrimmed(input.ttsVoice)
  const ttsLocale = optionalTrimmed(input.ttsLocale)
  const creationRequestId = optionalTrimmed(input.creationRequestId)

  if (!eventStructureItemId && !surveyTargetId && !speakerId && !Object.values(SurveyTargetCategory).includes(input.targetCategory as SurveyTargetCategory)) {
    throw new Error('targetCategory is invalid')
  }
  if (eventStructureItemId && input.targetCategory && !Object.values(SurveyTargetCategory).includes(input.targetCategory)) {
    throw new Error('targetCategory is invalid')
  }
  if (speakerId && input.targetCategory !== SurveyTargetCategory.SPEAKER) {
    throw new Error('speakerId requires targetCategory SPEAKER')
  }
  if (input.targetCategory === SurveyTargetCategory.SPEAKER && !speakerId && !surveyTargetId) {
    throw new Error('speakerId is required for a speaker survey')
  }
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new Error('At least one question is required')
  }

  const orderedInputQuestions = input.questions
    .map((question, index) => ({ question, order: question.order ?? index }))
    .sort((a, b) => a.order - b.order)
  const questions = normalizeMixedQuestions(input.questions).map((question, index) => ({
    ...question,
    helperText: optionalTrimmed(orderedInputQuestions[index]?.question.helperText),
    responseTarget: normalizeQuestionResponseTarget(orderedInputQuestions[index]?.question.responseTarget),
  }))
  const availability = normalizeSurveyAvailabilityInput(input.availability)

  return {
    eventId,
    collectionPhase,
    surveyTargetId,
    eventStructureItemId,
    speakerId,
    targetCategory: input.targetCategory ?? null,
    targetName,
    targetDescription,
    targetMetadata,
    locationId,
    surveyName,
    surveyDescription,
    surveyStatus: input.surveyStatus ?? EventStatus.DRAFT,
    ttsProvider,
    ttsVoice,
    ttsLocale,
    creationRequestId,
    responseMode: input.responseMode ?? ResponseMode.VOICE_ONLY,
    availability,
    questions,
  }
}

export function mapSurveyTargetCategoryToEventStructureItemKind(
  category: SurveyTargetCategory,
): EventStructureItemKind {
  switch (category) {
    case SurveyTargetCategory.EVENT:
      return EventStructureItemKind.EVENT
    case SurveyTargetCategory.SESSION:
      return EventStructureItemKind.SESSION
    case SurveyTargetCategory.LOCATION:
      return EventStructureItemKind.AREA
    case SurveyTargetCategory.CUSTOM:
      return EventStructureItemKind.CUSTOM_TOUCHPOINT
    case SurveyTargetCategory.SPEAKER:
      throw new Error('Speaker surveys do not create Event Structure items')
  }
}

export function mapEventStructureItemKindToSurveyTargetCategory(
  kind: EventStructureItemKind,
): SurveyTargetCategory {
  switch (kind) {
    case EventStructureItemKind.EVENT:
      return SurveyTargetCategory.EVENT
    case EventStructureItemKind.SESSION:
      return SurveyTargetCategory.SESSION
    case EventStructureItemKind.AREA:
      return SurveyTargetCategory.LOCATION
    case EventStructureItemKind.SPONSOR_ACTIVATION:
    case EventStructureItemKind.CUSTOM_TOUCHPOINT:
      return SurveyTargetCategory.CUSTOM
  }
}

export async function resolveOrCreateEventStructureItemForSurveyTarget(
  tx: Pick<PrismaTx, 'eventStructureItem'>,
  input: {
    eventId: string
    targetCategory: SurveyTargetCategory
    targetName: string
    targetDescription: string | null
    targetMetadata: Prisma.InputJsonValue | null
    locationId: string | null
  },
) {
  const kind = mapSurveyTargetCategoryToEventStructureItemKind(input.targetCategory)
  const baseSlug = slugFromName(input.targetName) || 'target'

  const existingBySlug = await tx.eventStructureItem.findFirst({
    where: {
      eventId: input.eventId,
      kind,
      slug: baseSlug,
      isActive: true,
    },
    select: { id: true, slug: true },
  })
  if (existingBySlug) return existingBySlug

  const existingByName = await tx.eventStructureItem.findFirst({
    where: {
      eventId: input.eventId,
      kind,
      name: input.targetName,
      isActive: true,
    },
    select: { id: true, slug: true },
  })
  if (existingByName) return existingByName

  const slug = await createUniqueEventStructureItemSlug(tx, input.eventId, baseSlug)

  return tx.eventStructureItem.create({
    data: {
      eventId: input.eventId,
      kind,
      name: input.targetName,
      slug,
      description: input.targetDescription,
      locationId: input.locationId,
      metadata: input.targetMetadata ?? undefined,
      isActive: true,
    },
    select: { id: true, slug: true },
  })
}

async function createSurveyQuestions(
  tx: PrismaTx,
  opts: {
    eventId: string
    surveyId: string
    questionKeyPrefix: string
    questions: Array<{
      prompt: string
      helperText: string | null
      type: QuestionType
      order: number
      required: boolean
      responseTarget: QuestionResponseTarget
    }>
  },
) {
  const maxOrderRow = await tx.question.findFirst({
    where: { eventId: opts.eventId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const orderOffset = (maxOrderRow?.order ?? -1) + 1

  const createdQuestions = []
  for (const [index, question] of opts.questions.entries()) {
    createdQuestions.push(
      await tx.question.create({
        data: {
          eventId: opts.eventId,
          surveyId: opts.surveyId,
          key: `${opts.questionKeyPrefix}-q${index + 1}`,
          label: question.prompt,
          ttsText: null,
          type: question.type,
          responseTarget: question.responseTarget,
          order: orderOffset + index,
          required: question.required,
        },
      }),
    )
  }

  return createdQuestions
}

function normalizeQuestionResponseTarget(value: unknown): QuestionResponseTarget {
  if (value == null || value === '') return QuestionResponseTarget.GENERAL
  if (value === QuestionResponseTarget.GENERAL || value === QuestionResponseTarget.SESSION || value === QuestionResponseTarget.SPEAKERS) {
    return value
  }
  throw new Error('question responseTarget is invalid')
}

async function createUniqueEventStructureItemSlug(
  tx: Pick<PrismaTx, 'eventStructureItem'>,
  eventId: string,
  baseSlug: string,
) {
  let slug = baseSlug || 'target'
  let suffix = 1

  while (
    await tx.eventStructureItem.findUnique({
      where: {
        eventId_slug: {
          eventId,
          slug,
        },
      },
      select: { id: true },
    })
  ) {
    suffix += 1
    slug = `${baseSlug}-${suffix}`
  }

  return slug
}

async function createUniqueSurveyTargetSlug(
  tx: Pick<PrismaTx, 'surveyTarget'>,
  eventId: string,
  name: string,
  slugBase?: string,
) {
  const base = slugBase || slugFromName(name) || 'target'
  let slug = base
  let suffix = 1

  while (
    await tx.surveyTarget.findUnique({
      where: {
        eventId_slug: {
          eventId,
          slug,
        },
      },
      select: { id: true },
    })
  ) {
    suffix += 1
    slug = `${base}-${suffix}`
  }

  return slug
}

export async function createUniquePublicSurveyToken(tx: Pick<PrismaTx, 'publicSurveyLink'>) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = randomBytes(18).toString('base64url')
    const existing = await tx.publicSurveyLink.findUnique({
      where: { token },
      select: { id: true },
    })

    if (!existing) {
      return token
    }
  }

  throw new Error('Unable to generate a unique public survey token')
}

function slugFromName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

function requireTrimmed(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`)
  }
  return value.trim()
}

function optionalTrimmed(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
