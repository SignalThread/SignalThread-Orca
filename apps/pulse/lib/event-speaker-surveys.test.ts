import { describe, expect, it, vi } from 'vitest'
import { attachExistingSurveyToEventSpeaker, ensureEventSpeakerSurveyTarget } from './event-speaker-surveys'

const event = {
  id: 'event_1', name: 'Dev Event', eventType: 'ADVANCED', status: 'ACTIVE',
  startDate: new Date(), endDate: new Date(), location: { accountId: 'account_1', timezone: 'UTC' },
}

function dbForAttach(existingLink: null | { id: string; token: string; isActive: boolean } = null) {
  const target = { id: 'target_speaker_1', eventId: 'event_1', category: 'SPEAKER', speakerId: 'speaker_1', name: 'Jane Smith' }
  const tx = {
    survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_1', name: 'Speaker feedback', status: 'ACTIVE', _count: { questions: 2 } }) },
    surveyTarget: { findFirst: vi.fn().mockResolvedValue(target), update: vi.fn().mockResolvedValue(target), upsert: vi.fn() },
    eventSessionSpeakerAssignment: { findFirst: vi.fn() },
    publicSurveyLink: {
      findFirst: vi.fn().mockResolvedValue(existingLink),
      findMany: vi.fn().mockResolvedValue(existingLink ? [{ ...existingLink, surveyId: 'survey_1', speakerAssignmentId: null, metadata: null }] : []),
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue(existingLink && { ...existingLink, surveyId: 'survey_1', surveyTargetId: target.id }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'link_1', ...data })),
    },
  }
  const db = {
    event: { findFirst: vi.fn().mockResolvedValue(event) },
    eventSpeakerProfile: { findFirst: vi.fn().mockResolvedValue({ id: 'speaker_1', name: 'Jane Smith' }) },
    $transaction: vi.fn((callback) => callback(tx)),
  }
  return { db, tx, target }
}

describe('event speaker surveys', () => {
  it('attaches a reusable survey to one canonical SPEAKER target and creates a target-specific link', async () => {
    const { db, tx, target } = dbForAttach()
    const result = await attachExistingSurveyToEventSpeaker({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1', surveyId: 'survey_1' }, db as never)
    expect(tx.surveyTarget.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ category: 'SPEAKER', speakerId: 'speaker_1' }) }))
    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ surveyId: 'survey_1', surveyTargetId: target.id, speakerAssignmentId: null }) })
    expect(result.target).toMatchObject({ id: target.id, speakerId: 'speaker_1', category: 'SPEAKER' })
  })

  it('is idempotent and preserves the existing target-specific token', async () => {
    const existing = { id: 'link_existing', token: 'stable-token', isActive: true }
    const { db, tx } = dbForAttach(existing)
    const result = await attachExistingSurveyToEventSpeaker({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1', surveyId: 'survey_1' }, db as never)
    expect(tx.publicSurveyLink.create).not.toHaveBeenCalled()
    expect(tx.publicSurveyLink.update).toHaveBeenCalledWith({ where: { id: 'link_existing' }, data: { isActive: true, metadata: { assignmentState: 'CURRENT' } } })
    expect(result).toMatchObject({ alreadyAttached: true, publicLink: { token: 'stable-token' } })
  })

  it('uses canonical speaker identity rather than a session assignment identity', async () => {
    const tx = { surveyTarget: { findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 'target_1', category: 'SPEAKER', speakerId: 'speaker_1' }) } }
    await ensureEventSpeakerSurveyTarget({ eventId: 'event_1', speakerId: 'speaker_1', speakerName: 'Jane Smith' }, tx as never)
    expect(tx.surveyTarget.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId_slug: { eventId: 'event_1', slug: 'speaker-speaker_1' } },
      create: expect.objectContaining({ speakerId: 'speaker_1', category: 'SPEAKER' }),
    }))
  })

  it('enforces account/event isolation before resolving a speaker', async () => {
    const { db } = dbForAttach()
    db.event.findFirst.mockResolvedValue(null)
    await expect(attachExistingSurveyToEventSpeaker({ accountId: 'other_account', eventId: 'event_1', speakerId: 'speaker_1', surveyId: 'survey_1' }, db as never))
      .rejects.toMatchObject({ code: 'EVENT_NOT_FOUND', status: 404 })
  })
})
