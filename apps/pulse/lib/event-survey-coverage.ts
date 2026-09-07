import {
  EventStatus,
  EventStructureItemKind,
  EventType,
  QuestionType,
  SurveyAvailabilityOverride,
  SurveyTargetCategory,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { randomBytes, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { EventAgendaServiceError, requireAgendaEventScope } from '@/lib/event-agenda-service'
import {
  createEventStructureItem,
  deleteEventStructureItem,
  updateEventStructureItem,
} from '@/lib/event-structure'
import { isPlannerManagedSurveyTarget } from '@/lib/event-survey-scope'
import { bulkAssignExistingSurvey } from '@/lib/event-listening-plan'
import { isEventSurveyDeploymentLaunchable } from '@/lib/event-survey-deployment-lifecycle'
import {
  reconcileAdvancedSurveyAssignments,
  saveAdvancedEventSurveyDraft,
  type AdvancedSurveyAssignmentSpec,
} from '@/lib/advanced-event-survey-builder'

type CoverageDb = PrismaClient
type CoverageTx = Prisma.TransactionClient

export type SurveyCoverageTargetKind = 'OVERALL_EVENT' | 'SESSION' | 'SPEAKER' | 'EVENT_AREA' | 'CUSTOM'
type StructureCoverageTargetKind = 'OVERALL_EVENT' | 'SESSION' | 'EVENT_AREA'

export class EventSurveyCoverageError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'EventSurveyCoverageError'
  }
}

function coverageError(message: string, status: number, code: string, details?: unknown) {
  return new EventSurveyCoverageError(message, status, code, details)
}

function publicPath(token: string) {
  return `/kiosk?token=${encodeURIComponent(token)}`
}

const surveySelect = {
  id: true,
  name: true,
  status: true,
  responseMode: true,
  availabilityOverride: true,
  _count: { select: { questions: true, responses: true } },
} satisfies Prisma.SurveySelect

function isDetachedDeploymentLink(link: { metadata?: unknown }) {
  if (!link.metadata || typeof link.metadata !== 'object' || Array.isArray(link.metadata)) return false
  const metadata = link.metadata as Record<string, unknown>
  return metadata.detached === true || metadata.assignmentState === 'SUPERSEDED'
}

function advancedAssignmentMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const assignment = (metadata as Record<string, unknown>).advancedAssignment
  return assignment && typeof assignment === 'object' && !Array.isArray(assignment)
    ? assignment as Record<string, unknown>
    : null
}

export function advancedAssignmentForSurveyDeployment(input: {
  surveyId: string
  kind: SurveyCoverageTargetKind
  targetIds?: string[]
  customKey?: string
  customName?: string
}): AdvancedSurveyAssignmentSpec {
  if (input.kind === 'OVERALL_EVENT') return { kind: 'EVENT', selection: 'SELECTED' }
  if (input.kind === 'CUSTOM') {
    return {
      kind: 'CUSTOM',
      selection: 'SELECTED',
      customKey: input.customKey?.trim() || input.surveyId,
      customName: input.customName?.trim(),
    }
  }
  return {
    kind: input.kind === 'EVENT_AREA' ? 'LOCATION' : input.kind,
    selection: 'SELECTED',
    targetIds: input.targetIds,
  }
}

function serializeAttachment(target: any | null) {
  if (!target) return null
  const link = target.publicSurveyLinks?.find((current: { metadata?: unknown }) => !isDetachedDeploymentLink(current)) ?? null
  if (!link?.survey) return null
  return {
    targetId: target.id as string,
    survey: link.survey,
    publicLink: {
      id: link.id as string,
      isActive: link.isActive as boolean,
      kioskPath: publicPath(link.token as string),
    },
  }
}

/**
 * Canonical, event-scoped coverage view used by the TEMPLATE Surveys workspace.
 * Attachment state comes from target-scoped PublicSurveyLinks, including bulk
 * reuse, instead of being reconstructed from client-side survey names.
 */
export async function getEventSurveyCoverage(
  input: { accountId: string; eventId: string },
  db: CoverageDb = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const [event, structureItems, rawTargets, surveyConfigurations, speakerProfiles] = await Promise.all([
    db.event.findUniqueOrThrow({
      where: { id: scope.eventId },
      select: { id: true, name: true, eventType: true },
    }),
    db.eventStructureItem.findMany({
      where: {
        eventId: scope.eventId,
        isActive: true,
        kind: { in: [EventStructureItemKind.EVENT, EventStructureItemKind.SESSION, EventStructureItemKind.AREA, EventStructureItemKind.SPONSOR_ACTIVATION] },
      },
      select: {
        id: true,
        kind: true,
        name: true,
        description: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        metadata: true,
        sortOrder: true,
      },
      orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.surveyTarget.findMany({
      where: {
        eventId: scope.eventId,
        isActive: true,
        category: { in: [SurveyTargetCategory.EVENT, SurveyTargetCategory.SESSION, SurveyTargetCategory.SPEAKER, SurveyTargetCategory.LOCATION, SurveyTargetCategory.CUSTOM] },
      },
      select: {
        id: true,
        name: true,
        category: true,
        eventStructureItemId: true,
        speakerAssignmentId: true,
        speakerId: true,
        metadata: true,
        createdAt: true,
        publicSurveyLinks: {
          where: { survey: { status: { not: EventStatus.ARCHIVED } } },
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            token: true,
            isActive: true,
            metadata: true,
            survey: { select: surveySelect },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.survey.findMany({
      where: {
        eventId: scope.eventId,
        status: { not: EventStatus.ARCHIVED },
        // A Survey's owning target records where it was authored, not the
        // only target where it can collect feedback. Reuse is represented by
        // target-scoped PublicSurveyLinks, so an Overall Event or Event Area
        // survey remains available to any compatible session in this event.
        OR: [
          { surveyTargetId: null },
          {
            surveyTarget: {
              category: { in: [SurveyTargetCategory.EVENT, SurveyTargetCategory.SESSION, SurveyTargetCategory.SPEAKER, SurveyTargetCategory.LOCATION, SurveyTargetCategory.CUSTOM] },
            },
          },
        ],
      },
      select: surveySelect,
      orderBy: { name: 'asc' },
    }),
    db.eventSpeakerProfile.findMany({
      where: {
        accountId: input.accountId,
        isArchived: false,
        sessionAssignments: { some: { eventId: scope.eventId } },
      },
      select: { id: true, name: true, title: true, organization: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const targets = rawTargets.filter(isPlannerManagedSurveyTarget)
  const linksBySurveyId = new Map<string, Array<{
    id: string
    category: SurveyTargetCategory
    eventStructureItemId: string | null
    speakerId: string | null
    targetName: string
    isActive: boolean
    kioskPath: string
    metadata: unknown
  }>>()
  for (const target of targets) {
    for (const link of target.publicSurveyLinks) {
      if (isDetachedDeploymentLink(link)) continue
      const current = linksBySurveyId.get(link.survey.id) ?? []
      current.push({
        id: link.id,
        category: target.category,
        eventStructureItemId: target.eventStructureItemId,
        speakerId: target.speakerId,
        targetName: target.name,
        isActive: link.isActive,
        kioskPath: publicPath(link.token),
        metadata: target.metadata,
      })
      linksBySurveyId.set(link.survey.id, current)
    }
  }
  const targetFor = (structureItemId: string, category: SurveyTargetCategory) => {
    const matches = targets.filter((target) => target.eventStructureItemId === structureItemId && target.category === category)
    return matches.find((target) => target.publicSurveyLinks.some((link) => !isDetachedDeploymentLink(link))) ?? matches[0] ?? null
  }
  const overallTarget = targets.find((target) => target.category === SurveyTargetCategory.EVENT && target.publicSurveyLinks.some((link) => !isDetachedDeploymentLink(link)))
    ?? targets.find((target) => target.category === SurveyTargetCategory.EVENT)
    ?? null

  const sessions = structureItems.filter((item) => item.kind === EventStructureItemKind.SESSION).map((session) => ({
    id: session.id,
    name: session.name,
    startsAt: session.startsAt?.toISOString() ?? null,
    endsAt: session.endsAt?.toISOString() ?? null,
    timezone: session.timezone,
    room: session.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
      ? String((session.metadata as Record<string, unknown>).room ?? '') || null
      : null,
    surveyIds: targets.filter((target) => target.eventStructureItemId === session.id && target.category === SurveyTargetCategory.SESSION).flatMap((target) => target.publicSurveyLinks.filter((link) => !isDetachedDeploymentLink(link)).map((link) => link.survey.id)),
    attachment: serializeAttachment(targetFor(session.id, SurveyTargetCategory.SESSION)),
  }))
  const eventAreas = structureItems.filter((item) => item.kind === EventStructureItemKind.AREA || item.kind === EventStructureItemKind.SPONSOR_ACTIVATION).map((area) => ({
    id: area.id,
    name: area.name,
    description: area.description,
    surveyIds: targets.filter((target) => target.eventStructureItemId === area.id && target.category === SurveyTargetCategory.LOCATION).flatMap((target) => target.publicSurveyLinks.filter((link) => !isDetachedDeploymentLink(link)).map((link) => link.survey.id)),
    attachment: serializeAttachment(targetFor(area.id, SurveyTargetCategory.LOCATION)),
  }))
  const speakers = speakerProfiles.map((speaker) => ({
    ...speaker,
    surveyIds: targets.filter((target) => target.category === SurveyTargetCategory.SPEAKER && target.speakerId === speaker.id)
      .flatMap((target) => target.publicSurveyLinks.filter((link) => !isDetachedDeploymentLink(link)).map((link) => link.survey.id)),
  }))

  return {
    event,
    overallEvent: {
      name: 'Overall Event',
      attachment: serializeAttachment(overallTarget),
    },
    sessions,
    speakers,
    eventAreas,
    surveyConfigurations: surveyConfigurations.map((survey) => ({
      id: survey.id,
      name: survey.name,
      status: survey.status,
      responseMode: survey.responseMode,
      // This is a compatibility value consumed by the existing session
      // survey-library picker. It deliberately describes where the survey
      // can be reused, rather than its original authoring target.
      targetType: 'SESSION' as const,
      questionCount: survey._count.questions,
      eventId: event.id,
      eventName: event.name,
    })),
    surveyDeployments: surveyConfigurations.map((survey) => {
      const links = linksBySurveyId.get(survey.id) ?? []
      const currentLink = links.find((link) => link.isActive) ?? links[0] ?? null
      const primaryAssignment = describeSurveyAssignment(links)
      return {
        id: survey.id,
        name: survey.name,
        status: survey.status,
        isPaused: survey.availabilityOverride === SurveyAvailabilityOverride.FORCE_CLOSED,
        needsContext: survey.status === EventStatus.DRAFT && (survey._count.questions === 0 || links.length === 0),
        questionCount: survey._count.questions,
        responseCount: survey._count.responses,
        assignment: primaryAssignment,
        publicLink: currentLink ? {
          id: currentLink.id,
          kioskPath: currentLink.kioskPath,
          isActive: currentLink.isActive,
        } : null,
        deployment: {
          overallEvent: links.some((link) => link.category === SurveyTargetCategory.EVENT),
          sessionCount: links.filter((link) => link.category === SurveyTargetCategory.SESSION).length,
          speakerCount: links.filter((link) => link.category === SurveyTargetCategory.SPEAKER).length,
          eventAreaCount: links.filter((link) => link.category === SurveyTargetCategory.LOCATION).length,
          customCount: links.filter((link) => link.category === SurveyTargetCategory.CUSTOM).length,
          customName: links.find((link) => link.category === SurveyTargetCategory.CUSTOM)?.targetName ?? null,
          customKey: (() => {
            const assignment = advancedAssignmentMetadata(links.find((link) => link.category === SurveyTargetCategory.CUSTOM)?.metadata)
            return typeof assignment?.customKey === 'string' ? assignment.customKey : null
          })(),
        },
      }
    }),
    summary: {
      surveyCount: surveyConfigurations.length,
      sessionCount: sessions.length,
      sessionsWithSurveys: sessions.filter((session) => session.attachment).length,
      eventAreaCount: eventAreas.length,
      eventAreasWithSurveys: eventAreas.filter((area) => area.attachment).length,
      speakerCount: speakers.length,
      overallEventHasSurvey: Boolean(serializeAttachment(overallTarget)),
    },
  }
}

function describeSurveyAssignment(links: Array<{
  category: SurveyTargetCategory
  targetName: string
}>) {
  if (links.length === 0) return { kind: 'UNASSIGNED' as const, label: 'Unassigned' }
  const first = links[0]
  const sameKind = links.filter((link) => link.category === first.category)
  const multiple = sameKind.length > 1
  if (first.category === SurveyTargetCategory.EVENT) return { kind: 'EVENT' as const, label: 'Event-wide' }
  if (first.category === SurveyTargetCategory.SESSION) return { kind: 'SESSION' as const, label: multiple ? `Sessions · ${sameKind.length} selected` : `Session · ${first.targetName}` }
  if (first.category === SurveyTargetCategory.SPEAKER) return { kind: 'SPEAKER' as const, label: multiple ? `Speakers · ${sameKind.length} selected` : `Speaker · ${first.targetName}` }
  if (first.category === SurveyTargetCategory.LOCATION) return { kind: 'AREA' as const, label: multiple ? `Areas · ${sameKind.length} selected` : `Area · ${first.targetName}` }
  return { kind: 'CUSTOM' as const, label: multiple ? `Custom · ${sameKind.length} selected` : `Custom · ${first.targetName}` }
}

/** Persists the canonical availability override without changing a public link or assignment. */
export async function setAdvancedSurveyCollectionState(
  input: { accountId: string; eventId: string; surveyId: string; paused: boolean },
  db: CoverageDb = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  if (scope.eventType !== EventType.ADVANCED) {
    throw coverageError('Collection controls are only available for Advanced Events', 409, 'COLLECTION_STATE_NOT_SUPPORTED')
  }
  const survey = await db.survey.findFirst({
    where: { id: input.surveyId.trim(), eventId: scope.eventId, status: EventStatus.ACTIVE },
    select: { id: true },
  })
  if (!survey) throw coverageError('Survey was not found in this event', 404, 'SURVEY_NOT_FOUND')
  return db.survey.update({
    where: { id: survey.id },
    data: { availabilityOverride: input.paused ? SurveyAvailabilityOverride.FORCE_CLOSED : null },
    select: { id: true, availabilityOverride: true },
  })
}

function copiedChoiceOptions(configuration: Prisma.JsonValue | null) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return []
  const options = (configuration as { options?: unknown }).options
  return Array.isArray(options) ? options.filter((option): option is string => typeof option === 'string') : []
}

/**
 * Copies only an Advanced survey definition into a new unassigned draft.
 * It deliberately delegates creation to the canonical builder draft service,
 * which means no targets, public links, responses, or analytics are copied.
 */
export async function duplicateAdvancedSurvey(
  input: { accountId: string; eventId: string; surveyId: string },
  db: CoverageDb = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  if (scope.eventType !== EventType.ADVANCED) {
    throw coverageError('Duplicating here is only available for Advanced Events', 409, 'DUPLICATE_NOT_SUPPORTED')
  }
  const source = await db.survey.findFirst({
    where: { id: input.surveyId.trim(), eventId: scope.eventId, status: { not: EventStatus.ARCHIVED } },
    select: {
      id: true,
      name: true,
      description: true,
      responseMode: true,
      presentationMode: true,
      ttsVoice: true,
      availabilityMode: true,
      availabilityTimezone: true,
      availabilityOpensAt: true,
      availabilityClosesAt: true,
      availabilityOpenAnchor: true,
      availabilityCloseAnchor: true,
      availabilityOpenOffsetMinutes: true,
      availabilityCloseOffsetMinutes: true,
      availabilityOverride: true,
      questions: {
        orderBy: { order: 'asc' },
        select: { id: true, label: true, type: true, required: true, configurationJson: true },
      },
    },
  })
  if (!source) throw coverageError('Survey was not found in this event', 404, 'SURVEY_NOT_FOUND')
  const creationRequestId = randomUUID()
  return saveAdvancedEventSurveyDraft({
    accountId: input.accountId,
    eventId: scope.eventId,
    creationRequestId,
    name: `${source.name} copy`,
    description: source.description,
    responseMode: source.responseMode,
    presentationMode: source.presentationMode,
    ttsVoice: source.ttsVoice,
    // A draft has no assignment. Session-relative availability cannot be
    // copied safely until its new session is chosen, so retain the builder's
    // default availability in that one case.
    availability: source.availabilityMode === 'RELATIVE_TO_EVENT_AREA' ? undefined : {
      mode: source.availabilityMode,
      timezone: source.availabilityTimezone,
      opensAt: source.availabilityOpensAt?.toISOString() ?? null,
      closesAt: source.availabilityClosesAt?.toISOString() ?? null,
      openAnchor: source.availabilityOpenAnchor,
      closeAnchor: source.availabilityCloseAnchor,
      openOffsetMinutes: source.availabilityOpenOffsetMinutes,
      closeOffsetMinutes: source.availabilityCloseOffsetMinutes,
      override: source.availabilityOverride,
    },
    questions: source.questions.map((question, index) => ({
      id: `${question.id}-${index + 1}`,
      text: question.label,
      type: question.type as QuestionType,
      required: question.required,
      options: copiedChoiceOptions(question.configurationJson),
    })),
  }, db)
}

export async function setEventSurveyDeployment(input: {
  accountId: string
  eventId: string
  surveyId: string
  kind: SurveyCoverageTargetKind
  structureItemIds?: unknown
  customKey?: string
  customName?: string
}, db: CoverageDb = prisma) {
  const scope = await requireAgendaEventScope(input, db)
  const surveyId = input.surveyId.trim()
  const requestedIds = input.kind === 'OVERALL_EVENT'
    ? []
    : Array.from(new Set(Array.isArray(input.structureItemIds) ? input.structureItemIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()) : []))

  if (scope.eventType === EventType.ADVANCED) {
    return reconcileAdvancedSurveyAssignments({
      accountId: input.accountId,
      eventId: scope.eventId,
      surveyId,
      assignments: [advancedAssignmentForSurveyDeployment({
        surveyId,
        kind: input.kind,
        targetIds: requestedIds,
        customKey: input.customKey,
        customName: input.customName,
      })],
    }, db)
  }
  if (input.kind === 'SPEAKER' || input.kind === 'CUSTOM') {
    throw coverageError('This assignment kind is only available for Advanced Events', 409, 'ASSIGNMENT_KIND_NOT_SUPPORTED')
  }
  const structureKind: StructureCoverageTargetKind = input.kind

  return db.$transaction(async (tx) => {
    const survey = await tx.survey.findFirst({
      where: { id: surveyId, eventId: scope.eventId, status: { not: EventStatus.ARCHIVED } },
      select: { id: true, status: true, _count: { select: { questions: true } } },
    })
    if (!survey) throw coverageError('Survey was not found in this event', 404, 'SURVEY_NOT_FOUND')
    if (survey._count.questions < 1) throw coverageError('Survey must include at least one question before deployment', 409, 'SURVEY_HAS_NO_QUESTIONS')

    const category = input.kind === 'OVERALL_EVENT'
      ? SurveyTargetCategory.EVENT
      : input.kind === 'SESSION'
        ? SurveyTargetCategory.SESSION
        : SurveyTargetCategory.LOCATION
    const requestedTargets = input.kind === 'OVERALL_EVENT'
      ? [await ensureStructureTarget(tx, { eventId: scope.eventId, kind: 'OVERALL_EVENT' })]
      : await Promise.all(requestedIds.map((structureItemId) => ensureStructureTarget(tx, {
          eventId: scope.eventId,
          kind: structureKind,
          structureItemId,
        })))
    const requestedTargetIds = new Set(requestedTargets.map((target) => target.id))
    const existingLinks = await tx.publicSurveyLink.findMany({
      where: {
        surveyId: survey.id,
        surveyTarget: { eventId: scope.eventId, category },
      },
      select: { id: true, surveyTargetId: true, isActive: true, metadata: true },
    })
    const existingTargetIds = new Set(existingLinks.map((link) => link.surveyTargetId).filter((id): id is string => Boolean(id)))
    const staleLinkIds = existingLinks.filter((link) => !link.surveyTargetId || !requestedTargetIds.has(link.surveyTargetId)).map((link) => link.id)
    const retainedInactiveLinkIds = existingLinks.filter((link) => link.surveyTargetId && requestedTargetIds.has(link.surveyTargetId) && !link.isActive).map((link) => link.id)
    const newTargets = requestedTargets.filter((target) => !existingTargetIds.has(target.id))
    if (staleLinkIds.length) await tx.publicSurveyLink.updateMany({
      where: { id: { in: staleLinkIds } },
      data: { isActive: false, metadata: { assignmentSource: 'SURVEY_DEPLOYMENT', detached: true } },
    })
    if (retainedInactiveLinkIds.length) await tx.publicSurveyLink.updateMany({
      where: { id: { in: retainedInactiveLinkIds } },
      data: { isActive: isEventSurveyDeploymentLaunchable(survey.status), metadata: { assignmentSource: 'SURVEY_DEPLOYMENT' } },
    })
    if (newTargets.length) await tx.publicSurveyLink.createMany({
      data: newTargets.map((target) => ({
        surveyId: survey.id,
        surveyTargetId: target.id,
        token: randomBytes(18).toString('base64url'),
        isActive: isEventSurveyDeploymentLaunchable(survey.status),
        metadata: { assignmentSource: 'SURVEY_DEPLOYMENT', targetCategory: category },
      })),
      skipDuplicates: true,
    })
    return {
      counts: {
        requested: requestedTargets.length,
        attached: newTargets.length,
        alreadyAttached: requestedTargets.length - newTargets.length,
        detached: staleLinkIds.length,
      },
      targetIds: [...requestedTargetIds],
    }
  })
}

async function ensureStructureTarget(
  tx: CoverageTx,
  input: { eventId: string; kind: StructureCoverageTargetKind; structureItemId?: string },
) {
  let structureItem: {
    id: string
    name: string
    description: string | null
    locationId: string | null
    metadata: Prisma.JsonValue | null
  }
  let category: SurveyTargetCategory

  if (input.kind === 'OVERALL_EVENT') {
    category = SurveyTargetCategory.EVENT
    const existingOverallTarget = (await tx.surveyTarget.findMany({
      where: { eventId: input.eventId, category, speakerAssignmentId: null, speakerId: null },
      orderBy: { createdAt: 'asc' },
    })).filter(isPlannerManagedSurveyTarget)[0]
    let overallItem = existingOverallTarget?.eventStructureItemId
      ? await tx.eventStructureItem.findFirst({
          where: { id: existingOverallTarget.eventStructureItemId, eventId: input.eventId, kind: EventStructureItemKind.EVENT },
          select: { id: true, name: true, description: true, locationId: true, metadata: true },
        })
      : null
    overallItem ??= await tx.eventStructureItem.findFirst({
      where: { eventId: input.eventId, kind: EventStructureItemKind.EVENT, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, description: true, locationId: true, metadata: true },
    })
    overallItem ??= await tx.eventStructureItem.upsert({
      where: { eventId_slug: { eventId: input.eventId, slug: 'overall-event' } },
      create: { eventId: input.eventId, kind: EventStructureItemKind.EVENT, name: 'Overall Event', slug: 'overall-event', isActive: true },
      update: { isActive: true },
      select: { id: true, name: true, description: true, locationId: true, metadata: true },
    })
    structureItem = overallItem
  } else {
    const structureItemId = input.structureItemId?.trim()
    if (!structureItemId) throw coverageError('Target is required', 400, 'TARGET_REQUIRED')
    const expectedKind = input.kind === 'SESSION' ? EventStructureItemKind.SESSION : EventStructureItemKind.AREA
    category = input.kind === 'SESSION' ? SurveyTargetCategory.SESSION : SurveyTargetCategory.LOCATION
    const found = await tx.eventStructureItem.findFirst({
      where: { id: structureItemId, eventId: input.eventId, kind: expectedKind, isActive: true },
      select: { id: true, name: true, description: true, locationId: true, metadata: true },
    })
    if (!found) throw coverageError('Target was not found in this event', 404, 'TARGET_NOT_FOUND')
    structureItem = found
  }

  const existing = (await tx.surveyTarget.findMany({
    where: {
      eventId: input.eventId,
      eventStructureItemId: structureItem.id,
      category,
      speakerAssignmentId: null,
      speakerId: null,
    },
    orderBy: { createdAt: 'asc' },
  })).filter(isPlannerManagedSurveyTarget)[0]
  if (existing) {
    return tx.surveyTarget.update({ where: { id: existing.id }, data: { isActive: true } })
  }

  const slug = input.kind === 'OVERALL_EVENT'
    ? 'overall-event-survey-target'
    : `${input.kind === 'SESSION' ? 'session' : 'event-area'}-${structureItem.id}-survey-target`
  return tx.surveyTarget.upsert({
    where: { eventId_slug: { eventId: input.eventId, slug } },
    create: {
      eventId: input.eventId,
      eventStructureItemId: structureItem.id,
      locationId: structureItem.locationId,
      category,
      name: input.kind === 'OVERALL_EVENT' ? 'Overall Event' : structureItem.name,
      slug,
      description: structureItem.description,
      metadata: structureItem.metadata ?? undefined,
      isActive: true,
    },
    update: { isActive: true },
  })
}

export async function ensureEventSurveyCoverageTarget(
  input: { accountId: string; eventId: string; kind: StructureCoverageTargetKind; structureItemId?: string },
  db: CoverageDb = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const target = await db.$transaction((tx) => ensureStructureTarget(tx, {
    eventId: scope.eventId,
    kind: input.kind,
    structureItemId: input.structureItemId,
  }))
  return { targetId: target.id, eventStructureItemId: target.eventStructureItemId }
}

export async function createEventAreaForSurveyCoverage(input: {
  accountSlug: string
  eventId: string
  name: unknown
  description?: unknown
}, db: CoverageDb = prisma) {
  return createEventStructureItem({
    accountSlug: input.accountSlug,
    eventId: input.eventId,
    kind: EventStructureItemKind.AREA,
    name: input.name,
    description: input.description,
  }, db)
}

export async function renameEventAreaForSurveyCoverage(input: {
  accountSlug: string
  eventId: string
  eventAreaId: string
  name: unknown
  description?: unknown
}, db: CoverageDb = prisma) {
  const area = await updateEventStructureItem({
    accountSlug: input.accountSlug,
    eventId: input.eventId,
    structureItemId: input.eventAreaId,
    name: input.name,
    description: input.description,
  }, db)
  await db.surveyTarget.updateMany({
    where: {
      eventId: input.eventId,
      eventStructureItemId: input.eventAreaId,
      category: SurveyTargetCategory.LOCATION,
    },
    data: { name: area.name, description: area.description },
  })
  return area
}

export async function removeEventAreaForSurveyCoverage(input: {
  accountId: string
  accountSlug: string
  eventId: string
  eventAreaId: string
}, db: CoverageDb = prisma) {
  const scope = await requireAgendaEventScope(input, db)
  const area = await db.eventStructureItem.findFirst({
    where: { id: input.eventAreaId, eventId: scope.eventId, kind: EventStructureItemKind.AREA, isActive: true },
    select: {
      id: true,
      surveyTargets: {
        select: {
          id: true,
          _count: { select: { surveys: true, publicSurveyLinks: true, responses: true } },
        },
      },
    },
  })
  if (!area) throw coverageError('Event Area was not found in this event', 404, 'EVENT_AREA_NOT_FOUND')
  const protectedTarget = area.surveyTargets.find((target) =>
    target._count.surveys > 0 || target._count.publicSurveyLinks > 0 || target._count.responses > 0,
  )
  if (protectedTarget) {
    throw coverageError(
      'This Event Area has survey history or public links. Archive its survey before removing the area.',
      409,
      'EVENT_AREA_HAS_SURVEY_HISTORY',
    )
  }
  const result = await deleteEventStructureItem({
    accountSlug: input.accountSlug,
    eventId: scope.eventId,
    structureItemId: area.id,
  }, db)
  await db.surveyTarget.updateMany({ where: { eventId: scope.eventId, eventStructureItemId: area.id }, data: { isActive: false } })
  return result
}

export async function bulkAttachSurveyToSessions(input: {
  accountId: string
  eventId: string
  sessionIds: unknown
  surveyId: string
}, db: CoverageDb = prisma) {
  try {
    return await bulkAssignExistingSurvey({
      accountId: input.accountId,
      eventId: input.eventId,
      targetType: 'SESSION',
      targetIds: input.sessionIds,
      surveyId: input.surveyId,
      conflictMode: 'SKIP_EXISTING',
    }, db)
  } catch (error) {
    if (error instanceof EventAgendaServiceError) {
      throw coverageError(error.message, error.status, error.code, error.details)
    }
    throw error
  }
}
