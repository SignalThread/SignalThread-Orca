import {
  CollectionPhase,
  EventType,
  EventStatus,
  EventStructureItemKind,
  ResponseMode,
  ResponseStatus,
  SurveyTargetCategory,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { EventAgendaServiceError, requireAgendaEventScope } from '@/lib/event-agenda-service'
import {
  createEventVoiceSurveyInTransaction,
  mapEventStructureItemKindToSurveyTargetCategory,
  type CreateEventVoiceSurveyInput,
} from '@/lib/event-voice-surveys'
import { ensureSurveyQuestionAudioForSurvey } from '@/lib/question-audio'
import { resolveSurveyLaunchReadiness, type SurveyAvailabilityInput } from '@/lib/survey-availability'
import { isPlannerManagedSurveyTarget, loadPlannerSurveyTargetIds } from '@/lib/event-survey-scope'
import { getAssignedSurveyForEntity, resolveCurrentSurveyAssignment, surveyAssignmentMetadata, surveyAssignmentState } from '@/lib/survey-target-assignment'
import { isEventSurveyDeploymentLaunchable } from '@/lib/event-survey-deployment-lifecycle'
import { reconcileAdvancedSurveyAssignments } from '@/lib/advanced-event-survey-builder'

type ListeningDb = PrismaClient
type ListeningTx = Prisma.TransactionClient
type BulkSourceSurvey = Prisma.SurveyGetPayload<{
  include: { surveyTarget: true; questions: true; publicSurveyLinks: true }
}>

export const EVENT_LISTENING_REPRESENTED_RESPONSE_MINIMUM = 3
export type EventListeningState = 'NOT_SELECTED' | 'NEEDS_SURVEY' | 'SURVEY_ATTACHED' | 'READY_TO_COLLECT' | 'COLLECTING' | 'LOW_RESPONSE' | 'REPRESENTED' | 'CLOSED'

// One bulk operation supports a realistic imported agenda without issuing one
// browser request per session. Deduplication happens before any scoped lookup.
const sessionIdsSchema = z.array(z.string().trim().min(1)).min(1).max(500).transform((ids) => [...new Set(ids)])
const speakerIdsSchema = z.array(z.string().trim().min(1)).min(1).max(500).transform((ids) => [...new Set(ids)])
const areaIdsSchema = z.array(z.string().trim().min(1)).min(1).max(500).transform((ids) => [...new Set(ids)])

export type BulkSurveyAssignmentTargetType = 'SESSION' | 'SPEAKER' | 'AREA'
export type BulkSurveyAssignmentConflictMode = 'SKIP_EXISTING' | 'REPLACE_EXISTING'

export interface BulkSurveyAssignmentCounts {
  requested: number
  attached: number
  alreadyAttached: number
  skipped: number
  replaced: number
  failed: number
}

type AssignmentLink = {
  id: string
  surveyId: string
  surveyTargetId: string | null
  isActive: boolean
  metadata?: Prisma.JsonValue | null
}

function listeningError(message: string, status: number, code: string, details?: unknown) {
  return new EventAgendaServiceError(message, status, code, details)
}

function slugBase(value: string) {
  return value.toLocaleLowerCase('en-US').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'listening-point'
}

async function uniqueTargetSlug(tx: ListeningTx, eventId: string, name: string) {
  const base = slugBase(name)
  let slug = `${base}-voice`
  let suffix = 1
  while (await tx.surveyTarget.findUnique({ where: { eventId_slug: { eventId, slug } }, select: { id: true } })) {
    suffix += 1
    slug = `${base}-voice-${suffix}`
  }
  return slug
}

async function loadScopedSessions(tx: ListeningTx, eventId: string, sessionIds: string[]) {
  const sessions = await tx.eventStructureItem.findMany({
    where: { id: { in: sessionIds }, eventId, kind: EventStructureItemKind.SESSION, isActive: true },
    select: { id: true, name: true, slug: true, description: true, locationId: true, metadata: true },
  })
  if (sessions.length !== sessionIds.length) throw listeningError('One or more agenda sessions were not found in this event', 404, 'AGENDA_SESSION_NOT_FOUND')
  return sessions
}

async function ensureTargets(tx: ListeningTx, eventId: string, sessionIdsRaw: unknown) {
  const sessionIds = sessionIdsSchema.parse(sessionIdsRaw)
  const sessions = await loadScopedSessions(tx, eventId, sessionIds)
  const existing = (await tx.surveyTarget.findMany({
    where: { eventId, eventStructureItemId: { in: sessionIds }, category: SurveyTargetCategory.SESSION },
    orderBy: { createdAt: 'asc' },
  })).filter(isPlannerManagedSurveyTarget)
  const existingBySession = new Map(existing.map((target) => [target.eventStructureItemId, target]))
  const existingIds = existing.map((target) => target.id)
  if (existingIds.length > 0) {
    await tx.surveyTarget.updateMany({ where: { id: { in: existingIds } }, data: { isActive: true } })
  }

  const missing = sessions.filter((session) => !existingBySession.has(session.id))
  if (missing.length > 0) {
    await tx.surveyTarget.createMany({
      data: missing.map((session) => ({
        eventId,
        eventStructureItemId: session.id,
        locationId: session.locationId,
        category: SurveyTargetCategory.SESSION,
        name: session.name,
        // The existing event+slug uniqueness constraint makes concurrent retry
        // safe without a lookup loop per imported session.
        slug: `session-${session.id}-survey`,
        description: session.description,
        metadata: session.metadata ?? undefined,
        isActive: true,
      })),
      skipDuplicates: true,
    })
  }

  const resolved = (missing.length > 0
    ? await tx.surveyTarget.findMany({
        where: { eventId, eventStructureItemId: { in: sessionIds }, category: SurveyTargetCategory.SESSION },
        orderBy: { createdAt: 'asc' },
      })
    : existing
  ).filter(isPlannerManagedSurveyTarget)
  const resolvedBySession = new Map(resolved.map((target) => [target.eventStructureItemId, target]))
  return sessionIds
    .map((sessionId) => resolvedBySession.get(sessionId))
    .filter((target): target is (typeof resolved)[number] => Boolean(target))
}

/**
 * Reuse one event-scoped target per canonical speaker. A speaker's session
 * assignments prove event participation but never become target identity.
 */
async function ensureSpeakerTargets(
  tx: ListeningTx,
  input: { accountId: string; eventId: string; speakerIds: unknown },
) {
  const speakerIds = speakerIdsSchema.parse(input.speakerIds)
  const speakers = await tx.eventSpeakerProfile.findMany({
    where: {
      id: { in: speakerIds },
      accountId: input.accountId,
      isArchived: false,
      sessionAssignments: { some: { eventId: input.eventId } },
    },
    select: { id: true, name: true },
  })
  if (speakers.length !== speakerIds.length) {
    throw listeningError('One or more speakers were not found in this event', 404, 'SPEAKER_NOT_FOUND')
  }

  const existing = await tx.surveyTarget.findMany({
    where: {
      eventId: input.eventId,
      category: SurveyTargetCategory.SPEAKER,
      speakerId: { in: speakerIds },
    },
    orderBy: { createdAt: 'asc' },
  })
  const existingBySpeaker = new Map<string, (typeof existing)[number]>()
  for (const target of existing) {
    if (target.speakerId && !existingBySpeaker.has(target.speakerId)) existingBySpeaker.set(target.speakerId, target)
  }
  const existingIds = [...existingBySpeaker.values()].map((target) => target.id)
  if (existingIds.length > 0) {
    await tx.surveyTarget.updateMany({ where: { id: { in: existingIds } }, data: { isActive: true } })
  }

  const missing = speakers.filter((speaker) => !existingBySpeaker.has(speaker.id))
  if (missing.length > 0) {
    await tx.surveyTarget.createMany({
      data: missing.map((speaker) => ({
        eventId: input.eventId,
        speakerId: speaker.id,
        category: SurveyTargetCategory.SPEAKER,
        name: speaker.name,
        slug: `speaker-${speaker.id}`,
        isActive: true,
      })),
      skipDuplicates: true,
    })
  }

  const resolved = await tx.surveyTarget.findMany({
    where: {
      eventId: input.eventId,
      category: SurveyTargetCategory.SPEAKER,
      speakerId: { in: speakerIds },
    },
    orderBy: { createdAt: 'asc' },
  })
  const resolvedBySpeaker = new Map<string, (typeof resolved)[number]>()
  for (const target of resolved) {
    if (target.speakerId && !resolvedBySpeaker.has(target.speakerId)) resolvedBySpeaker.set(target.speakerId, target)
  }
  return speakerIds
    .map((speakerId) => resolvedBySpeaker.get(speakerId))
    .filter((target): target is (typeof resolved)[number] => Boolean(target))
}

/** Reuses the canonical target records for Operations Event Areas. */
async function ensureAreaTargets(tx: ListeningTx, eventId: string, areaIdsRaw: unknown) {
  const areaIds = areaIdsSchema.parse(areaIdsRaw)
  const items = await tx.eventStructureItem.findMany({
    where: { id: { in: areaIds }, eventId, isActive: true, kind: { not: EventStructureItemKind.SESSION } },
    select: { id: true, name: true, slug: true, description: true, locationId: true, metadata: true, kind: true },
  })
  if (items.length !== areaIds.length) throw listeningError('One or more event areas were not found in this event', 404, 'EVENT_AREA_NOT_FOUND')
  const existing = await tx.surveyTarget.findMany({ where: { eventId, eventStructureItemId: { in: areaIds } } })
  const byItemId = new Map(existing.map((target) => [target.eventStructureItemId, target]))
  const targets: typeof existing = []
  for (const item of items) {
    const category = mapEventStructureItemKindToSurveyTargetCategory(item.kind)
    const target = byItemId.get(item.id)
    if (target) {
      targets.push(await tx.surveyTarget.update({ where: { id: target.id }, data: { isActive: true, category, name: item.name, description: item.description, locationId: item.locationId, metadata: item.metadata ?? undefined } }))
    } else {
      targets.push(await tx.surveyTarget.create({ data: { eventId, eventStructureItemId: item.id, locationId: item.locationId, category, name: item.name, slug: `${item.slug}-survey`, description: item.description, metadata: item.metadata ?? undefined, isActive: true } }))
    }
  }
  const byId = new Map(targets.map((target) => [target.eventStructureItemId, target]))
  return areaIds.map((id) => byId.get(id)).filter((target): target is (typeof targets)[number] => Boolean(target))
}

function resolveState(input: {
  responseCount: number
  sessionEndsAt: Date | null
  survey: any | null
  link: any | null
  target: any
  locationTimezone: string
  now: Date
}): { state: EventListeningState; readiness: ReturnType<typeof resolveSurveyLaunchReadiness> | null } {
  if (!input.survey || !input.link) return { state: 'NEEDS_SURVEY', readiness: null }
  const readiness = resolveSurveyLaunchReadiness({
    survey: input.survey,
    publicLink: input.link,
    targetActive: input.target.isActive,
    questionCount: input.survey._count.questions,
    eventStructureItem: input.target.eventStructureItem,
    locationTimezone: input.locationTimezone,
    now: input.now,
  })
  if (input.responseCount >= EVENT_LISTENING_REPRESENTED_RESPONSE_MINIMUM) return { state: 'REPRESENTED', readiness }
  if (input.responseCount > 0) {
    const collectionEnded = readiness.availability.state === 'CLOSED' || Boolean(input.sessionEndsAt && input.sessionEndsAt <= input.now)
    return { state: collectionEnded ? 'LOW_RESPONSE' : 'COLLECTING', readiness }
  }
  if (readiness.availability.state === 'CLOSED') return { state: 'CLOSED', readiness }
  if (input.survey.status !== EventStatus.ACTIVE || !input.link.isActive) return { state: 'SURVEY_ATTACHED', readiness }
  return { state: 'READY_TO_COLLECT', readiness }
}

export async function getEventListeningPlan(
  input: { accountId: string; eventId: string; now?: Date },
  db: ListeningDb = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const now = input.now ?? new Date()
  const plannerTargetIds = await loadPlannerSurveyTargetIds(db, scope.eventId)
  const [eventContext, sessions, targets, surveys, availableSurveys] = await Promise.all([
    db.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { location: { select: { timezone: true } } } }),
    db.eventStructureItem.findMany({
      where: { eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
      select: { id: true, name: true, startsAt: true, endsAt: true },
      orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.surveyTarget.findMany({
      where: { id: { in: plannerTargetIds }, eventId: scope.eventId, category: SurveyTargetCategory.SESSION, isActive: true, eventStructureItemId: { not: null } },
      include: {
        eventStructureItem: { select: { startsAt: true, endsAt: true, timezone: true } },
        publicSurveyLinks: {
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
          include: { survey: { include: { _count: { select: { questions: true } } } } },
        },
        _count: { select: { responses: { where: { status: ResponseStatus.COMPLETED } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.survey.findMany({
      where: { eventId: scope.eventId, surveyTargetId: { in: plannerTargetIds }, status: { not: EventStatus.ARCHIVED } },
      select: {
        id: true,
        name: true,
        status: true,
        responseMode: true,
        surveyTarget: { select: { metadata: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.survey.findMany({
      where: {
        eventId: scope.eventId,
        status: { not: EventStatus.ARCHIVED },
        // An unassigned Advanced Event survey is valid authoring state,
        // including a draft that has not received its first question yet.
        // SurveyTarget ownership cannot be an eligibility condition here.
      },
      select: {
        id: true,
        name: true,
        status: true,
        responseMode: true,
        eventId: true,
        event: { select: { name: true } },
        surveyTarget: { select: { category: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ])
  const plannerTargets = targets.filter(isPlannerManagedSurveyTarget)
  const plannerSurveys = surveys.filter((survey) => isPlannerManagedSurveyTarget(survey.surveyTarget))
  const targetsBySession = new Map<string, typeof plannerTargets>()
  for (const target of plannerTargets) {
    if (!target.eventStructureItemId) continue
    const sessionTargets = targetsBySession.get(target.eventStructureItemId) ?? []
    sessionTargets.push(target)
    targetsBySession.set(target.eventStructureItemId, sessionTargets)
  }
  const sessionRows = sessions.map((session) => {
    const sessionTargets = targetsBySession.get(session.id) ?? []
    if (sessionTargets.length === 0) return { sessionId: session.id, targetId: null, state: 'NOT_SELECTED' as const, responseCount: 0, survey: null, publicLink: null, readiness: null }
    // A link's deployment activity is independent from whether its survey is
    // the target's current assignment: draft surveys intentionally have an
    // inactive link. Assignment metadata makes reassignment deterministic
    // while falling back to legacy newest-link behavior until a target changes.
    const link = getAssignedSurveyForEntity(scope.eventId, 'SESSION', session.id, sessionTargets.flatMap((target) => target.publicSurveyLinks.map((link) => ({
      ...link,
      surveyTarget: { ...target, eventId: target.eventId ?? scope.eventId, category: target.category ?? SurveyTargetCategory.SESSION },
    }))))
    const target = link?.surveyTarget ?? sessionTargets[0]
    const survey = link?.survey ?? null
    const resolved = resolveState({ responseCount: target._count.responses, sessionEndsAt: session.endsAt, survey, link, target, locationTimezone: eventContext.location.timezone, now })
    return {
      sessionId: session.id,
      targetId: target.id,
      state: resolved.state,
      responseCount: target._count.responses,
      survey: survey ? { id: survey.id, name: survey.name, status: survey.status, responseMode: survey.responseMode, questionCount: survey._count.questions } : null,
      publicLink: link ? { id: link.id, token: link.token, kioskPath: `/kiosk?token=${encodeURIComponent(link.token)}`, isActive: link.isActive } : null,
      readiness: resolved.readiness ? { responseEligible: resolved.readiness.responseEligible, availability: resolved.readiness.availability, issues: resolved.readiness.issues } : null,
    }
  })
  const sessionSurveys = sessionRows.filter((session) => session.survey)
  const surveysWithResponses = sessionSurveys.filter((session) => session.responseCount > 0)
  const represented = sessionSurveys.filter((session) => session.state === 'REPRESENTED')
  return {
    summary: {
      agendaSessionCount: sessions.length,
      selectedSessionCount: sessionSurveys.length,
      representedSessionCount: represented.length,
      sessionSurveyCount: sessionSurveys.length,
      sessionSurveyResponseCount: surveysWithResponses.length,
      selectedCoverageLabel: `${sessionSurveys.length} of ${sessions.length} sessions have surveys`,
      evidenceCoverageLabel: `${surveysWithResponses.length} session surveys have responses`,
    },
    sessions: sessionRows,
    surveys: plannerSurveys,
    // This list deliberately mirrors the canonical bulk-attachment contract:
    // a Survey belongs to one event and its launch/response pipeline requires
    // the Survey, SurveyTarget, and response event IDs to agree. Keep event
    // ownership explicit in the payload so the picker can group library data
    // without guessing from names or URLs.
    availableSurveys: availableSurveys.map((survey) => ({
      id: survey.id,
      name: survey.name,
      status: survey.status,
      responseMode: survey.responseMode,
      targetType: !survey.surveyTarget
        ? null
        : survey.surveyTarget.category === SurveyTargetCategory.SPEAKER
          ? SurveyTargetCategory.SPEAKER
          : SurveyTargetCategory.SESSION,
      eventId: survey.eventId,
      eventName: survey.event.name,
      _count: survey._count,
    })),
  }
}

/** Minimal Setup-overview aggregate; the full agenda workspace loads on demand. */
export async function getEventListeningPlanSummary(
  input: { accountId: string; eventId: string },
  db: ListeningDb = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const plannerTargetIds = await loadPlannerSurveyTargetIds(db, scope.eventId)
  const [agendaSessionCount, selectedTargets] = await Promise.all([
    db.eventStructureItem.count({
      where: { eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
    }),
    db.surveyTarget.findMany({
      where: {
        id: { in: plannerTargetIds },
        eventId: scope.eventId,
        category: SurveyTargetCategory.SESSION,
        isActive: true,
        eventStructureItemId: { not: null },
      },
      select: {
        id: true,
        eventStructureItemId: true,
        _count: { select: { responses: { where: { status: ResponseStatus.COMPLETED } } } },
        surveys: { where: { status: { not: EventStatus.ARCHIVED } }, select: { id: true } },
      },
    }),
  ])
  const sessionCoverage = new Map<string, { responseCount: number }>()
  for (const target of selectedTargets) {
    if (!target.eventStructureItemId || target.surveys.length === 0) continue
    const current = sessionCoverage.get(target.eventStructureItemId) ?? { responseCount: 0 }
    current.responseCount += target._count.responses
    sessionCoverage.set(target.eventStructureItemId, current)
  }
  const coveredSessions = [...sessionCoverage.values()]
  const sessionSurveyCount = coveredSessions.length
  const sessionSurveyResponseCount = coveredSessions.filter((session) => session.responseCount > 0).length
  const representedSessionCount = coveredSessions.filter((session) => session.responseCount >= EVENT_LISTENING_REPRESENTED_RESPONSE_MINIMUM).length
  return {
    agendaSessionCount,
    selectedSessionCount: sessionSurveyCount,
    representedSessionCount,
    sessionSurveyCount,
    sessionSurveyResponseCount,
    selectedCoverageLabel: `${sessionSurveyCount} of ${agendaSessionCount} sessions have surveys`,
    evidenceCoverageLabel: `${sessionSurveyResponseCount} session surveys have responses`,
  }
}

export async function addSessionsToListeningPlan(input: { accountId: string; eventId: string; sessionIds: unknown }, db: ListeningDb = prisma) {
  const scope = await requireAgendaEventScope(input, db)
  const targets = await db.$transaction((tx) => ensureTargets(tx, scope.eventId, input.sessionIds))
  return { targetIds: targets.map((target) => target.id), selectedCount: targets.length }
}

export async function attachSurveyToListeningSessions(input: {
  accountId: string
  eventId: string
  sessionIds: unknown
  surveyId: string
  availability?: SurveyAvailabilityInput | null
}, db: ListeningDb = prisma) {
  const scope = await requireAgendaEventScope(input, db)
  const surveyId = input.surveyId.trim()
  if (!surveyId) throw listeningError('Survey is required', 400, 'SURVEY_REQUIRED')
  return db.$transaction(async (tx) => {
    const survey = await tx.survey.findFirst({
      where: { id: surveyId, eventId: scope.eventId, status: { not: EventStatus.ARCHIVED } },
      include: { questions: { orderBy: { order: 'asc' } }, _count: { select: { questions: true } } },
    })
    if (!survey) throw listeningError('Survey not found in this event', 404, 'SURVEY_NOT_FOUND')
    if (!survey.collectionPhase) throw listeningError('Survey must have a collection phase', 409, 'SURVEY_PHASE_REQUIRED')
    if (survey._count.questions < 1) throw listeningError('Survey must have at least one question', 409, 'SURVEY_HAS_NO_QUESTIONS')
    const availability = input.availability ?? null
    const targets = await ensureTargets(tx, scope.eventId, input.sessionIds)
    const created = []
    const skippedTargetIds = []
    for (const target of targets) {
      const existing = await tx.survey.findFirst({
        where: { eventId: scope.eventId, surveyTargetId: target.id, status: { not: EventStatus.ARCHIVED } },
        select: { id: true },
      })
      if (existing) {
        skippedTargetIds.push(target.id)
        continue
      }
      created.push(await createEventVoiceSurveyInTransaction({
        eventId: scope.eventId,
        collectionPhase: survey.collectionPhase,
        surveyTargetId: target.id,
        surveyName: targets.length === 1 ? survey.name : `${survey.name} — ${target.name}`,
        surveyStatus: survey.status,
        responseMode: survey.responseMode,
        availability: availability ?? {
          mode: survey.availabilityMode,
          timezone: survey.availabilityTimezone ?? undefined,
          opensAt: survey.availabilityOpensAt?.toISOString(),
          closesAt: survey.availabilityClosesAt?.toISOString(),
          openAnchor: survey.availabilityOpenAnchor ?? undefined,
          closeAnchor: survey.availabilityCloseAnchor ?? undefined,
          openOffsetMinutes: survey.availabilityOpenOffsetMinutes ?? undefined,
          closeOffsetMinutes: survey.availabilityCloseOffsetMinutes ?? undefined,
        },
        questions: survey.questions.map((question) => ({
          prompt: question.label,
          type: question.type,
          responseTarget: question.responseTarget,
          required: question.required,
          order: question.order,
        })),
      }, tx))
    }
    return {
      surveyIds: created.map((result) => result.survey.id),
      targetIds: targets.map((target) => target.id),
      publicLinkIds: created.map((result) => result.publicLink.id),
      skippedTargetIds,
    }
  })
}

/**
 * Reuse one existing survey across selected session, speaker, or area targets.
 * The Survey record and its questions stay intact. A previously unassigned
 * target assignment is represented by a target-scoped PublicSurveyLink. The
 * optional Survey.surveyTargetId is retained only as a legacy primary authoring
 * pointer; it is not assignment truth and never limits reuse. Assignment does
 * not publish a draft, but an already active Survey is launchable immediately.
 */
export async function bulkAssignExistingSurvey(input: {
  accountId: string
  eventId: string
  targetType: BulkSurveyAssignmentTargetType
  targetIds: unknown
  surveyId: string
  conflictMode?: BulkSurveyAssignmentConflictMode
}, db: ListeningDb = prisma): Promise<{ counts: BulkSurveyAssignmentCounts; targetIds: string[]; assignments: Array<{ targetId: string; surveyId: string }> }> {
  const scope = await requireAgendaEventScope(input, db)
  const surveyId = input.surveyId.trim()
  if (!surveyId) throw listeningError('Survey is required', 400, 'SURVEY_REQUIRED')
  if (input.targetType !== 'SESSION' && input.targetType !== 'SPEAKER' && input.targetType !== 'AREA') {
    throw listeningError('Target type is invalid', 400, 'INVALID_ASSIGNMENT_TARGET_TYPE')
  }
  const conflictMode = input.conflictMode ?? 'SKIP_EXISTING'
  if (conflictMode !== 'SKIP_EXISTING' && conflictMode !== 'REPLACE_EXISTING') {
    throw listeningError('Conflict mode is invalid', 400, 'INVALID_ASSIGNMENT_CONFLICT_MODE')
  }

  // Advanced assignment is an exact survey deployment set, never a separate
  // agenda-specific lifecycle. This keeps the builder, Surveys drawer, and
  // Agenda assignment entry point on the same forward-only reconciliation.
  const requestedIds = input.targetType === 'SESSION'
    ? sessionIdsSchema.parse(input.targetIds)
    : input.targetType === 'SPEAKER'
      ? speakerIdsSchema.parse(input.targetIds)
      : areaIdsSchema.parse(input.targetIds)
  if (scope.eventType === EventType.ADVANCED) {
    const kind = input.targetType === 'AREA' ? 'LOCATION' : input.targetType
    const survey = await reconcileAdvancedSurveyAssignments({
      accountId: input.accountId,
      eventId: scope.eventId,
      surveyId,
      assignments: [{ kind, selection: 'SELECTED', targetIds: requestedIds }],
    }, db)
    const targetIds = survey.publicSurveyLinks
      .filter((link) => surveyAssignmentState(link) !== 'SUPERSEDED' && link.surveyTarget)
      .map((link) => link.surveyTarget!.id)
    return {
      counts: { requested: requestedIds.length, attached: targetIds.length, alreadyAttached: 0, skipped: 0, replaced: 0, failed: 0 },
      targetIds,
      assignments: targetIds.map((targetId) => ({ targetId, surveyId: survey.id })),
    }
  }

  return db.$transaction(async (tx) => {
    const survey = await tx.survey.findFirst({
      where: {
        id: surveyId,
        eventId: scope.eventId,
        status: { not: EventStatus.ARCHIVED },
      },
      select: { id: true, name: true, status: true, surveyTargetId: true, _count: { select: { questions: true } } },
    })
    if (!survey) {
      throw listeningError('Survey is not compatible with this feedback target in this event', 409, 'INCOMPATIBLE_SURVEY_TARGET')
    }
    if (survey._count.questions < 1 && survey.status !== EventStatus.DRAFT) {
      throw listeningError('Survey must have at least one question', 409, 'SURVEY_HAS_NO_QUESTIONS')
    }

    const targets = input.targetType === 'SESSION'
      ? await ensureTargets(tx, scope.eventId, input.targetIds)
      : input.targetType === 'SPEAKER'
        ? await ensureSpeakerTargets(tx, { accountId: scope.accountId, eventId: scope.eventId, speakerIds: input.targetIds })
        : await ensureAreaTargets(tx, scope.eventId, input.targetIds)
    const targetIds = targets.map((target) => target.id)
    const links = await tx.publicSurveyLink.findMany({
      where: { surveyTargetId: { in: targetIds }, survey: { status: { not: EventStatus.ARCHIVED } } },
      select: { id: true, surveyId: true, surveyTargetId: true, isActive: true, metadata: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    })
    const linksByTarget = new Map<string, AssignmentLink[]>()
    for (const link of links) {
      if (!link.surveyTargetId) continue
      const current = linksByTarget.get(link.surveyTargetId) ?? []
      current.push(link)
      linksByTarget.set(link.surveyTargetId, current)
    }
    const counts: BulkSurveyAssignmentCounts = { requested: targetIds.length, attached: 0, alreadyAttached: 0, skipped: 0, replaced: 0, failed: 0 }
    const linksToCreate: Prisma.PublicSurveyLinkCreateManyInput[] = []
    const linksToDeactivate: string[] = []
    const linksToActivate: string[] = []
    const linkMetadataUpdates = new Map<string, { metadata: Prisma.InputJsonValue }>()
    const assignments: Array<{ targetId: string; surveyId: string }> = []
    let singleTargetAssignmentId: string | null = null

    for (const target of targets) {
      const existingLinks = linksByTarget.get(target.id) ?? []
      const matchingLinks = existingLinks.filter((link) => link.surveyId === survey.id)
      const currentLink = resolveCurrentSurveyAssignment(existingLinks)
      // Legacy links predate explicit assignment metadata. With a single link
      // the legacy link remains current; with multiple links, newest-link
      // ordering remains the compatibility fallback until this target changes.
      const isAlreadyCurrent = currentLink?.surveyId === survey.id
      if (isAlreadyCurrent) {
        const retained = currentLink
        linksToDeactivate.push(...matchingLinks.filter((link) => link.id !== retained.id && link.isActive).map((link) => link.id))
        if (isEventSurveyDeploymentLaunchable(survey.status) && !retained.isActive) linksToActivate.push(retained.id)
        counts.alreadyAttached += 1
        singleTargetAssignmentId = target.id
        assignments.push({ targetId: target.id, surveyId: survey.id })
        continue
      }
      if (existingLinks.length > 0 && conflictMode === 'SKIP_EXISTING') {
        counts.skipped += 1
        continue
      }
      if (currentLink) {
        linksToDeactivate.push(...existingLinks.filter((link) => link.surveyId !== survey.id).map((link) => link.id))
        linkMetadataUpdates.set(currentLink.id, { metadata: surveyAssignmentMetadata(currentLink.metadata, 'SUPERSEDED') })
        counts.replaced += 1
      }
      const retained = matchingLinks[0]
      if (retained) {
        linkMetadataUpdates.set(retained.id, { metadata: surveyAssignmentMetadata(retained.metadata, 'CURRENT') })
        if (isEventSurveyDeploymentLaunchable(survey.status) && !retained.isActive) linksToActivate.push(retained.id)
      } else {
        linksToCreate.push({
          surveyId: survey.id,
          surveyTargetId: target.id,
          token: randomBytes(18).toString('base64url'),
          isActive: isEventSurveyDeploymentLaunchable(survey.status),
          metadata: { assignmentSource: 'BULK_SURVEY_ASSIGNMENT', targetType: input.targetType, assignmentState: 'CURRENT' },
        })
        counts.attached += 1
      }
      singleTargetAssignmentId = target.id
      assignments.push({ targetId: target.id, surveyId: survey.id })
    }
    // An unassigned definition gains its canonical authoring target only when
    // it is attached to exactly one target. Multi-target reuse deliberately
    // continues to be represented by target-specific PublicSurveyLinks.
    if (survey.surveyTargetId === null && targets.length === 1 && singleTargetAssignmentId) {
      await tx.survey.update({
        where: { id: survey.id },
        data: { surveyTargetId: singleTargetAssignmentId },
      })
    }
    if (linksToDeactivate.length > 0) {
      await tx.publicSurveyLink.updateMany({
        where: { id: { in: linksToDeactivate } },
        data: { isActive: false },
      })
    }
    if (linksToActivate.length > 0) {
      await tx.publicSurveyLink.updateMany({ where: { id: { in: linksToActivate } }, data: { isActive: true } })
    }
    for (const [id, data] of linkMetadataUpdates) {
      await tx.publicSurveyLink.update({ where: { id }, data })
    }
    if (linksToCreate.length > 0) {
      await tx.publicSurveyLink.createMany({ data: linksToCreate, skipDuplicates: true })
    }
    return { counts, targetIds, assignments }
  })
}

/**
 * Removes the current deployment from targets without removing the underlying
 * session, speaker, area, SurveyTarget, survey, or historical responses.
 * This is the inverse of the canonical assignment flow above: assignment
 * history remains explicit through SUPERSEDED links, so a future attach starts
 * from a clean target rather than reviving an older survey by accident.
 */
export async function clearExistingSurveyAssignment(input: {
  accountId: string
  eventId: string
  targetType: BulkSurveyAssignmentTargetType
  targetIds: unknown
}, db: ListeningDb = prisma): Promise<{ targetIds: string[]; detached: number }> {
  const scope = await requireAgendaEventScope(input, db)
  if (input.targetType !== 'SESSION' && input.targetType !== 'SPEAKER' && input.targetType !== 'AREA') {
    throw listeningError('Target type is invalid', 400, 'INVALID_ASSIGNMENT_TARGET_TYPE')
  }
  const targets = await db.$transaction(async (tx) => input.targetType === 'SESSION'
    ? ensureTargets(tx, scope.eventId, input.targetIds)
    : input.targetType === 'SPEAKER'
      ? ensureSpeakerTargets(tx, { accountId: scope.accountId, eventId: scope.eventId, speakerIds: input.targetIds })
      : ensureAreaTargets(tx, scope.eventId, input.targetIds))
  const targetIds = targets.map((target) => target.id)

  const result = await db.$transaction(async (tx) => {
    const links = await tx.publicSurveyLink.findMany({
      where: { surveyTargetId: { in: targetIds }, survey: { status: { not: EventStatus.ARCHIVED } } },
      select: { id: true, metadata: true },
    })
    const currentLinks = links.filter((link) => surveyAssignmentState(link) !== 'SUPERSEDED')
    if (currentLinks.length > 0) {
      await Promise.all(currentLinks.map((link) => tx.publicSurveyLink.update({
        where: { id: link.id },
        data: { isActive: false, metadata: surveyAssignmentMetadata(link.metadata, 'SUPERSEDED') },
      })))
    }
    return currentLinks.length
  })
  return { targetIds, detached: result }
}

export async function createSurveyForListeningSessions(input: {
  accountId: string
  eventId: string
  sessionIds: unknown
  surveyName: string
  questionPrompt: string
  collectionPhase: CollectionPhase
  publish?: boolean
  availability?: SurveyAvailabilityInput | null
}, db: ListeningDb = prisma) {
  const scope = await requireAgendaEventScope(input, db)
  const surveyName = input.surveyName.trim()
  const questionPrompt = input.questionPrompt.trim()
  if (!surveyName || !questionPrompt) throw listeningError('Survey name and first question are required', 400, 'SURVEY_CONTENT_REQUIRED')
  if (!Object.values(CollectionPhase).includes(input.collectionPhase)) throw listeningError('Collection phase is required', 400, 'SURVEY_PHASE_REQUIRED')
  return db.$transaction(async (tx) => {
    const targets = await ensureTargets(tx, scope.eventId, input.sessionIds)
    const created = []
    const skippedTargetIds = []
    for (const target of targets) {
      // A session owns exactly one session-specific survey. Do not reuse one
      // Survey record across multiple targets and do not replace history.
      const existingSurvey = await tx.survey.findFirst({
        where: { eventId: scope.eventId, surveyTargetId: target.id, status: { not: EventStatus.ARCHIVED } },
        select: { id: true },
      })
      if (existingSurvey) {
        skippedTargetIds.push(target.id)
        continue
      }
      const result = await createEventVoiceSurveyInTransaction({
        eventId: scope.eventId,
        collectionPhase: input.collectionPhase,
        surveyTargetId: target.id,
        surveyName: targets.length === 1 ? surveyName : `${surveyName} — ${target.name}`,
        surveyStatus: input.publish ? EventStatus.ACTIVE : EventStatus.DRAFT,
        availability: input.availability,
        questions: [{ prompt: questionPrompt, required: true, order: 0 }],
      }, tx)
      created.push(result)
    }
    return {
      surveyIds: created.map((result) => result.survey.id),
      targetIds: targets.map((target) => target.id),
      publicLinkIds: created.map((result) => result.publicLink.id),
      skippedTargetIds,
    }
  })
}

/**
 * Creates one canonical survey/question configuration and assigns its public
 * link to every selected session target. Target-specific links preserve QR and
 * response scoping while avoiding duplicated question authoring and 500 Survey
 * records for a 500-session agenda.
 */
export async function createBulkSurveyConfigurationForSessions(input: {
  accountId: string
  eventId: string
  sessionIds: unknown
  survey: Omit<CreateEventVoiceSurveyInput, 'eventId' | 'surveyTargetId' | 'eventStructureItemId' | 'speakerId' | 'targetCategory' | 'targetName'>
}, db: ListeningDb = prisma) {
  const scope = await requireAgendaEventScope(input, db)
  const execute = () => db.$transaction(async (tx) => {
    const targets = await ensureTargets(tx, scope.eventId, input.sessionIds)
    const targetIds = targets.map((target) => target.id)
    const existingLinks = await tx.publicSurveyLink.findMany({
      where: { surveyTargetId: { in: targetIds }, survey: { status: { not: EventStatus.ARCHIVED } } },
      select: { id: true, surveyId: true, surveyTargetId: true },
    })
    const linksByTarget = new Map<string, typeof existingLinks>()
    for (const link of existingLinks) {
      if (!link.surveyTargetId) continue
      const current = linksByTarget.get(link.surveyTargetId) ?? []
      current.push(link)
      linksByTarget.set(link.surveyTargetId, current)
    }

    const creationRequestId = input.survey.creationRequestId?.trim() || null
    let createdResult: Awaited<ReturnType<typeof createEventVoiceSurveyInTransaction>> | null = null
    let sourceSurvey: BulkSourceSurvey | null = creationRequestId
      ? await tx.survey.findFirst({
          where: { eventId: scope.eventId, creationRequestId },
          include: {
            surveyTarget: true,
            questions: { orderBy: { order: 'asc' } },
            publicSurveyLinks: { orderBy: { createdAt: 'asc' }, take: 1 },
          },
        })
      : null

    if (!sourceSurvey) {
      const firstAvailableTarget = targets.find((target) => (linksByTarget.get(target.id) ?? []).length === 0)
      if (!firstAvailableTarget) {
        throw listeningError('Every selected session already has a survey. Existing surveys were not replaced.', 409, 'ALL_TARGETS_HAVE_SURVEYS')
      }
      createdResult = await createEventVoiceSurveyInTransaction({
        ...input.survey,
        eventId: scope.eventId,
        surveyTargetId: firstAvailableTarget.id,
      }, tx)
      sourceSurvey = {
        ...createdResult.survey,
        surveyTarget: createdResult.target,
        questions: createdResult.questions,
        publicSurveyLinks: [createdResult.publicLink],
      }
      const current = linksByTarget.get(firstAvailableTarget.id) ?? []
      current.push({ id: createdResult.publicLink.id, surveyId: createdResult.survey.id, surveyTargetId: firstAvailableTarget.id })
      linksByTarget.set(firstAvailableTarget.id, current)
    }

    if (!sourceSurvey) throw listeningError('Survey could not be created', 500, 'SURVEY_CREATE_FAILED')
    const linksToCreate: Prisma.PublicSurveyLinkCreateManyInput[] = []
    let alreadyAttached = 0
    let skipped = 0
    for (const target of targets) {
      const targetLinks = linksByTarget.get(target.id) ?? []
      if (targetLinks.some((link) => link.surveyId === sourceSurvey!.id)) {
        alreadyAttached += 1
        continue
      }
      if (targetLinks.length > 0) {
        skipped += 1
        continue
      }
      linksToCreate.push({
        surveyId: sourceSurvey.id,
        surveyTargetId: target.id,
        token: randomBytes(18).toString('base64url'),
        isActive: sourceSurvey.status === EventStatus.ACTIVE,
        metadata: { assignmentSource: 'BULK_SURVEY_CREATION', targetType: 'SESSION' },
      })
    }
    if (linksToCreate.length > 0) {
      await tx.publicSurveyLink.createMany({ data: linksToCreate, skipDuplicates: true })
    }

    return {
      target: sourceSurvey.surveyTarget,
      survey: sourceSurvey,
      questions: sourceSurvey.questions,
      publicLink: sourceSurvey.publicSurveyLinks[0],
      counts: {
        requested: targets.length,
        attached: linksToCreate.length + (createdResult ? 1 : 0),
        alreadyAttached: Math.max(0, alreadyAttached - (createdResult ? 1 : 0)),
        skipped,
      },
    }
  })

  let transactionResult: Awaited<ReturnType<typeof execute>>
  try {
    transactionResult = await execute()
  } catch (error) {
    const isCreationRetryRace = Boolean(
      input.survey.creationRequestId
      && error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'P2002',
    )
    if (!isCreationRetryRace) throw error
    transactionResult = await execute()
  }

  let questionAudioStatus: 'READY' | 'DEFERRED' = 'READY'
  if (transactionResult.survey.responseMode !== ResponseMode.TEXT_ONLY) {
    try {
      await ensureSurveyQuestionAudioForSurvey(transactionResult.survey.id, {
        provider: transactionResult.survey.ttsProvider ?? undefined,
        voice: transactionResult.survey.ttsVoice ?? undefined,
        locale: transactionResult.survey.ttsLocale ?? undefined,
      })
    } catch (error) {
      questionAudioStatus = 'DEFERRED'
      console.error('[createBulkSurveyConfigurationForSessions] question audio deferred', {
        surveyId: transactionResult.survey.id,
        error,
      })
    }
  }
  return { ...transactionResult, questionAudioStatus }
}

export async function removeSessionsFromListeningPlan(input: { accountId: string; eventId: string; sessionIds: unknown }, db: ListeningDb = prisma) {
  const scope = await requireAgendaEventScope(input, db)
  const sessionIds = sessionIdsSchema.parse(input.sessionIds)
  await db.$transaction(async (tx) => {
    await loadScopedSessions(tx, scope.eventId, sessionIds)
    const targets = (await tx.surveyTarget.findMany({
      where: { eventId: scope.eventId, category: SurveyTargetCategory.SESSION, eventStructureItemId: { in: sessionIds }, isActive: true },
      select: { id: true, metadata: true },
    })).filter(isPlannerManagedSurveyTarget)
    const targetIds = targets.map((target) => target.id)
    if (targetIds.length) {
      await tx.publicSurveyLink.updateMany({ where: { surveyTargetId: { in: targetIds } }, data: { isActive: false } })
      await tx.surveyTarget.updateMany({ where: { id: { in: targetIds } }, data: { isActive: false } })
    }
  })
  return { removedSessionCount: sessionIds.length, historyPreserved: true as const }
}
