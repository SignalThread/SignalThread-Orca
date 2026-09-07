import { EventStructureItemKind, EventType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { migrateLegacyEventToCurrentFramework } from './migrate-legacy-event-framework'

function fixture() {
  let eventType: EventType = EventType.SURVEY
  const structureItems = [
    { id: 'session_1', kind: EventStructureItemKind.SESSION, name: 'Opening', slug: 'opening', description: null, parentId: null, locationId: null, startsAt: null, endsAt: null, timezone: null, sortOrder: 0, metadata: { schemaVersion: 1 }, isActive: true },
    { id: 'session_2', kind: EventStructureItemKind.SESSION, name: 'Closing', slug: 'closing', description: null, parentId: null, locationId: null, startsAt: null, endsAt: null, timezone: null, sortOrder: 1, metadata: { schemaVersion: 1 }, isActive: true },
  ]
  const assignments = [
    { id: 'roster_1', accountId: 'account_1', eventId: 'event_1', sessionId: null, speakerId: 'speaker_1', role: 'SPEAKER', sortOrder: 0, metadata: { eventRosterMembership: true } },
    { id: 'assignment_1', accountId: 'account_1', eventId: 'event_1', sessionId: 'session_1', speakerId: 'speaker_1', role: 'SPEAKER', sortOrder: 0, metadata: null },
  ]
  const speakers = [{ id: 'speaker_1', accountId: 'account_1', name: 'Ada', title: null, organization: null, email: null, phone: null, biography: null, headshotState: 'NONE', headshotObjectKey: null, headshotMimeType: null, normalizedName: 'ada', normalizedEmail: null, isArchived: false, archivedAt: null }]
  const event = {
    findFirst: vi.fn(async () => ({ id: 'event_1', eventType, templateKey: 'blank', location: { account: { id: 'account_1', slug: 'shared-hope' } } })),
    update: vi.fn(async ({ data }) => { eventType = data.eventType; return { id: 'event_1', eventType } }),
  }
  const zeroCount = () => ({ count: vi.fn().mockResolvedValue(0) })
  const tx = {
    event,
    eventStructureItem: { findMany: vi.fn().mockResolvedValue(structureItems) },
    eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue(speakers) },
    eventSessionSpeakerAssignment: { findMany: vi.fn().mockResolvedValue(assignments) },
    surveyTarget: zeroCount(), survey: zeroCount(), publicSurveyLink: zeroCount(), question: zeroCount(),
    response: zeroCount(), answer: zeroCount(), session: zeroCount(),
    eventAgendaImportJob: { count: vi.fn().mockResolvedValue(2) },
    eventAgendaImportRow: { count: vi.fn().mockResolvedValue(25) },
  }
  const db = { $transaction: vi.fn(async (callback) => callback(tx)) }
  return { db, tx, event, structureItems, assignments, speakers }
}

describe('migrateLegacyEventToCurrentFramework', () => {
  it('reconciles the old blank-mode fixture without replacing canonical event records', async () => {
    const current = fixture()
    const result = await migrateLegacyEventToCurrentFramework({ accountSlug: 'shared-hope', eventId: 'event_1', apply: true }, current.db as never)

    expect(result.outcome).toBe('APPLIED')
    expect(result.before).toMatchObject({ eventId: 'event_1', eventType: 'SURVEY', sessionCount: 2, speakerCount: 1, sessionSpeakerAssociationCount: 1, rosterMembershipCount: 1 })
    expect(result.after).toMatchObject({ eventId: 'event_1', eventType: 'BLANK', sessionCount: 2, speakerCount: 1, sessionSpeakerAssociationCount: 1, rosterMembershipCount: 1 })
    expect(result.after?.sessionFingerprint).toBe(result.before.sessionFingerprint)
    expect(result.after?.speakerFingerprint).toBe(result.before.speakerFingerprint)
    expect(result.after?.assignmentFingerprint).toBe(result.before.assignmentFingerprint)
    expect(current.event.update).toHaveBeenCalledWith({ where: { id: 'event_1' }, data: { eventType: EventType.BLANK } })
    expect(current.tx.eventStructureItem.findMany).toHaveBeenCalledTimes(2)
    expect(current.tx.eventSpeakerProfile.findMany).toHaveBeenCalledTimes(2)
    expect(current.tx.eventSessionSpeakerAssignment.findMany).toHaveBeenCalledTimes(2)
  })

  it('is idempotent and performs no second update', async () => {
    const current = fixture()
    await migrateLegacyEventToCurrentFramework({ accountSlug: 'shared-hope', eventId: 'event_1', apply: true }, current.db as never)
    const replay = await migrateLegacyEventToCurrentFramework({ accountSlug: 'shared-hope', eventId: 'event_1', apply: true }, current.db as never)

    expect(replay.outcome).toBe('ALREADY_CURRENT')
    expect(replay.before).toEqual(replay.after)
    expect(current.event.update).toHaveBeenCalledTimes(1)
  })

  it('defaults to a no-write dry run', async () => {
    const current = fixture()
    const result = await migrateLegacyEventToCurrentFramework({ accountSlug: 'shared-hope', eventId: 'event_1' }, current.db as never)

    expect(result).toMatchObject({ mode: 'DRY_RUN', outcome: 'PLANNED', targetEventType: 'BLANK', after: null })
    expect(current.event.update).not.toHaveBeenCalled()
  })

  it('refuses a source with attendee response data', async () => {
    const current = fixture()
    current.tx.response.count.mockResolvedValue(1)

    await expect(migrateLegacyEventToCurrentFramework({ accountSlug: 'shared-hope', eventId: 'event_1', apply: true }, current.db as never))
      .rejects.toThrow('attendee response or legacy recording data exists')
    expect(current.event.update).not.toHaveBeenCalled()
  })
})
