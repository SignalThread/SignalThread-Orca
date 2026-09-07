import {
  AccountType,
  EventAgendaImportStatus,
  EventStatus,
  EventStructureItemKind,
  EventType,
  Prisma,
  SurveyTargetCategory,
  type PrismaClient,
} from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getEventLifecyclePhase } from '@/lib/events-home-groups'
import { isPlannerManagedSurveyTarget } from '@/lib/event-survey-scope'
import { getAssignedSurveyForEntity } from '@/lib/survey-target-assignment'
import {
  buildAgendaImportIdempotencyKey,
  eventAgendaSessionInputSchema,
  eventAgendaSessionUpdateInputSchema,
  parseEventAgendaSessionMetadata,
  eventSpeakerAssignmentInputSchema,
  eventSpeakerProfileInputSchema,
  eventSpeakerProfileUpdateInputSchema,
  normalizeSpeakerEmail,
  normalizeSpeakerName,
} from '@/lib/event-agenda-contract'

type PrismaLike = typeof prisma | PrismaClient

export const EVENT_AGENDA_IMPORT_CONFIRMATION_MODE = 'ATOMIC_ALL_OR_NOTHING' as const
export const EVENT_AGENDA_SESSION_AUTHORITY = 'EVENT_STRUCTURE_ITEM' as const
export const EVENT_SPEAKER_IDENTITY_SCOPE = 'ACCOUNT' as const
export const EVENT_SPEAKER_REMOVAL_MODE = 'ARCHIVE_FIRST' as const
export const EVENT_SPEAKER_ASSIGNMENT_AUTHORITY = 'EVENT_SESSION_SPEAKER_ASSIGNMENT' as const

export function usesSessionDrivenTemplateSpeakers(eventType: EventType) {
  return eventType === EventType.TEMPLATE
}

/**
 * The event Speaker workspace has two compatible membership modes. Template
 * events derive their roster from real session assignments; older/manual
 * events retain the explicit event-roster assignment. Keep that boundary in
 * one place so summaries cannot drift from the workspace that renders them.
 */
export function eventSpeakerWorkspaceAssignmentWhere(eventId: string, eventType: EventType) {
  return {
    eventId,
    ...(usesSessionDrivenTemplateSpeakers(eventType) ? { sessionId: { not: null } } : { sessionId: null }),
  }
}

export function eventSpeakerWorkspaceWhere(input: { accountId: string; eventId: string; eventType: EventType }) {
  return {
    accountId: input.accountId,
    isArchived: false,
    sessionAssignments: {
      some: eventSpeakerWorkspaceAssignmentWhere(input.eventId, input.eventType),
    },
  }
}

export function speakerProfileMissingFields(speaker: {
  title: string | null
  organization: string | null
  email: string | null
}) {
  return [
    ...(!speaker.title ? ['title'] : []),
    ...(!speaker.organization ? ['organization'] : []),
    ...(!speaker.email ? ['email'] : []),
  ]
}

export class EventAgendaServiceError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'EventAgendaServiceError'
  }
}

const IMPORT_STATUS_TRANSITIONS: Record<EventAgendaImportStatus, readonly EventAgendaImportStatus[]> = {
  UPLOADED: ['MAPPING', 'FAILED', 'CANCELLED'],
  MAPPING: ['NEEDS_REVIEW', 'READY', 'FAILED', 'CANCELLED'],
  NEEDS_REVIEW: ['MAPPING', 'READY', 'FAILED', 'CANCELLED'],
  READY: ['NEEDS_REVIEW', 'CONFIRMING', 'FAILED', 'CANCELLED'],
  CONFIRMING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['MAPPING', 'NEEDS_REVIEW', 'READY', 'CANCELLED'],
  CANCELLED: [],
}

export function canTransitionAgendaImport(
  from: EventAgendaImportStatus,
  to: EventAgendaImportStatus,
) {
  return IMPORT_STATUS_TRANSITIONS[from].includes(to)
}

/**
 * Server-side scope boundary shared by later Agenda routes. Callers pass the
 * account resolved by the canonical auth guard; the service re-checks event
 * ownership and EVENTS product mode before touching agenda data.
 */
export async function requireAgendaEventScope(
  input: { accountId: string; eventId: string },
  db: PrismaLike = prisma,
) {
  const accountId = input.accountId.trim()
  const eventId = input.eventId.trim()
  if (!accountId || !eventId) {
    throw new EventAgendaServiceError('Account and event are required', 400, 'INVALID_SCOPE')
  }

  const event = await db.event.findFirst({
    where: {
      id: eventId,
      location: {
        accountId,
        account: { accountType: AccountType.EVENTS },
      },
    },
    select: {
      id: true,
      name: true,
      eventType: true,
      status: true,
      startDate: true,
      endDate: true,
      location: { select: { accountId: true, timezone: true } },
    },
  })

  if (!event) {
    throw new EventAgendaServiceError('Event not found or access denied', 404, 'EVENT_NOT_FOUND')
  }

  return {
    accountId,
    eventId: event.id,
    eventName: event.name,
    eventType: event.eventType,
    eventStatus: event.status,
    eventStartDate: event.startDate,
    eventEndDate: event.endDate,
    eventTimezone: event.location.timezone,
  }
}

async function runAtomic<T>(db: PrismaLike, callback: (tx: PrismaLike) => Promise<T>): Promise<T> {
  const transaction = (db as PrismaLike & {
    $transaction?: (callback: (tx: PrismaLike) => Promise<T>) => Promise<T>
  }).$transaction
  return transaction ? transaction.call(db, callback) : callback(db)
}

async function ensureEventSpeakerAssignment(
  input: { accountId: string; eventId: string; speakerId: string },
  db: PrismaLike,
) {
  await db.eventSessionSpeakerAssignment.createMany({
    data: [{
      accountId: input.accountId,
      eventId: input.eventId,
      sessionId: null,
      speakerId: input.speakerId,
      metadata: { eventRosterMembership: true },
    }],
    skipDuplicates: true,
  })
  const assignment = await db.eventSessionSpeakerAssignment.findFirst({
    where: {
      accountId: input.accountId,
      eventId: input.eventId,
      speakerId: input.speakerId,
      sessionId: null,
    },
  })
  if (!assignment) {
    throw new EventAgendaServiceError('Speaker could not be assigned to this event', 409, 'EVENT_SPEAKER_ASSIGNMENT_FAILED')
  }
  return assignment
}

export async function listAgendaSessions(
  input: { accountId: string; eventId: string; includeArchived?: boolean },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  return db.eventStructureItem.findMany({
    where: {
      eventId: scope.eventId,
      kind: EventStructureItemKind.SESSION,
      ...(input.includeArchived ? {} : { isActive: true }),
    },
    include: {
      speakerAssignments: {
        include: { speaker: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })
}

function asJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function agendaSlugBase(name: string) {
  return name
    .toLocaleLowerCase('en-US')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '') || 'agenda-session'
}

async function createUniqueAgendaSlug(db: PrismaLike, eventId: string, name: string) {
  const base = agendaSlugBase(name)
  let slug = base
  let suffix = 1
  while (await db.eventStructureItem.findUnique({
    where: { eventId_slug: { eventId, slug } },
    select: { id: true },
  })) {
    suffix += 1
    slug = `${base}-${suffix}`
  }
  return slug
}

function requireLiveEventConfirmation(eventStatus: EventStatus, confirmed: boolean) {
  if (eventStatus === EventStatus.ACTIVE && !confirmed) {
    throw new EventAgendaServiceError(
      'Confirm this schedule correction before changing an active event',
      409,
      'LIVE_EVENT_CONFIRMATION_REQUIRED',
    )
  }
}

async function validateSessionConflicts(
  db: PrismaLike,
  input: {
    eventId: string
    sessionId?: string
    title: string
    startsAt: Date
    endsAt: Date
    room: string | null
    externalId: string | null
    confirmWarnings: boolean
  },
) {
  const withoutCurrent = input.sessionId ? { not: input.sessionId } : undefined
  const [externalIdMatch, titleMatches, roomOverlaps] = await Promise.all([
    input.externalId
      ? db.eventStructureItem.findFirst({
          where: {
            eventId: input.eventId,
            kind: EventStructureItemKind.SESSION,
            isActive: true,
            ...(withoutCurrent ? { id: withoutCurrent } : {}),
            metadata: { path: ['externalId'], equals: input.externalId },
          },
          select: { id: true, name: true },
        })
      : null,
    db.eventStructureItem.findMany({
      where: {
        eventId: input.eventId,
        kind: EventStructureItemKind.SESSION,
        isActive: true,
        ...(withoutCurrent ? { id: withoutCurrent } : {}),
        name: { equals: input.title, mode: 'insensitive' },
      },
      select: { id: true, name: true, startsAt: true },
      take: 5,
    }),
    input.room
      ? db.eventStructureItem.findMany({
          where: {
            eventId: input.eventId,
            kind: EventStructureItemKind.SESSION,
            isActive: true,
            ...(withoutCurrent ? { id: withoutCurrent } : {}),
            startsAt: { lt: input.endsAt },
            endsAt: { gt: input.startsAt },
            metadata: { path: ['room'], equals: input.room },
          },
          select: { id: true, name: true, startsAt: true, endsAt: true },
          take: 10,
        })
      : [],
  ])

  if (externalIdMatch) {
    throw new EventAgendaServiceError(
      `External session ID is already used by ${externalIdMatch.name}`,
      409,
      'DUPLICATE_EXTERNAL_ID',
      { sessionId: externalIdMatch.id },
    )
  }

  const warnings = [
    ...(titleMatches.length > 0
      ? [{ code: 'POSSIBLE_DUPLICATE_SESSION', message: `A session named “${input.title}” already exists.` }]
      : []),
    ...(roomOverlaps.length > 0
      ? [{ code: 'POSSIBLE_ROOM_OVERLAP', message: `${roomOverlaps.length} session${roomOverlaps.length === 1 ? '' : 's'} overlap in ${input.room}.` }]
      : []),
  ]

  if (warnings.length > 0 && !input.confirmWarnings) {
    throw new EventAgendaServiceError(
      'Review possible schedule conflicts before saving',
      409,
      'SESSION_REVIEW_CONFIRMATION_REQUIRED',
      { warnings },
    )
  }

  return warnings
}

function sessionReviewIssues(session: {
  startsAt: Date | null
  endsAt: Date | null
  timezone: string | null
  metadata: unknown
}) {
  const issues: string[] = []
  let metadata: ReturnType<typeof parseEventAgendaSessionMetadata>
  try {
    metadata = parseEventAgendaSessionMetadata(session.metadata)
  } catch {
    return { metadata: { schemaVersion: 1 as const }, issues: ['Invalid session metadata'] }
  }
  if (!session.startsAt) issues.push('Missing start time')
  if (!session.endsAt) issues.push('Missing end time')
  if (session.startsAt && session.endsAt && session.endsAt <= session.startsAt) issues.push('End time must be after start time')
  if (!session.timezone) issues.push('Missing timezone')
  if (!metadata.room) issues.push('Missing room')
  if (!metadata.track) issues.push('Missing track')
  if (!metadata.format) issues.push('Missing format')
  return { metadata, issues }
}

export async function getEventAgendaWorkspace(
  input: { accountId: string; eventId: string },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const [sessions, speakers] = await Promise.all([
    db.eventStructureItem.findMany({
      where: { eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
      include: {
        speakerAssignments: {
          include: { speaker: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        surveyTargets: { select: { metadata: true } },
      },
      orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.eventSpeakerProfile.findMany({
      // The event workspace roster is deliberately event-scoped. Reusable
      // account speakers belong in the explicit speaker-library query below;
      // they must not make a new event look pre-populated.
      where: eventSpeakerWorkspaceWhere({
        accountId: scope.accountId,
        eventId: scope.eventId,
        eventType: scope.eventType,
      }),
      include: {
        sessionAssignments: {
          where: { eventId: scope.eventId },
          include: {
            session: { select: { id: true, name: true, startsAt: true, isActive: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        surveyTargets: {
          where: { eventId: scope.eventId, category: SurveyTargetCategory.SPEAKER },
          orderBy: [{ createdAt: 'asc' }],
          include: {
            publicSurveyLinks: {
              where: { survey: { status: { not: EventStatus.ARCHIVED } } },
              orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
              include: {
                survey: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                    _count: { select: { questions: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    }),
  ])

  const nameCounts = new Map<string, number>()
  const emailCounts = new Map<string, number>()
  for (const speaker of speakers) {
    nameCounts.set(speaker.normalizedName, (nameCounts.get(speaker.normalizedName) ?? 0) + 1)
    if (speaker.normalizedEmail) {
      emailCounts.set(speaker.normalizedEmail, (emailCounts.get(speaker.normalizedEmail) ?? 0) + 1)
    }
  }

  const resolvedSessions = sessions.map((session) => {
    const review = sessionReviewIssues(session)
    const { surveyTargets, ...sessionFields } = session
    return {
      ...sessionFields,
      _count: {
        surveyTargets: surveyTargets.filter(isPlannerManagedSurveyTarget).length,
      },
      metadata: review.metadata,
      reviewState: review.issues.length === 0 ? 'COMPLETE' as const : 'NEEDS_REVIEW' as const,
      reviewIssues: review.issues,
    }
  })
  const resolvedSpeakers = speakers.map((speaker) => {
    const { surveyTargets, ...speakerFields } = speaker
    const eventAssignments = speaker.sessionAssignments
    const activeSessionAssignments = eventAssignments.filter((assignment) => assignment.session?.isActive)
    const directSpeakerLinks = (surveyTargets ?? [])
      .flatMap((target) => target.publicSurveyLinks.map((link) => ({
        ...link,
        surveyTarget: { ...target, eventId: target.eventId ?? scope.eventId, category: target.category ?? SurveyTargetCategory.SPEAKER, speakerId: target.speakerId ?? speaker.id },
      })))
      .sort((left, right) => Number(right.isActive) - Number(left.isActive))
    const directSpeakerLink = getAssignedSurveyForEntity(scope.eventId, 'SPEAKER', speaker.id, directSpeakerLinks)
    const missingFields = speakerProfileMissingFields(speaker)
    return {
      ...speakerFields,
      sessionAssignments: activeSessionAssignments,
      isAssignedToEvent: eventAssignments.length > 0,
      sessionCount: activeSessionAssignments.length,
      profileState: missingFields.length === 0 ? 'COMPLETE' as const : 'MISSING_DETAILS' as const,
      missingFields,
      possibleDuplicate: (nameCounts.get(speaker.normalizedName) ?? 0) > 1
        || Boolean(speaker.normalizedEmail && (emailCounts.get(speaker.normalizedEmail) ?? 0) > 1),
      survey: directSpeakerLink ? {
        id: directSpeakerLink.survey.id,
        name: directSpeakerLink.survey.name,
        status: directSpeakerLink.survey.status,
        questionCount: directSpeakerLink.survey._count.questions,
        kioskPath: `/kiosk?token=${encodeURIComponent(directSpeakerLink.token)}`,
        isActive: directSpeakerLink.isActive,
      } : null,
    }
  })

  return {
    eventId: scope.eventId,
    eventStatus: scope.eventStatus,
    eventLifecyclePhase: getEventLifecyclePhase({
      status: scope.eventStatus,
      isActive: scope.eventStatus === EventStatus.ACTIVE,
      startDate: scope.eventStartDate,
      endDate: scope.eventEndDate,
      timezone: scope.eventTimezone,
    }),
    summary: {
      sessionCount: resolvedSessions.length,
      speakerCount: resolvedSpeakers.length,
      sessionsNeedingReview: resolvedSessions.filter((session) => session.reviewState === 'NEEDS_REVIEW').length,
      assignedSpeakerCount: resolvedSpeakers.length,
    },
    sessions: resolvedSessions,
    speakers: resolvedSpeakers,
  }
}

/**
 * Reusable profiles that are available to add to this event. This is separate
 * from getEventAgendaWorkspace so account-wide records are never accidentally
 * rendered as the event roster.
 */
export async function listEventSpeakerLibrary(
  input: { accountId: string; eventId: string },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  return db.eventSpeakerProfile.findMany({
    where: {
      accountId: scope.accountId,
      isArchived: false,
      ...(usesSessionDrivenTemplateSpeakers(scope.eventType) ? {} : {
        sessionAssignments: {
          none: {
            eventId: scope.eventId,
            sessionId: null,
          },
        },
      }),
    },
    select: {
      id: true,
      name: true,
      title: true,
      organization: true,
      email: true,
    },
    orderBy: [{ name: 'asc' }],
  })
}

export async function createAgendaSession(
  input: {
    accountId: string
    eventId: string
    session: unknown
    importSource?: { importJobId: string; importRowId: string; sourceExternalId?: string | null }
  },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const session = eventAgendaSessionInputSchema.parse(input.session)
  const hasSchedule = Boolean(session.startsAt || session.endsAt)
  if (hasSchedule && (!session.startsAt || !session.endsAt || !session.timezone)) {
    throw new EventAgendaServiceError('Start time, end time, and timezone are all required when scheduling a session', 400, 'INCOMPLETE_SESSION_SCHEDULE')
  }
  const startsAt = session.startsAt ? new Date(session.startsAt) : null
  const endsAt = session.endsAt ? new Date(session.endsAt) : null
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new EventAgendaServiceError('End time must be after start time', 400, 'END_BEFORE_START')
  }
  requireLiveEventConfirmation(scope.eventStatus, session.confirmLiveEdit)
  const warnings = startsAt && endsAt ? await validateSessionConflicts(db, {
    eventId: scope.eventId,
    title: session.title,
    startsAt,
    endsAt,
    room: session.room ?? null,
    externalId: session.externalId ?? null,
    confirmWarnings: session.confirmWarnings,
  }) : []
  const slug = await createUniqueAgendaSlug(db, scope.eventId, session.title)
  const metadata = parseEventAgendaSessionMetadata({
    room: session.room ?? null,
    track: session.track ?? null,
    format: session.format ?? null,
    externalId: session.externalId ?? null,
    capacity: session.capacity ?? null,
    tags: session.tags,
    ...(input.importSource ? { importSource: input.importSource } : {}),
  })

  const created = await db.eventStructureItem.create({
    data: {
      eventId: scope.eventId,
      kind: EventStructureItemKind.SESSION,
      name: session.title,
      slug,
      description: session.description ?? null,
      startsAt,
      endsAt,
      timezone: session.timezone ?? null,
      metadata: asJsonInput(metadata),
      isActive: true,
    },
  })
  return { session: created, warnings }
}

export async function updateAgendaSession(
  input: {
    accountId: string
    eventId: string
    session: unknown
    importSource?: { importJobId: string; importRowId: string; sourceExternalId?: string | null }
  },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const session = eventAgendaSessionUpdateInputSchema.parse(input.session)
  const existing = await db.eventStructureItem.findFirst({
    where: { id: session.sessionId, eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
    select: { id: true, metadata: true },
  })
  if (!existing) {
    throw new EventAgendaServiceError('Agenda session not found or access denied', 404, 'SESSION_NOT_FOUND')
  }
  const hasSchedule = Boolean(session.startsAt || session.endsAt)
  if (hasSchedule && (!session.startsAt || !session.endsAt || !session.timezone)) {
    throw new EventAgendaServiceError('Start time, end time, and timezone are all required when scheduling a session', 400, 'INCOMPLETE_SESSION_SCHEDULE')
  }
  const startsAt = session.startsAt ? new Date(session.startsAt) : null
  const endsAt = session.endsAt ? new Date(session.endsAt) : null
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new EventAgendaServiceError('End time must be after start time', 400, 'END_BEFORE_START')
  }
  requireLiveEventConfirmation(scope.eventStatus, session.confirmLiveEdit)
  const warnings = startsAt && endsAt ? await validateSessionConflicts(db, {
    eventId: scope.eventId,
    sessionId: existing.id,
    title: session.title,
    startsAt,
    endsAt,
    room: session.room ?? null,
    externalId: session.externalId ?? null,
    confirmWarnings: session.confirmWarnings,
  }) : []
  const metadata = parseEventAgendaSessionMetadata({
    ...parseEventAgendaSessionMetadata(existing.metadata),
    room: session.room ?? null,
    track: session.track ?? null,
    format: session.format ?? null,
    externalId: session.externalId ?? null,
    capacity: session.capacity ?? null,
    tags: session.tags,
    ...(input.importSource ? { importSource: input.importSource } : {}),
  })
  const updated = await db.eventStructureItem.update({
    where: { id: existing.id },
    data: {
      name: session.title,
      description: session.description ?? null,
      startsAt,
      endsAt,
      timezone: session.timezone ?? null,
      metadata: asJsonInput(metadata),
    },
  })
  return { session: updated, warnings }
}

export async function archiveAgendaSession(
  input: { accountId: string; eventId: string; sessionId: string; confirmLiveEdit?: boolean },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  requireLiveEventConfirmation(scope.eventStatus, input.confirmLiveEdit === true)
  const existing = await db.eventStructureItem.findFirst({
    where: { id: input.sessionId.trim(), eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
    select: {
      id: true,
      surveyTargets: { select: { metadata: true } },
      _count: { select: { speakerAssignments: true } },
    },
  })
  if (!existing) {
    throw new EventAgendaServiceError('Agenda session not found or access denied', 404, 'SESSION_NOT_FOUND')
  }
  const archived = await db.eventStructureItem.update({
    where: { id: existing.id },
    data: { isActive: false },
  })
  return {
    session: archived,
    softArchived: true,
    linkedSurveyTargetCount: existing.surveyTargets.filter(isPlannerManagedSurveyTarget).length,
    preservedAssignmentCount: existing._count.speakerAssignments,
  }
}

export async function createAccountSpeakerProfileRecord(
  input: {
    accountId: string
    profile: unknown
    confirmDuplicate?: boolean
  },
  db: PrismaLike,
) {
  const profile = eventSpeakerProfileInputSchema.parse(input.profile)
  const normalizedName = normalizeSpeakerName(profile.name)
  const normalizedEmail = normalizeSpeakerEmail(profile.email)
  const possibleDuplicate = await db.eventSpeakerProfile.findFirst({
    where: {
      accountId: input.accountId,
      isArchived: false,
      OR: [
        { normalizedName },
        ...(normalizedEmail ? [{ normalizedEmail }] : []),
      ],
    },
    select: { id: true, name: true, email: true, normalizedEmail: true },
  })
  // A matching email is the only positive identity match, so it is the only
  // case that is safe to reuse silently. A name-only match stays ambiguous —
  // two different people can share a name — and keeps the existing
  // confirmation contract so the operator, not the service, decides whether to
  // reuse the profile or keep a separate one.
  const reusable = Boolean(
    possibleDuplicate
    && normalizedEmail !== null
    && possibleDuplicate.normalizedEmail === normalizedEmail,
  )
  if (reusable && possibleDuplicate) {
    return db.eventSpeakerProfile.findFirstOrThrow({ where: { id: possibleDuplicate.id, accountId: input.accountId } })
  }
  if (possibleDuplicate && !input.confirmDuplicate) {
    throw new EventAgendaServiceError(
      `A possible matching speaker profile already exists for ${possibleDuplicate.name}`,
      409,
      'SPEAKER_DUPLICATE_CONFIRMATION_REQUIRED',
      { speakerId: possibleDuplicate.id },
    )
  }

  return db.eventSpeakerProfile.create({
    data: {
      accountId: input.accountId,
      name: profile.name,
      title: profile.title ?? null,
      organization: profile.organization ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      biography: profile.biography ?? null,
      normalizedName,
      normalizedEmail,
    },
  })
}

export async function createAccountSpeakerProfile(
  input: { accountId: string; profile: unknown; confirmDuplicate?: boolean },
  db: PrismaLike = prisma,
) {
  const accountId = input.accountId.trim()
  const account = await db.account.findFirst({
    where: { id: accountId, accountType: AccountType.EVENTS },
    select: { id: true },
  })
  if (!account) throw new EventAgendaServiceError('Account not found or access denied', 404, 'ACCOUNT_NOT_FOUND')
  return createAccountSpeakerProfileRecord({ ...input, accountId }, db)
}

export async function addSpeakerToEvent(
  input: {
    accountId: string
    eventId: string
    speakerId?: string
    profile?: unknown
    confirmDuplicate?: boolean
  },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  if (usesSessionDrivenTemplateSpeakers(scope.eventType)) {
    throw new EventAgendaServiceError('Template event speakers must be assigned from an agenda session', 409, 'TEMPLATE_SPEAKER_SESSION_REQUIRED')
  }
  if (Boolean(input.speakerId) === Boolean(input.profile)) {
    throw new EventAgendaServiceError('Provide either an existing speaker or a new speaker profile', 400, 'INVALID_SPEAKER_INPUT')
  }
  return runAtomic(db, async (tx) => {
    const speaker = input.speakerId
      ? await tx.eventSpeakerProfile.findFirst({
          where: { id: input.speakerId.trim(), accountId: scope.accountId, isArchived: false },
        })
      : await createAccountSpeakerProfileRecord({
          accountId: scope.accountId,
          profile: input.profile,
          confirmDuplicate: input.confirmDuplicate,
        }, tx)
    if (!speaker) throw new EventAgendaServiceError('Speaker not found or access denied', 404, 'SPEAKER_NOT_FOUND')
    await ensureEventSpeakerAssignment({ accountId: scope.accountId, eventId: scope.eventId, speakerId: speaker.id }, tx)
    return speaker
  })
}

export async function createEventSpeakerProfile(
  input: { accountId: string; eventId: string; profile: unknown; confirmDuplicate?: boolean },
  db: PrismaLike = prisma,
) {
  return addSpeakerToEvent(input, db)
}

/** Creates/reuses the account profile and makes its first event appearance
 * through a canonical session assignment. TEMPLATE events never need a direct
 * event-roster membership row. */
export async function createSpeakerForAgendaSession(
  input: {
    accountId: string
    eventId: string
    sessionId: string
    profile: unknown
    assignment: unknown
    confirmDuplicate?: boolean
  },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const assignment = eventSpeakerAssignmentInputSchema.parse({
    ...(typeof input.assignment === 'object' && input.assignment !== null ? input.assignment : {}),
    // The profile is created in this operation, so the caller cannot supply
    // an identity that could be assigned to the wrong account.
    speakerId: '__created_with_session__',
  })
  return runAtomic(db, async (tx) => {
    const [session, speaker] = await Promise.all([
      tx.eventStructureItem.findFirst({
        where: { id: input.sessionId.trim(), eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
        select: { id: true },
      }),
      createAccountSpeakerProfileRecord({
        accountId: scope.accountId,
        profile: input.profile,
        confirmDuplicate: input.confirmDuplicate,
      }, tx),
    ])
    if (!session) throw new EventAgendaServiceError('Agenda session not found or access denied', 404, 'SESSION_NOT_FOUND')
    const eventAssignment = await tx.eventSessionSpeakerAssignment.upsert({
      where: { sessionId_speakerId: { sessionId: session.id, speakerId: speaker.id } },
      create: {
        accountId: scope.accountId,
        eventId: scope.eventId,
        sessionId: session.id,
        speakerId: speaker.id,
        role: assignment.role,
        sortOrder: assignment.sortOrder,
      },
      update: { role: assignment.role, sortOrder: assignment.sortOrder },
    })
    return { speaker, assignment: eventAssignment }
  })
}

export async function updateEventSpeakerProfile(
  input: {
    accountId: string
    eventId: string
    speakerId: string
    profile: unknown
    confirmDuplicate?: boolean
  },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const profile = eventSpeakerProfileUpdateInputSchema.parse(input.profile)
  const existing = await db.eventSpeakerProfile.findFirst({
    where: { id: input.speakerId.trim(), accountId: scope.accountId, isArchived: false },
  })
  if (!existing) {
    throw new EventAgendaServiceError('Speaker not found or access denied', 404, 'SPEAKER_NOT_FOUND')
  }
  const name = profile.name ?? existing.name
  const email = profile.email === undefined ? existing.email : profile.email
  const normalizedName = normalizeSpeakerName(name)
  const normalizedEmail = normalizeSpeakerEmail(email)
  const possibleDuplicate = await db.eventSpeakerProfile.findFirst({
    where: {
      accountId: scope.accountId,
      isArchived: false,
      id: { not: existing.id },
      OR: [
        { normalizedName },
        ...(normalizedEmail ? [{ normalizedEmail }] : []),
      ],
    },
    select: { id: true, name: true, email: true },
  })
  if (possibleDuplicate && !input.confirmDuplicate) {
    throw new EventAgendaServiceError(
      `A possible matching speaker profile already exists for ${possibleDuplicate.name}`,
      409,
      'SPEAKER_DUPLICATE_CONFIRMATION_REQUIRED',
      { speakerId: possibleDuplicate.id },
    )
  }

  return db.eventSpeakerProfile.update({
    where: { id: existing.id },
    data: {
      ...(profile.name !== undefined ? { name: profile.name } : {}),
      ...(profile.title !== undefined ? { title: profile.title ?? null } : {}),
      ...(profile.organization !== undefined ? { organization: profile.organization ?? null } : {}),
      ...(profile.email !== undefined ? { email: profile.email ?? null } : {}),
      ...(profile.phone !== undefined ? { phone: profile.phone ?? null } : {}),
      ...(profile.biography !== undefined ? { biography: profile.biography ?? null } : {}),
      normalizedName,
      normalizedEmail,
    },
  })
}

export async function archiveEventSpeakerProfile(
  input: { accountId: string; eventId: string; speakerId: string },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const speaker = await db.eventSpeakerProfile.findFirst({
    where: { id: input.speakerId.trim(), accountId: scope.accountId },
    select: { id: true },
  })
  if (!speaker) {
    throw new EventAgendaServiceError('Speaker not found or access denied', 404, 'SPEAKER_NOT_FOUND')
  }

  return db.eventSpeakerProfile.update({
    where: { id: speaker.id },
    data: { isArchived: true, archivedAt: new Date() },
  })
}

export async function assignSpeakerToAgendaSession(
  input: {
    accountId: string
    eventId: string
    sessionId: string
    assignment: unknown
  },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const assignment = eventSpeakerAssignmentInputSchema.parse(input.assignment)
  const [session, speaker] = await Promise.all([
    db.eventStructureItem.findFirst({
      where: {
        id: input.sessionId.trim(),
        eventId: scope.eventId,
        kind: EventStructureItemKind.SESSION,
        isActive: true,
      },
      select: { id: true },
    }),
    db.eventSpeakerProfile.findFirst({
      where: {
        id: assignment.speakerId,
        accountId: scope.accountId,
        isArchived: false,
      },
      select: { id: true },
    }),
  ])

  if (!session) {
    throw new EventAgendaServiceError('Agenda session not found or access denied', 404, 'SESSION_NOT_FOUND')
  }
  if (!speaker) {
    throw new EventAgendaServiceError('Speaker not found or access denied', 404, 'SPEAKER_NOT_FOUND')
  }

  return runAtomic(db, async (tx) => {
    if (!usesSessionDrivenTemplateSpeakers(scope.eventType)) {
      await ensureEventSpeakerAssignment({ accountId: scope.accountId, eventId: scope.eventId, speakerId: speaker.id }, tx)
    }
    return tx.eventSessionSpeakerAssignment.upsert({
      where: {
        sessionId_speakerId: {
          sessionId: session.id,
          speakerId: speaker.id,
        },
      },
      create: {
        accountId: scope.accountId,
        eventId: scope.eventId,
        sessionId: session.id,
        speakerId: speaker.id,
        role: assignment.role,
        sortOrder: assignment.sortOrder,
      },
      update: {
        role: assignment.role,
        sortOrder: assignment.sortOrder,
      },
    })
  })
}

/**
 * Assign a pending group from the session editor in one application action.
 * The database's session/speaker uniqueness constraint remains the final
 * duplicate guard; repeated IDs are also removed before any write is made.
 */
export async function assignSpeakersToAgendaSession(
  input: {
    accountId: string
    eventId: string
    sessionId: string
    speakerIds: unknown
    assignment: unknown
  },
  db: PrismaLike = prisma,
) {
  if (!Array.isArray(input.speakerIds)) {
    throw new EventAgendaServiceError('Speaker selections are invalid', 400, 'INVALID_SPEAKER_SELECTIONS')
  }
  const speakerIds = [...new Set(input.speakerIds
    .filter((speakerId): speakerId is string => typeof speakerId === 'string')
    .map((speakerId) => speakerId.trim())
    .filter(Boolean))]
  if (speakerIds.length === 0) return []

  const firstAssignment = eventSpeakerAssignmentInputSchema.parse({
    ...(input.assignment && typeof input.assignment === 'object' ? input.assignment : {}),
    speakerId: speakerIds[0],
  })

  return Promise.all(speakerIds.map((speakerId, index) => assignSpeakerToAgendaSession({
    accountId: input.accountId,
    eventId: input.eventId,
    sessionId: input.sessionId,
    assignment: {
      speakerId,
      role: firstAssignment.role,
      sortOrder: firstAssignment.sortOrder + index,
    },
  }, db)))
}

/** Keeps session edits and pending speaker selections on the same save path. */
export async function updateAgendaSessionWithSpeakerAssignments(
  input: {
    accountId: string
    eventId: string
    session: unknown
    speakerIds: unknown
    assignment: unknown
  },
  db: PrismaLike = prisma,
) {
  const updated = await updateAgendaSession({
    accountId: input.accountId,
    eventId: input.eventId,
    session: input.session,
  }, db)
  const assignments = await assignSpeakersToAgendaSession({
    accountId: input.accountId,
    eventId: input.eventId,
    sessionId: updated.session.id,
    speakerIds: input.speakerIds,
    assignment: input.assignment,
  }, db)
  return { ...updated, assignments }
}

export async function removeSpeakerFromAgendaSession(
  input: { accountId: string; eventId: string; sessionId: string; speakerId: string },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const assignment = await db.eventSessionSpeakerAssignment.findFirst({
    where: {
      eventId: scope.eventId,
      accountId: scope.accountId,
      sessionId: input.sessionId.trim(),
      speakerId: input.speakerId.trim(),
    },
    select: { id: true },
  })
  if (!assignment) {
    throw new EventAgendaServiceError('Speaker assignment not found or access denied', 404, 'ASSIGNMENT_NOT_FOUND')
  }
  await db.eventSessionSpeakerAssignment.delete({ where: { id: assignment.id } })
  return { removed: true, assignmentId: assignment.id }
}

interface CreateAgendaImportJobInput {
  accountId: string
  eventId: string
  createdByUserId: string
  sourceFileName: string
  sourceMimeType: string
  sourceFileSizeBytes: number
  sourceChecksumSha256: string
  sourceObjectKey?: string | null
  worksheetName?: string | null
  worksheetIndex?: number | null
  importType?: 'AGENDA' | 'SPEAKER_ROSTER'
}

export async function createOrReuseAgendaImportJob(
  input: CreateAgendaImportJobInput,
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  if (usesSessionDrivenTemplateSpeakers(scope.eventType) && input.importType === 'SPEAKER_ROSTER') {
    throw new EventAgendaServiceError('Template events import speakers through agenda sessions', 409, 'TEMPLATE_SPEAKER_ROSTER_NOT_SUPPORTED')
  }
  if (!Number.isInteger(input.sourceFileSizeBytes) || input.sourceFileSizeBytes < 0) {
    throw new EventAgendaServiceError('Source file size is invalid', 400, 'INVALID_SOURCE_FILE')
  }
  const sourceChecksumSha256 = input.sourceChecksumSha256.trim().toLocaleLowerCase('en-US')
  if (!/^[a-f0-9]{64}$/.test(sourceChecksumSha256)) {
    throw new EventAgendaServiceError('Source checksum must be SHA-256', 400, 'INVALID_SOURCE_FILE')
  }

  const actor = await db.user.findFirst({
    where: {
      id: input.createdByUserId.trim(),
      isActive: true,
      OR: [
        { accountId: scope.accountId },
        { role: 'SUPER_ADMIN', accountId: null },
      ],
    },
    select: { id: true },
  })
  if (!actor) {
    throw new EventAgendaServiceError('Import actor not found or access denied', 403, 'ACTOR_FORBIDDEN')
  }

  const idempotencyKey = buildAgendaImportIdempotencyKey({
    eventId: scope.eventId,
    sourceChecksumSha256,
    importType: input.importType,
    worksheetName: input.worksheetName,
    worksheetIndex: input.worksheetIndex,
  })

  let job = await db.eventAgendaImportJob.upsert({
    where: { eventId_idempotencyKey: { eventId: scope.eventId, idempotencyKey } },
    create: {
      accountId: scope.accountId,
      eventId: scope.eventId,
      createdByUserId: actor.id,
      idempotencyKey,
      sourceFileName: input.sourceFileName.trim(),
      sourceMimeType: input.sourceMimeType.trim(),
      sourceFileSizeBytes: input.sourceFileSizeBytes,
      sourceChecksumSha256,
      sourceObjectKey: input.sourceObjectKey?.trim() || null,
      worksheetName: input.worksheetName?.trim() || null,
      worksheetIndex: input.worksheetIndex ?? null,
    },
    update: {},
  })

  // A discarded draft is never resumable. Re-uploading the same file starts a
  // new durable draft while successful/network retries still reuse the active
  // idempotency identity above.
  if (job.status === EventAgendaImportStatus.CANCELLED) {
    const replacementKey = `${idempotencyKey}:${randomUUID()}`
    job = await db.eventAgendaImportJob.create({
      data: {
        accountId: scope.accountId,
        eventId: scope.eventId,
        createdByUserId: actor.id,
        idempotencyKey: replacementKey,
        sourceFileName: input.sourceFileName.trim(),
        sourceMimeType: input.sourceMimeType.trim(),
        sourceFileSizeBytes: input.sourceFileSizeBytes,
        sourceChecksumSha256,
        sourceObjectKey: input.sourceObjectKey?.trim() || null,
        worksheetName: input.worksheetName?.trim() || null,
        worksheetIndex: input.worksheetIndex ?? null,
      },
    })
  }

  if (
    job.accountId !== scope.accountId
    || job.sourceChecksumSha256 !== sourceChecksumSha256
    || job.worksheetName !== (input.worksheetName?.trim() || null)
    || job.worksheetIndex !== (input.worksheetIndex ?? null)
  ) {
    throw new EventAgendaServiceError('Import idempotency identity conflict', 409, 'IDEMPOTENCY_CONFLICT')
  }

  return job
}
