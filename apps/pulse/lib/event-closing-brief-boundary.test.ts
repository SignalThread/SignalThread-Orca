import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  summaryMock,
  sessionsMock,
  speakersMock,
  actionsMock,
  editorialMock,
} = vi.hoisted(() => ({
  summaryMock: vi.fn(),
  sessionsMock: vi.fn(),
  speakersMock: vi.fn(),
  actionsMock: vi.fn(),
  editorialMock: vi.fn(),
}))

vi.mock('@/lib/event-intelligence/aggregation', () => ({
  getEventIntelligenceSummary: summaryMock,
}))
vi.mock('@/lib/event-session-intelligence', () => ({
  getEventSessionIntelligence: sessionsMock,
}))
vi.mock('@/lib/event-speaker-intelligence', () => ({
  getEventSpeakerIntelligence: speakersMock,
}))
vi.mock('@/lib/event-actions/service', () => ({
  listEventActions: actionsMock,
}))
vi.mock('@/lib/event-closing-brief-editorial', async () => {
  const actual = await vi.importActual<typeof import('@/lib/event-closing-brief-editorial')>('@/lib/event-closing-brief-editorial')
  return { ...actual, synthesizeEventClosingBriefEditorial: editorialMock }
})

import { getEventClosingBrief } from './event-closing-brief'

function collectionPhaseValues(query: unknown) {
  const values = (query as { values?: unknown[] }).values ?? []
  return values.filter((value): value is string => value === 'PRE' || value === 'DURING' || value === 'POST')
}

describe('Event Closing Brief lifecycle boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    summaryMock.mockResolvedValue({
      eventId: 'event_1',
      eventName: 'Summit',
      eventStatus: 'COMPLETED',
      eventType: 'EVENT',
      responseCount: 2,
      answerCount: 2,
      avgSentiment: 0.2,
      targetBreakdown: [],
      questionBreakdown: [],
      topThemes: [],
      topActions: [],
      canonicalFindings: [],
      eventPulse: { sentimentLabel: 'MIXED' },
      attentionQueue: [{
        id: 'cluster_1', taxonomyKey: 'agenda_pacing', title: 'Agenda pacing', summary: null,
        evidenceCount: 2, confidence: 0.8,
      }],
    })
    sessionsMock.mockResolvedValue({ sessions: [], summary: {} })
    speakersMock.mockResolvedValue({ speakers: [], summary: {} })
    actionsMock.mockResolvedValue({ actions: [], availableFindings: [], availableOwners: [] })
    editorialMock.mockResolvedValue({
      source: 'openai', provider: 'openai', model: 'test', promptVersion: 'test',
      inputHash: 'a'.repeat(64), generatedAt: '2026-09-04T12:00:00.000Z',
      copy: {
        headline: 'The event produced a clear set of lessons.',
        executiveSummary: 'The event produced useful evidence. Teams have clear follow-through. Coverage remains limited.',
        keyTakeaway: 'Use the eligible evidence to guide the next event.',
        whatWorkedNarrative: '', frictionNarrative: '', nextEventNarrative: '',
        coverageNarrative: 'Coverage remains limited.', findingNarratives: [],
      },
    })
  })

  it('feeds the brief only DURING and POST aggregates, actions, and evidence', async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ eventUpdatedAt: new Date('2026-09-04T10:00:00.000Z') }]),
      eventClosingBriefSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      eventIssueEvidence: { findMany: vi.fn().mockResolvedValue([]) },
      answerEventTheme: { findMany: vi.fn().mockResolvedValue([]) },
    }

    await getEventClosingBrief({
      accountId: 'account_1', accountSlug: 'events-co', eventId: 'event_1',
      lifecyclePhase: 'POST_EVENT',
      now: new Date('2026-09-04T12:00:00.000Z'),
    }, db as never)

    expect(summaryMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase: 'POST_EVENT' }), expect.anything())
    expect(sessionsMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase: 'POST_EVENT' }), expect.anything())
    expect(speakersMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase: 'POST_EVENT' }), expect.anything())
    expect(actionsMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase: 'POST_EVENT' }), expect.anything())
    expect(db.eventIssueEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ response: { collectionPhase: { in: ['DURING', 'POST'] } } }),
    }))
    expect(db.answerEventTheme.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        intelligence: expect.objectContaining({ response: { collectionPhase: { in: ['DURING', 'POST'] } } }),
      }),
    }))
  })

  it.each([
    ['PRE_EVENT', ['PRE']],
    ['IN_EVENT', ['DURING']],
    ['POST_EVENT', ['DURING', 'POST']],
  ] as const)('keeps %s evidence inside its canonical collection cohort', async (lifecyclePhase, collectionPhases) => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ eventUpdatedAt: new Date('2026-09-04T10:00:00.000Z') }]),
      eventClosingBriefSnapshot: { findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
      eventIssueEvidence: { findMany: vi.fn().mockResolvedValue([]) },
      answerEventTheme: { findMany: vi.fn().mockResolvedValue([]) },
    }

    await getEventClosingBrief({
      accountId: 'account_1', accountSlug: 'events-co', eventId: 'event_1', lifecyclePhase,
      now: new Date('2026-09-04T12:00:00.000Z'),
    }, db as never)

    expect(summaryMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase }), expect.anything())
    expect(sessionsMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase }), expect.anything())
    expect(speakersMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase }), expect.anything())
    expect(actionsMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase }), expect.anything())
    expect(db.eventIssueEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ response: { collectionPhase: { in: [...collectionPhases] } } }),
    }))
    expect(db.answerEventTheme.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ intelligence: expect.objectContaining({ response: { collectionPhase: { in: [...collectionPhases] } } }) }),
    }))

    const sourceHashQuery = db.$queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] } | undefined
    expect(sourceHashQuery?.strings?.join('')).toContain('::"CollectionPhase"')
    expect(sourceHashQuery?.strings?.join('')).not.toContain('"collectionPhase"::text')
    expect(new Set(collectionPhaseValues(sourceHashQuery))).toEqual(new Set(collectionPhases))
  })
})
