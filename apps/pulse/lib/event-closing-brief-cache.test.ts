import { describe, expect, it, vi } from 'vitest'
import { getEventClosingBrief, getPersistedEventClosingBrief } from '@/lib/event-closing-brief'

const canonicalBrief = {
  lifecyclePhase: 'POST_EVENT',
  generatedAt: '2026-08-14T12:00:00.000Z',
  event: { id: 'evt_123', name: 'Northstar Summit' },
  summary: {},
  keyFindings: [],
  editorial: { inputHash: 'brief_hash_123' },
} as never

function cachedBriefDb(brief = canonicalBrief) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{
      eventUpdatedAt: new Date('2026-08-14T10:00:00.000Z'),
      responseCount: '282',
      answerCount: '560',
    }]),
    eventClosingBriefSnapshot: {
      findFirst: vi.fn().mockResolvedValue({ briefJson: brief }),
      upsert: vi.fn(),
    },
    // These would be touched by aggregation on a cache miss. Keeping them as
    // spies makes a regression into expensive generation explicit.
    eventIssueEvidence: { findMany: vi.fn() },
    surveyTarget: { count: vi.fn() },
    answerEventTheme: { findMany: vi.fn() },
  }
}

describe('Event Closing Brief canonical snapshot', () => {
  it('reuses an unchanged persisted brief on repeated page loads without aggregation or synthesis', async () => {
    const db = cachedBriefDb()
    const input = { accountId: 'acct_123', accountSlug: 'acme', eventId: 'evt_123' }

    await expect(getEventClosingBrief(input, db as never)).resolves.toBe(canonicalBrief)
    await expect(getEventClosingBrief(input, db as never)).resolves.toBe(canonicalBrief)

    expect(db.$queryRaw).toHaveBeenCalledTimes(2)
    expect(db.eventClosingBriefSnapshot.findFirst).toHaveBeenCalledTimes(2)
    expect(db.eventIssueEvidence.findMany).not.toHaveBeenCalled()
    expect(db.surveyTarget.count).not.toHaveBeenCalled()
    expect(db.answerEventTheme.findMany).not.toHaveBeenCalled()
    expect(db.eventClosingBriefSnapshot.upsert).not.toHaveBeenCalled()
  })

  it('loads the exact persisted brief hash used by the screen for PDF export', async () => {
    const db = cachedBriefDb()

    await expect(getPersistedEventClosingBrief({
      accountId: 'acct_123',
      eventId: 'evt_123',
      briefHash: 'brief_hash_123',
    }, db as never)).resolves.toBe(canonicalBrief)

    expect(db.eventClosingBriefSnapshot.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acct_123', eventId: 'evt_123', briefHash: 'brief_hash_123' },
      select: { briefJson: true },
    })
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('rejects malformed persisted data instead of sending it to the PDF renderer', async () => {
    const db = cachedBriefDb({ generatedAt: '2026-08-14T12:00:00.000Z' } as never)

    await expect(getPersistedEventClosingBrief({ accountId: 'acct_123', eventId: 'evt_123' }, db as never)).resolves.toBeNull()
  })
})
