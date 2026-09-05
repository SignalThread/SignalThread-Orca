import { createHash } from 'node:crypto'
import { EventStructureItemKind, EventType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type MigrationClient = Pick<
  Prisma.TransactionClient,
  | 'event'
  | 'eventStructureItem'
  | 'eventSpeakerProfile'
  | 'eventSessionSpeakerAssignment'
  | 'surveyTarget'
  | 'survey'
  | 'publicSurveyLink'
  | 'question'
  | 'response'
  | 'answer'
  | 'session'
  | 'eventAgendaImportJob'
  | 'eventAgendaImportRow'
>

type MigrationDatabase = {
  $transaction<T>(callback: (tx: MigrationClient) => Promise<T>, options?: { maxWait?: number; timeout?: number }): Promise<T>
}

export interface EventFrameworkSnapshot {
  eventId: string
  accountId: string
  accountSlug: string
  eventType: EventType
  templateKey: string | null
  sessionCount: number
  activeSessionCount: number
  eventAreaCount: number
  speakerCount: number
  rosterMembershipCount: number
  sessionSpeakerAssociationCount: number
  surveyTargetCount: number
  surveyCount: number
  publicSurveyLinkCount: number
  questionCount: number
  responseCount: number
  answerCount: number
  legacyRecordingSessionCount: number
  agendaImportJobCount: number
  agendaImportRowCount: number
  sessionFingerprint: string
  speakerFingerprint: string
  assignmentFingerprint: string
}

export interface MigrateLegacyEventFrameworkResult {
  mode: 'DRY_RUN' | 'APPLY'
  outcome: 'PLANNED' | 'APPLIED' | 'ALREADY_CURRENT'
  targetEventType: typeof EventType.BLANK
  before: EventFrameworkSnapshot
  after: EventFrameworkSnapshot | null
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function stableRows<T extends { id: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id))
}

async function readSnapshot(
  tx: MigrationClient,
  input: { accountSlug: string; eventId: string },
): Promise<EventFrameworkSnapshot> {
  const event = await tx.event.findFirst({
    where: { id: input.eventId, location: { account: { slug: input.accountSlug } } },
    select: {
      id: true,
      eventType: true,
      templateKey: true,
      location: { select: { account: { select: { id: true, slug: true } } } },
    },
  })
  if (!event) throw new Error(`Event ${input.eventId} was not found in account ${input.accountSlug}`)
  if (event.id !== input.eventId || event.location.account.slug !== input.accountSlug) {
    throw new Error('Event/account scope validation failed')
  }

  const [
    structureItems,
    assignments,
    surveyTargetCount,
    surveyCount,
    publicSurveyLinkCount,
    questionCount,
    responseCount,
    answerCount,
    legacyRecordingSessionCount,
    agendaImportJobCount,
    agendaImportRowCount,
  ] = await Promise.all([
    tx.eventStructureItem.findMany({
      where: { eventId: input.eventId },
      select: {
        id: true, kind: true, name: true, slug: true, description: true, parentId: true, locationId: true,
        startsAt: true, endsAt: true, timezone: true, sortOrder: true, metadata: true, isActive: true,
      },
    }),
    tx.eventSessionSpeakerAssignment.findMany({
      where: { eventId: input.eventId },
      select: { id: true, accountId: true, eventId: true, sessionId: true, speakerId: true, role: true, sortOrder: true, metadata: true },
    }),
    tx.surveyTarget.count({ where: { eventId: input.eventId } }),
    tx.survey.count({ where: { eventId: input.eventId } }),
    tx.publicSurveyLink.count({ where: { survey: { eventId: input.eventId } } }),
    tx.question.count({ where: { eventId: input.eventId } }),
    tx.response.count({ where: { eventId: input.eventId } }),
    tx.answer.count({ where: { response: { eventId: input.eventId } } }),
    tx.session.count({ where: { eventId: input.eventId } }),
    tx.eventAgendaImportJob.count({ where: { eventId: input.eventId } }),
    tx.eventAgendaImportRow.count({ where: { eventId: input.eventId } }),
  ])
  const speakerIds = [...new Set(assignments.map((assignment) => assignment.speakerId))].sort()
  const speakers = speakerIds.length
    ? await tx.eventSpeakerProfile.findMany({
        where: { accountId: event.location.account.id, id: { in: speakerIds } },
        select: {
          id: true, accountId: true, name: true, title: true, organization: true, email: true, phone: true,
          biography: true, headshotState: true, headshotObjectKey: true, headshotMimeType: true,
          normalizedName: true, normalizedEmail: true, isArchived: true, archivedAt: true,
        },
      })
    : []
  if (speakers.length !== speakerIds.length) throw new Error('One or more event speaker assignments has no scoped speaker profile')
  if (assignments.some((assignment) => assignment.accountId !== event.location.account.id || assignment.eventId !== event.id)) {
    throw new Error('One or more speaker assignments is outside the target account/event scope')
  }

  const sessions = structureItems.filter((item) => item.kind === EventStructureItemKind.SESSION)
  return {
    eventId: event.id,
    accountId: event.location.account.id,
    accountSlug: event.location.account.slug,
    eventType: event.eventType,
    templateKey: event.templateKey,
    sessionCount: sessions.length,
    activeSessionCount: sessions.filter((session) => session.isActive).length,
    eventAreaCount: structureItems.filter((item) => item.kind === EventStructureItemKind.AREA).length,
    speakerCount: speakers.length,
    rosterMembershipCount: assignments.filter((assignment) => assignment.sessionId === null).length,
    sessionSpeakerAssociationCount: assignments.filter((assignment) => assignment.sessionId !== null).length,
    surveyTargetCount,
    surveyCount,
    publicSurveyLinkCount,
    questionCount,
    responseCount,
    answerCount,
    legacyRecordingSessionCount,
    agendaImportJobCount,
    agendaImportRowCount,
    sessionFingerprint: fingerprint(stableRows(sessions)),
    speakerFingerprint: fingerprint(stableRows(speakers)),
    assignmentFingerprint: fingerprint(stableRows(assignments)),
  }
}

function assertExpectedSource(snapshot: EventFrameworkSnapshot) {
  if (snapshot.eventType === EventType.BLANK) return
  if (snapshot.eventType !== EventType.SURVEY || snapshot.templateKey !== 'blank') {
    throw new Error(`Refusing non-deterministic migration from ${snapshot.eventType}/${snapshot.templateKey ?? 'null'}`)
  }
  if (snapshot.responseCount || snapshot.answerCount || snapshot.legacyRecordingSessionCount) {
    throw new Error('Refusing migration because attendee response or legacy recording data exists')
  }
  if (snapshot.surveyTargetCount || snapshot.surveyCount || snapshot.publicSurveyLinkCount || snapshot.questionCount) {
    throw new Error('Refusing migration because survey-framework records already exist and require separate review')
  }
}

function assertPreserved(before: EventFrameworkSnapshot, after: EventFrameworkSnapshot) {
  const preservedKeys = [
    'eventId', 'accountId', 'accountSlug', 'templateKey', 'sessionCount', 'activeSessionCount', 'eventAreaCount',
    'speakerCount', 'rosterMembershipCount', 'sessionSpeakerAssociationCount', 'surveyTargetCount', 'surveyCount',
    'publicSurveyLinkCount', 'questionCount', 'responseCount', 'answerCount', 'legacyRecordingSessionCount',
    'agendaImportJobCount', 'agendaImportRowCount', 'sessionFingerprint', 'speakerFingerprint', 'assignmentFingerprint',
  ] as const
  for (const key of preservedKeys) {
    if (before[key] !== after[key]) throw new Error(`Migration changed protected event state: ${key}`)
  }
  if (after.eventType !== EventType.BLANK) throw new Error('Event did not enter the canonical BLANK framework')
}

/**
 * Reconciles a legacy `SURVEY` event created with the old `blank` template to
 * the current Events `BLANK` framework. It never creates or rewrites related
 * records; canonical agenda, speaker, and assignment rows are fingerprinted
 * before and after the single Event.eventType update.
 */
export async function migrateLegacyEventToCurrentFramework(input: {
  accountSlug: string
  eventId: string
  apply?: boolean
}, db: MigrationDatabase = prisma) {
  return db.$transaction(async (tx) => {
    const before = await readSnapshot(tx, input)
    assertExpectedSource(before)
    if (before.eventType === EventType.BLANK) {
      return {
        mode: input.apply ? 'APPLY' : 'DRY_RUN',
        outcome: 'ALREADY_CURRENT',
        targetEventType: EventType.BLANK,
        before,
        after: before,
      } satisfies MigrateLegacyEventFrameworkResult
    }
    if (!input.apply) {
      return {
        mode: 'DRY_RUN', outcome: 'PLANNED', targetEventType: EventType.BLANK, before, after: null,
      } satisfies MigrateLegacyEventFrameworkResult
    }

    await tx.event.update({ where: { id: before.eventId }, data: { eventType: EventType.BLANK } })
    const after = await readSnapshot(tx, input)
    assertPreserved(before, after)
    return {
      mode: 'APPLY', outcome: 'APPLIED', targetEventType: EventType.BLANK, before, after,
    } satisfies MigrateLegacyEventFrameworkResult
  }, { maxWait: 5_000, timeout: 120_000 })
}
