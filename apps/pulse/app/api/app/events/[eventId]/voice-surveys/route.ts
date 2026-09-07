import { NextRequest, NextResponse } from 'next/server'
import {
  CollectionPhase,
  EventStatus,
  QuestionResponseTarget,
  QuestionType,
  ResponseMode,
  SurveyAvailabilityAnchor,
  SurveyAvailabilityMode,
  SurveyAvailabilityOverride,
  SurveyTargetCategory,
} from '@prisma/client'
import { z } from 'zod'
import { AccountProductModeError, requireEventsAccountType } from '@/lib/account-product-mode'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import {
  EventVoiceSurveyLifecycleError,
  activateEventVoiceSurvey,
  archiveEventVoiceSurvey,
  createEventVoiceSurvey,
  deleteEventVoiceSurvey,
  restoreArchivedEventVoiceSurvey,
  unpublishEventVoiceSurvey,
} from '@/lib/event-voice-surveys'
import { prisma } from '@/lib/prisma'
import { ensureSurveyQuestionAudioForSurvey } from '@/lib/question-audio'
import { deriveLocaleFromVoice } from '@/lib/tts-voices'
import {
  assertQuestionTypesMutable,
  MixedSurveyValidationError,
  normalizeMixedQuestions,
} from '@/lib/mixed-survey-contract'
import {
  normalizeSurveyAvailabilityInput,
  resolveSurveyLaunchReadiness,
  SurveyAvailabilityValidationError,
} from '@/lib/survey-availability'
import { isPlannerManagedSurveyTarget } from '@/lib/event-survey-scope'
import { loadEventSurveyWorkspacePackage } from '@/lib/event-survey-workspace'
import { getAssignedSurveyForEntity, resolveCurrentSurveyAssignment, type EntitySurveyAssignmentLink } from '@/lib/survey-target-assignment'
import { withDevelopmentRouteTiming } from '@/lib/development-route-timing'
import { createBulkSurveyConfigurationForSessions } from '@/lib/event-listening-plan'
import { EventAgendaServiceError } from '@/lib/event-agenda-service'
import { readEventSignageVisualConfiguration } from '@/lib/event-signage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const availabilitySchema = z.object({
  mode: z.nativeEnum(SurveyAvailabilityMode),
  timezone: z.string().trim().min(1).optional().nullable(),
  opensAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
  openAnchor: z.nativeEnum(SurveyAvailabilityAnchor).optional().nullable(),
  closeAnchor: z.nativeEnum(SurveyAvailabilityAnchor).optional().nullable(),
  openOffsetMinutes: z.number().int().optional().nullable(),
  closeOffsetMinutes: z.number().int().optional().nullable(),
  override: z.nativeEnum(SurveyAvailabilityOverride).optional().nullable(),
})

const createVoiceSurveySchema = z.object({
  creationRequestId: z.string().uuid('creationRequestId must be a UUID').optional(),
  collectionPhase: z.nativeEnum(CollectionPhase),
  surveyTargetId: z.string().trim().min(1).optional().nullable(),
  sessionIds: z.array(z.string().trim().min(1)).min(1).max(500).optional(),
  eventStructureItemId: z.string().trim().min(1).optional().nullable(),
  speakerId: z.string().trim().min(1).optional().nullable(),
  targetCategory: z.nativeEnum(SurveyTargetCategory).optional(),
  targetName: z.string().trim().min(1, 'targetName is required').optional(),
  targetDescription: z.string().trim().min(1).optional().nullable(),
  targetMetadata: z.any().optional().nullable(),
  locationId: z.string().trim().min(1).optional().nullable(),
  surveyName: z.string().trim().min(1, 'surveyName is required'),
  surveyDescription: z.string().trim().min(1).optional().nullable(),
  ttsProvider: z.string().trim().min(1, 'ttsProvider is required').optional(),
  ttsVoice: z.string().trim().min(1, 'ttsVoice is required').optional(),
  ttsLocale: z.string().trim().min(1, 'ttsLocale is required').optional(),
  responseMode: z.nativeEnum(ResponseMode).optional(),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(1, 'prompt is required'),
        helperText: z.string().trim().min(1).optional().nullable(),
        type: z.nativeEnum(QuestionType).optional(),
        responseTarget: z.nativeEnum(QuestionResponseTarget).optional(),
        required: z.boolean().optional(),
        displayOrder: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1, 'At least one question is required'),
  availability: availabilitySchema.optional(),
})

const updateVoiceSurveySchema = z.object({
  surveyId: z.string().trim().min(1).optional(),
  archived: z.boolean().optional(),
  status: z.nativeEnum(EventStatus).optional(),
  collectionPhase: z.nativeEnum(CollectionPhase).optional(),
  eventName: z.string().trim().min(1, 'eventName is required').optional(),
  surveyName: z.string().trim().min(1, 'surveyName is required').optional(),
  surveyDescription: z.string().trim().optional().nullable(),
  targetName: z.string().trim().min(1, 'targetName is required').optional(),
  ttsProvider: z.string().trim().min(1, 'ttsProvider is required').optional(),
  ttsVoice: z.string().trim().min(1, 'ttsVoice is required').optional(),
  ttsLocale: z.string().trim().min(1, 'ttsLocale is required').optional(),
  responseMode: z.nativeEnum(ResponseMode).optional(),
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1).optional(),
        key: z.string().trim().min(1).optional(),
        prompt: z.string().trim().min(1, 'prompt is required').optional(),
        text: z.string().trim().min(1, 'text is required').optional(),
        type: z.nativeEnum(QuestionType).optional(),
        responseTarget: z.nativeEnum(QuestionResponseTarget).optional(),
        required: z.boolean().optional(),
        displayOrder: z.number().int().nonnegative().optional(),
        order: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1, 'At least one question is required')
    .optional(),
  availability: availabilitySchema.optional(),
})

const deleteVoiceSurveySchema = z.object({
  surveyId: z.string().trim().min(1, 'surveyId is required'),
})

function buildKioskTokenPath(token: string) {
  return `/kiosk?token=${encodeURIComponent(token)}`
}

function publicLinkKioskPath(link: { token?: string | null; kioskPath?: string | null }) {
  return link.kioskPath || buildKioskTokenPath(link.token ?? '')
}

/**
 * A Survey definition can be assigned to many targets. PublicSurveyLink is
 * the canonical assignment record, so the workspace must expose the current
 * target for every link rather than deriving assignment from the legacy
 * single Survey.surveyTargetId pointer.
 */
function currentAssignmentTargets(survey: NonNullable<Awaited<ReturnType<typeof loadEventSurveyWorkspacePackage>>>['surveys'][number]) {
  const linksByTargetId = new Map<string, typeof survey.publicSurveyLinks>()
  for (const link of survey.publicSurveyLinks) {
    const targetId = link.surveyTarget?.id
    if (!targetId) continue
    const links = linksByTargetId.get(targetId) ?? []
    links.push(link)
    linksByTargetId.set(targetId, links)
  }

  const targets = Array.from(linksByTargetId.values())
    .map((links) => {
      const target = resolveCurrentSurveyAssignment(links)?.surveyTarget
      if (!target || !isPlannerManagedSurveyTarget(target)) return null
      const entityType = target.category === SurveyTargetCategory.SESSION
        ? 'SESSION'
        : ([SurveyTargetCategory.EVENT, SurveyTargetCategory.LOCATION, SurveyTargetCategory.CUSTOM] as string[]).includes(target.category)
          ? 'AREA'
          : null
      if (!entityType || !target.eventStructureItemId) return target
      const assignment = getAssignedSurveyForEntity(
        target.eventId,
        entityType,
        target.eventStructureItemId,
        survey.publicSurveyLinks as unknown as EntitySurveyAssignmentLink[],
      )
      return assignment?.surveyTarget?.id === target.id ? target : null
    })
    .filter((target): target is NonNullable<typeof target> => Boolean(target) && isPlannerManagedSurveyTarget(target))

  // Compatibility fallback for a legacy definition that predates a
  // target-scoped public link. Once links exist, their current-state metadata
  // is authoritative and the primary pointer is deliberately not duplicated.
  if (targets.length === 0 && survey.surveyTarget && isPlannerManagedSurveyTarget(survey.surveyTarget)) targets.push(survey.surveyTarget)
  return targets
}

/** Deployment rows represent only the current assignment for each target. */
function currentDeploymentLinks(survey: NonNullable<Awaited<ReturnType<typeof loadEventSurveyWorkspacePackage>>>['surveys'][number]) {
  const linksByTargetId = new Map<string, typeof survey.publicSurveyLinks>()
  for (const link of survey.publicSurveyLinks) {
    const targetId = link.surveyTarget?.id
    if (!targetId) continue
    const links = linksByTargetId.get(targetId) ?? []
    links.push(link)
    linksByTargetId.set(targetId, links)
  }
  return Array.from(linksByTargetId.values())
    .map((links) => resolveCurrentSurveyAssignment(links))
    .filter((link): link is NonNullable<typeof link> => Boolean(link))
}

/** A deployment is owned by its target-scoped current public link, not by Survey.surveyTargetId. */
function hasPlannerDeployment(survey: NonNullable<Awaited<ReturnType<typeof loadEventSurveyWorkspacePackage>>>['surveys'][number]) {
  const deploymentLinks = currentDeploymentLinks(survey)
  return deploymentLinks.some((link) => isPlannerManagedSurveyTarget(link.surveyTarget))
    || (deploymentLinks.length === 0 && isPlannerManagedSurveyTarget(survey.surveyTarget))
}

function serializeVoiceSurveyPackage(pkg: NonNullable<Awaited<ReturnType<typeof loadEventSurveyWorkspacePackage>>>) {
  // Do not filter a reusable survey by its single legacy primary target. Its
  // target-scoped PublicSurveyLinks are the canonical deployment collection.
  const plannerSurveys = pkg.surveys.filter(hasPlannerDeployment)
  const firstSurvey = plannerSurveys[0] ?? null
  const publicLink = firstSurvey?.publicSurveyLinks[0] ?? null
  const surveys = plannerSurveys.map((survey) => {
    const surveyPublicLink = survey.publicSurveyLinks[0] ?? null
    const target = survey.surveyTarget
    const readiness = resolveSurveyLaunchReadiness({
      survey,
      publicLink: surveyPublicLink,
      targetActive: target?.isActive ?? true,
      questionCount: survey.questions.length,
      eventStructureItem: target?.eventStructureItem,
      locationTimezone: pkg.location.timezone,
      eventTiming: { startsAt: pkg.startDate, endsAt: pkg.endDate, timezone: pkg.location.timezone },
      allowEventTimingFallback: target?.category !== SurveyTargetCategory.SESSION,
    })

    const assignmentTargets = currentAssignmentTargets(survey)
    return {
      id: survey.id,
      eventId: survey.eventId,
      surveyTargetId: survey.surveyTargetId,
      name: survey.name,
      description: survey.description,
      collectionPhase: survey.collectionPhase,
      responseMode: survey.responseMode,
      status: survey.status,
      isArchived: target ? target.isActive === false : false,
      ttsProvider: survey.ttsProvider,
      ttsVoice: survey.ttsVoice,
      ttsLocale: survey.ttsLocale,
      settingsJson: survey.settingsJson,
      signageConfiguration: readEventSignageVisualConfiguration(survey.settingsJson),
      availabilityMode: survey.availabilityMode,
      availabilityTimezone: survey.availabilityTimezone,
      availabilityOpensAt: survey.availabilityOpensAt,
      availabilityClosesAt: survey.availabilityClosesAt,
      availabilityOpenAnchor: survey.availabilityOpenAnchor,
      availabilityCloseAnchor: survey.availabilityCloseAnchor,
      availabilityOpenOffsetMinutes: survey.availabilityOpenOffsetMinutes,
      availabilityCloseOffsetMinutes: survey.availabilityCloseOffsetMinutes,
      availabilityOverride: survey.availabilityOverride,
      availability: readiness.availability,
      readiness: {
        responseEligible: readiness.responseEligible,
        issues: readiness.issues,
      },
      target,
      assignmentTargets,
      dashboardScope: {
        eventStructureItemIds: [...new Set([
          survey.surveyTarget,
          ...survey.publicSurveyLinks.flatMap((link) => link.surveyTarget ? [link.surveyTarget] : []),
        ].flatMap((assignmentTarget) => (
          assignmentTarget?.eventStructureItemId ? [assignmentTarget.eventStructureItemId] : []
        )))],
      },
      questions: survey.questions,
      responseCount: survey._count.responses,
      publicLink: surveyPublicLink
        ? {
            ...surveyPublicLink,
            kioskPath: publicLinkKioskPath(surveyPublicLink),
          }
        : null,
    }
  })

  // A survey definition can intentionally be reused by several event targets.
  // Keep the authoring list definition-oriented, while exposing one deployment
  // row per target-specific public link. Definitions without a public link still
  // receive one non-deployable row so readiness never controls collection membership.
  const deployments = plannerSurveys.flatMap((survey) => {
    const currentLinks = currentDeploymentLinks(survey)
      .filter((link) => isPlannerManagedSurveyTarget(link.surveyTarget))
    const deploymentLinks = currentLinks.length > 0 ? currentLinks : [null]

    return deploymentLinks.map((surveyPublicLink) => {
      const target = surveyPublicLink?.surveyTarget ?? survey.surveyTarget
      const readiness = resolveSurveyLaunchReadiness({
        survey,
        publicLink: surveyPublicLink,
        targetActive: target?.isActive ?? true,
        questionCount: survey.questions.length,
        eventStructureItem: target?.eventStructureItem,
        locationTimezone: pkg.location.timezone,
        eventTiming: { startsAt: pkg.startDate, endsAt: pkg.endDate, timezone: pkg.location.timezone },
        allowEventTimingFallback: target?.category !== SurveyTargetCategory.SESSION,
      })
      const readinessIssues = target
        ? readiness.issues
        : ['Survey is not assigned', ...readiness.issues]

      return {
        id: surveyPublicLink?.id ?? `${survey.id}:unlinked`,
        surveyId: survey.id,
        targetId: target?.id ?? null,
        publicLinkId: surveyPublicLink?.id ?? null,
        name: survey.name,
        status: survey.status,
        isArchived: target?.isActive === false,
        target,
        publicLink: surveyPublicLink
          ? {
              ...surveyPublicLink,
              kioskPath: publicLinkKioskPath(surveyPublicLink),
            }
          : null,
        availability: readiness.availability,
        readiness: {
          responseEligible: Boolean(target) && readiness.responseEligible,
          issues: Array.from(new Set(readinessIssues)),
        },
        signageConfiguration: readEventSignageVisualConfiguration(survey.settingsJson),
      }
    })
  })

  return {
    surveySource: pkg.surveySource,
    event: {
      id: pkg.id,
      name: pkg.name,
      status: pkg.status,
      eventType: pkg.eventType,
      isActive: pkg.isActive,
      startDate: pkg.startDate,
      endDate: pkg.endDate,
      ttsProvider: pkg.ttsProvider,
      ttsVoice: pkg.ttsVoice,
      ttsLocale: pkg.ttsLocale,
      location: pkg.location,
    },
    surveys,
    deployments,
    target: firstSurvey?.surveyTarget ?? null,
    survey: firstSurvey
      ? {
          id: firstSurvey.id,
          eventId: firstSurvey.eventId,
          surveyTargetId: firstSurvey.surveyTargetId,
          name: firstSurvey.name,
          description: firstSurvey.description,
          collectionPhase: firstSurvey.collectionPhase,
          responseMode: firstSurvey.responseMode,
          status: firstSurvey.status,
          ttsProvider: firstSurvey.ttsProvider,
          ttsVoice: firstSurvey.ttsVoice,
          ttsLocale: firstSurvey.ttsLocale,
          settingsJson: firstSurvey.settingsJson,
          availabilityMode: firstSurvey.availabilityMode,
          availabilityTimezone: firstSurvey.availabilityTimezone,
          availabilityOpensAt: firstSurvey.availabilityOpensAt,
          availabilityClosesAt: firstSurvey.availabilityClosesAt,
          availabilityOpenAnchor: firstSurvey.availabilityOpenAnchor,
          availabilityCloseAnchor: firstSurvey.availabilityCloseAnchor,
          availabilityOpenOffsetMinutes: firstSurvey.availabilityOpenOffsetMinutes,
          availabilityCloseOffsetMinutes: firstSurvey.availabilityCloseOffsetMinutes,
          availabilityOverride: firstSurvey.availabilityOverride,
        }
      : null,
    questions: firstSurvey?.questions ?? [],
    publicLink: publicLink
      ? {
          ...publicLink,
          kioskPath: publicLinkKioskPath(publicLink),
        }
      : null,
  }
}

function normalizeUpdateQuestions(questions: z.infer<typeof updateVoiceSurveySchema>['questions']) {
  if (!questions) return undefined
  const orderedInputs = questions
    .map((question, index) => ({
      question,
      order: typeof question.displayOrder === 'number'
        ? question.displayOrder
        : typeof question.order === 'number'
          ? question.order
          : index,
    }))
    .sort((left, right) => left.order - right.order)
  const normalized = normalizeMixedQuestions(orderedInputs.map(({ question, order }) => ({
      id: question.id?.trim(),
      key: question.key?.trim(),
      prompt: (question.prompt ?? question.text ?? '').trim(),
      type: question.type,
      required: question.required ?? true,
      order,
    })))
  return normalized.map((question, index) => ({
    ...question,
    responseTarget: orderedInputs[index]?.question.responseTarget ?? QuestionResponseTarget.GENERAL,
  }))
}

function stableQuestionKey(surveyId: string, existingKeys: Set<string>, index: number) {
  const base = `survey-${surveyId.slice(-8)}-q${index + 1}`
  let key = base
  let suffix = 1
  while (existingKeys.has(key)) {
    suffix += 1
    key = `${base}-${suffix}`
  }
  existingKeys.add(key)
  return key
}

async function getVoiceSurveys(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  const eventId = params.eventId?.trim()
  if (!eventId) {
    return NextResponse.json({ success: false, error: 'eventId is required' }, { status: 400 })
  }

  const pkg = await loadEventSurveyWorkspacePackage(eventId, admin.account.id)
  if (!pkg) {
    return NextResponse.json({ success: false, error: 'Event voice survey not found or access denied' }, { status: 404 })
  }

  try {
    requireEventsAccountType(
      pkg.location.account.accountType,
      'Event voice surveys are only available for EVENTS accounts',
    )
  } catch (error) {
    if (error instanceof AccountProductModeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    throw error
  }

  return NextResponse.json({
    success: true,
    data: serializeVoiceSurveyPackage(pkg),
  })
}

export function GET(request: NextRequest, context: { params: { eventId: string } }) {
  return withDevelopmentRouteTiming(
    {
      route: '/api/app/events/[eventId]/voice-surveys',
      account: request.nextUrl?.searchParams.get('account') ?? (request.url ? new URL(request.url).searchParams.get('account') : null),
      eventId: context.params.eventId,
    },
    () => getVoiceSurveys(request, context),
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  const eventId = params.eventId?.trim()
  if (!eventId) {
    return NextResponse.json({ success: false, error: 'eventId is required' }, { status: 400 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createVoiceSurveySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        message: parsed.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', '),
      },
      { status: 400 },
    )
  }

  if (!parsed.data.sessionIds && !parsed.data.surveyTargetId && !parsed.data.eventStructureItemId && !parsed.data.speakerId && (!parsed.data.targetCategory || !parsed.data.targetName)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        message: 'targetCategory and targetName are required when eventStructureItemId is not provided',
      },
      { status: 400 },
    )
  }

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      location: {
        accountId: admin.account.id,
      },
    },
    select: {
      id: true,
      ttsProvider: true,
      ttsVoice: true,
      ttsLocale: true,
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
  })

  if (!event) {
    return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 })
  }

  try {
    requireEventsAccountType(
      event.location.account.accountType,
      'Event voice surveys are only available for EVENTS accounts',
    )
  } catch (error) {
    if (error instanceof AccountProductModeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    throw error
  }

  try {
    const nextTtsProvider = parsed.data.ttsProvider?.trim().toLowerCase() ?? event.ttsProvider
    const nextTtsVoice = parsed.data.ttsVoice?.trim() ?? event.ttsVoice
    const nextTtsLocale = deriveLocaleFromVoice(
      nextTtsVoice,
      parsed.data.ttsLocale?.trim() ?? event.ttsLocale,
    )

    const surveyInput = {
      eventId,
      collectionPhase: parsed.data.collectionPhase,
      creationRequestId: parsed.data.creationRequestId,
      surveyTargetId: parsed.data.surveyTargetId,
      eventStructureItemId: parsed.data.eventStructureItemId,
      speakerId: parsed.data.speakerId,
      targetCategory: parsed.data.targetCategory,
      targetName: parsed.data.targetName,
      targetDescription: parsed.data.targetDescription,
      targetMetadata: parsed.data.targetMetadata,
      locationId: parsed.data.locationId,
      surveyName: parsed.data.surveyName,
      surveyDescription: parsed.data.surveyDescription,
      ttsProvider: nextTtsProvider,
      ttsVoice: nextTtsVoice,
      ttsLocale: nextTtsLocale,
      responseMode: parsed.data.responseMode,
      availability: parsed.data.availability,
      questions: parsed.data.questions.map((question) => ({
        prompt: question.prompt,
        helperText: question.helperText,
        type: question.type,
        responseTarget: question.responseTarget,
        required: question.required,
        order: question.displayOrder,
      })),
    }
    const result = parsed.data.sessionIds
      ? await createBulkSurveyConfigurationForSessions({
          accountId: admin.account.id,
          eventId,
          sessionIds: parsed.data.sessionIds,
          survey: surveyInput,
        })
      : await createEventVoiceSurvey(surveyInput)

    return NextResponse.json(
      {
        success: true,
        data: {
          target: result.target,
          survey: result.survey,
          questions: result.questions,
          questionAudioStatus: result.questionAudioStatus,
          publicLink: {
            ...result.publicLink,
            kioskPath: buildKioskTokenPath(result.publicLink.token),
          },
          ...('counts' in result ? { counts: result.counts } : {}),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create voice survey'
    const status =
      error instanceof AccountProductModeError
        ? error.status
        : error instanceof EventAgendaServiceError
          ? error.status
        : error instanceof SurveyAvailabilityValidationError || (error instanceof Error && error.name === 'SurveyAvailabilityValidationError')
          ? 400
        : (
            message === 'Target location must belong to the same account as the event' ||
            message.includes('question') ||
            message.includes('required')
          )
          ? 400
          : message.includes('not found')
            ? 404
            : 500

    console.error('[POST /api/app/events/[eventId]/voice-surveys]', error)
    return NextResponse.json({ success: false, error: message }, { status })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  const eventId = params.eventId?.trim()
  if (!eventId) {
    return NextResponse.json({ success: false, error: 'eventId is required' }, { status: 400 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updateVoiceSurveySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        message: parsed.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', '),
      },
      { status: 400 },
    )
  }

  const existing = await loadEventSurveyWorkspacePackage(eventId, admin.account.id)
  if (!existing || existing.surveys.length === 0) {
    return NextResponse.json({ success: false, error: 'Event voice survey not found or access denied' }, { status: 404 })
  }

  try {
    requireEventsAccountType(
      existing.location.account.accountType,
      'Event voice survey editing is only available for EVENTS accounts',
    )
  } catch (error) {
    if (error instanceof AccountProductModeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    throw error
  }

  const requestedSurveyId = parsed.data.surveyId?.trim()
  const currentSurvey = requestedSurveyId
    ? existing.surveys.find((survey) => survey.id === requestedSurveyId)
    : existing.surveys[0]

  if (!currentSurvey) {
    return NextResponse.json({ success: false, error: 'Survey not found in this event' }, { status: 404 })
  }

  if (typeof parsed.data.archived === 'boolean') {
    try {
      if (parsed.data.archived) {
        await archiveEventVoiceSurvey({
          eventId,
          accountId: admin.account.id,
          surveyId: currentSurvey.id,
        })
      } else {
        await restoreArchivedEventVoiceSurvey({
          eventId,
          accountId: admin.account.id,
          surveyId: currentSurvey.id,
        })
      }
    } catch (error) {
      if (error instanceof EventVoiceSurveyLifecycleError || error instanceof AccountProductModeError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status })
      }
      throw error
    }

    const reloadedAfterArchive = await loadEventSurveyWorkspacePackage(eventId, admin.account.id)
    if (!reloadedAfterArchive) {
      return NextResponse.json({ success: false, error: 'Event voice survey not found after update' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: serializeVoiceSurveyPackage(reloadedAfterArchive),
    })
  }

  if (parsed.data.status) {
    if (parsed.data.status !== EventStatus.ACTIVE && parsed.data.status !== EventStatus.DRAFT) {
      return NextResponse.json({ success: false, error: 'Only ACTIVE and DRAFT survey status updates are supported' }, { status: 400 })
    }

    try {
      if (parsed.data.status === EventStatus.ACTIVE) {
        await activateEventVoiceSurvey({
          eventId,
          accountId: admin.account.id,
          surveyId: currentSurvey.id,
        })
      } else {
        await unpublishEventVoiceSurvey({
          eventId,
          accountId: admin.account.id,
          surveyId: currentSurvey.id,
        })
      }
    } catch (error) {
      if (error instanceof EventVoiceSurveyLifecycleError || error instanceof AccountProductModeError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status })
      }
      throw error
    }

    const reloadedAfterActivation = await loadEventSurveyWorkspacePackage(eventId, admin.account.id)
    if (!reloadedAfterActivation) {
      return NextResponse.json({ success: false, error: 'Event voice survey not found after update' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: serializeVoiceSurveyPackage(reloadedAfterActivation),
    })
  }

  const currentSurveyTarget = currentSurvey.surveyTarget
  if (!currentSurveyTarget) {
    return NextResponse.json({ success: false, error: 'Event voice survey target is missing' }, { status: 400 })
  }

  if (!currentSurvey.publicSurveyLinks[0]) {
    return NextResponse.json({ success: false, error: 'Event voice survey public link is missing' }, { status: 400 })
  }

  let normalizedQuestions
  let normalizedAvailability
  try {
    normalizedQuestions = normalizeUpdateQuestions(parsed.data.questions)
    normalizedAvailability = parsed.data.availability
      ? normalizeSurveyAvailabilityInput(parsed.data.availability)
      : undefined
    if (normalizedQuestions) {
      assertQuestionTypesMutable(currentSurvey.questions, normalizedQuestions, currentSurvey._count.responses)
      const hasPresenterRating = normalizedQuestions.some((question) => question.responseTarget === QuestionResponseTarget.SPEAKERS)
      if (hasPresenterRating && currentSurveyTarget.category !== SurveyTargetCategory.SESSION) {
        throw new MixedSurveyValidationError('Presenter ratings are only available for session surveys')
      }
      if (normalizedQuestions.some((question) => question.responseTarget === QuestionResponseTarget.SPEAKERS && question.type !== QuestionType.RATING_1_TO_5)) {
        throw new MixedSurveyValidationError('Only 1–5 rating questions can target presenters')
      }
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Invalid questions' },
      { status: error instanceof MixedSurveyValidationError ? error.status : 400 },
    )
  }

  const nextTtsProvider = parsed.data.ttsProvider?.trim().toLowerCase() ?? currentSurvey.ttsProvider ?? existing.ttsProvider
  const nextTtsVoice = parsed.data.ttsVoice?.trim() ?? currentSurvey.ttsVoice ?? existing.ttsVoice
  const nextTtsLocale = deriveLocaleFromVoice(
    nextTtsVoice,
    parsed.data.ttsLocale?.trim() ?? currentSurvey.ttsLocale ?? existing.ttsLocale,
  )
  const audioSettingsChanged =
    nextTtsProvider !== (currentSurvey.ttsProvider ?? existing.ttsProvider) ||
    nextTtsVoice !== (currentSurvey.ttsVoice ?? existing.ttsVoice) ||
    nextTtsLocale !== (currentSurvey.ttsLocale ?? existing.ttsLocale)
  const questionTextById = new Map(currentSurvey.questions.map((question) => [question.id, question.label]))
  const questionsChanged = Boolean(
    normalizedQuestions &&
      (normalizedQuestions.length !== currentSurvey.questions.length ||
        normalizedQuestions.some((question, index) => {
          const existingQuestion = question.id ? questionTextById.get(question.id) : null
          return existingQuestion !== question.prompt || currentSurvey.questions[index]?.id !== question.id
        })),
  )

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.eventName ? { name: parsed.data.eventName.trim() } : {}),
      },
    })

    const survey = await tx.survey.update({
      where: { id: currentSurvey.id },
      data: {
        ...(parsed.data.surveyName ? { name: parsed.data.surveyName.trim() } : {}),
        ...(parsed.data.surveyDescription !== undefined
          ? { description: parsed.data.surveyDescription || null }
          : {}),
        ttsProvider: nextTtsProvider,
        ttsVoice: nextTtsVoice,
        ttsLocale: nextTtsLocale,
        ...(parsed.data.responseMode ? { responseMode: parsed.data.responseMode } : {}),
        ...(parsed.data.collectionPhase ? { collectionPhase: parsed.data.collectionPhase } : {}),
        ...(normalizedAvailability ?? {}),
      },
    })

    const target = await tx.surveyTarget.update({
      where: { id: currentSurveyTarget.id },
      data: {
        ...(parsed.data.targetName ? { name: parsed.data.targetName.trim() } : {}),
      },
    })

    if (normalizedQuestions) {
      await Promise.all(
        currentSurvey.questions.map((question, index) =>
          tx.question.update({
            where: { id: question.id },
            data: { order: -1000 - index },
          }),
        ),
      )

      const existingById = new Map(currentSurvey.questions.map((question) => [question.id, question]))
      const existingByKey = new Map(currentSurvey.questions.map((question) => [question.key, question]))
      const retainedQuestionIds = new Set<string>()
      const usedKeys = new Set(currentSurvey.questions.map((question) => question.key))

      for (const [index, question] of normalizedQuestions.entries()) {
        const existingQuestion = (question.id && existingById.get(question.id)) || (question.key && existingByKey.get(question.key))
        if (existingQuestion) {
          retainedQuestionIds.add(existingQuestion.id)
          await tx.question.update({
            where: { id: existingQuestion.id },
            data: {
              label: question.prompt,
              type: question.type,
              responseTarget: question.responseTarget,
              order: index,
              required: question.required,
            },
          })
        } else {
          await tx.question.create({
            data: {
              eventId: existing.id,
              surveyId: survey.id,
              key: stableQuestionKey(survey.id, usedKeys, index),
              label: question.prompt,
              ttsText: null,
              type: question.type,
              responseTarget: question.responseTarget,
              order: index,
              required: question.required,
            },
          })
        }
      }

      const deleteIds = currentSurvey.questions
        .filter((question) => !retainedQuestionIds.has(question.id))
        .map((question) => question.id)

      if (deleteIds.length > 0) {
        await tx.question.deleteMany({
          where: {
            id: { in: deleteIds },
          },
        })
      }
    }

    return { event, survey, target }
  })

  if (updated.survey.responseMode !== ResponseMode.TEXT_ONLY && (audioSettingsChanged || questionsChanged)) {
    await ensureSurveyQuestionAudioForSurvey(currentSurvey.id, {
      provider: nextTtsProvider,
      voice: nextTtsVoice,
      locale: nextTtsLocale,
    })
  }

  const reloaded = await loadEventSurveyWorkspacePackage(eventId, admin.account.id)
  if (!reloaded || reloaded.surveys.length === 0) {
    return NextResponse.json({ success: false, error: 'Event voice survey not found after update' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: serializeVoiceSurveyPackage(reloaded),
    updated,
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  const eventId = params.eventId?.trim()
  if (!eventId) {
    return NextResponse.json({ success: false, error: 'eventId is required' }, { status: 400 })
  }

  let rawBody: unknown = {}
  try {
    rawBody = await request.json()
  } catch {
    rawBody = { surveyId: request.nextUrl.searchParams.get('surveyId') }
  }

  const parsed = deleteVoiceSurveySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        message: parsed.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', '),
      },
      { status: 400 },
    )
  }

  try {
    await deleteEventVoiceSurvey({
      eventId,
      accountId: admin.account.id,
      surveyId: parsed.data.surveyId,
    })
  } catch (error) {
    if (error instanceof EventVoiceSurveyLifecycleError || error instanceof AccountProductModeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    throw error
  }

  const reloaded = await loadEventSurveyWorkspacePackage(eventId, admin.account.id)
  if (!reloaded) {
    return NextResponse.json({ success: false, error: 'Event voice survey not found after delete' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: serializeVoiceSurveyPackage(reloaded),
  })
}
