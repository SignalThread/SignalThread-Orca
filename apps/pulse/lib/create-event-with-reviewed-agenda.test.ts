import { describe, expect, it, vi } from 'vitest'
import { EventStatus, EventType } from '@prisma/client'
import { createEventWithReviewedAgenda } from './create-event-with-reviewed-agenda'

function reviewedAgenda() {
  return {
    sourceFileName: 'agenda.csv',
    rows: [
      { sourceRowNumber: 2, normalized: { title: 'Opening', startsAt: null, endsAt: null, timezone: null, externalId: null, description: null, room: 'Main', track: null, format: null, capacity: null, tags: [], speakers: [{ name: 'Avery Brooks', email: 'avery@example.com', organization: null, title: null }] } },
      { sourceRowNumber: 3, normalized: { title: 'Closing', startsAt: null, endsAt: null, timezone: null, externalId: null, description: null, room: 'Main', track: null, format: null, capacity: null, tags: [], speakers: [{ name: 'Avery Brooks', email: 'avery@example.com', organization: null, title: null }] } },
    ],
  }
}

function database() {
  const tx = {
    event: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'creation_request_123456' }) },
    eventStructureItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    eventSpeakerProfile: {
      findFirst: vi.fn().mockResolvedValue(null),
      findFirstOrThrow: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'speaker_1', name: 'Avery Brooks', normalizedEmail: 'avery@example.com' }),
    },
    eventSessionSpeakerAssignment: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  }
  const db = {
    event: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  }
  return { db, tx }
}

const eventData = {
  name: 'Summit', locationId: 'location_1', status: EventStatus.ACTIVE, eventType: EventType.TEMPLATE,
  ttsProvider: 'google', ttsVoice: 'voice', ttsLocale: 'en-US', responseMode: 'VOICE_ONLY', questionsJson: [], isActive: true,
}

describe('createEventWithReviewedAgenda', () => {
  it('creates Event, areas, sessions, deduplicated speakers, and relationships in one transaction', async () => {
    const { db, tx } = database()
    const result = await createEventWithReviewedAgenda({
      accountId: 'account_1', requestId: 'creation_request_123456', eventData: eventData as never,
      eventAreaNames: ['Registration', ' Expo Hall '], agenda: reviewedAgenda(),
    }, db as never)

    expect(result).toMatchObject({ eventId: 'creation_request_123456', sessionCount: 2, speakerCount: 1, eventAreaCount: 2 })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.event.create).toHaveBeenCalledTimes(1)
    expect(tx.eventStructureItem.createMany).toHaveBeenCalledTimes(2)
    expect(tx.eventSpeakerProfile.create).toHaveBeenCalledTimes(1)
    expect(tx.eventSessionSpeakerAssignment.createMany.mock.calls[0][0].data).toHaveLength(2)
  })

  it('replays the same creation request without creating a duplicate Event', async () => {
    const { db, tx } = database()
    db.event.findFirst.mockResolvedValue({ id: 'creation_request_123456' })
    const result = await createEventWithReviewedAgenda({
      accountId: 'account_1', requestId: 'creation_request_123456', eventData: eventData as never,
      eventAreaNames: [], agenda: reviewedAgenda(),
    }, db as never)
    expect(result).toMatchObject({ eventId: 'creation_request_123456', idempotentReplay: true })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(tx.event.create).not.toHaveBeenCalled()
  })

  it('surfaces a transaction failure instead of returning a partially-created success', async () => {
    const { db, tx } = database()
    tx.eventStructureItem.createMany.mockRejectedValueOnce(new Error('write failed'))
    await expect(createEventWithReviewedAgenda({
      accountId: 'account_1', requestId: 'creation_request_123456', eventData: eventData as never,
      eventAreaNames: ['Registration'], agenda: reviewedAgenda(),
    }, db as never)).rejects.toThrow('write failed')
  })
})
