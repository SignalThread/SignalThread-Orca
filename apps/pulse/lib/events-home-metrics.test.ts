import { describe, expect, it, vi } from 'vitest'
import {
  buildEventsHomeMetrics,
  OPEN_EVENT_ISSUE_CLUSTER_STATUSES,
} from './events-home-metrics'

function makeDb(overrides: {
  responseTotals?: Array<{ eventId: string; _count: { _all: number } }>
  responseToday?: Array<{ eventId: string; _count: { _all: number } }>
  surveyRows?: Array<{ eventId: string; status: string; surveyTarget: { metadata: unknown } }>
  openClusterTotals?: Array<{ eventId: string; _count: { _all: number } }>
  preferredLinks?: Array<{ token: string; surveyId: string; survey: { eventId: string } }>
  sentimentGroups?: Array<{ questionId: string | null; _count: { _all: number }; _avg: { sentimentScore: number | null } }>
  openIssues?: Array<{ id: string; title: string; summary: string | null; priorityLevel: string; impactScore: number; timeSensitivityScore: number; lastSeenAt: Date }>
} = {}) {
  const responseGroupBy = vi
    .fn()
    .mockResolvedValueOnce(overrides.responseTotals ?? [])
    .mockResolvedValueOnce(overrides.responseToday ?? [])
  const publicSurveyLinkFindMany = vi.fn().mockResolvedValue(overrides.preferredLinks ?? [])
  return {
    db: {
      response: { groupBy: responseGroupBy },
      survey: {
        findMany: vi.fn().mockResolvedValue(overrides.surveyRows ?? []),
      },
      eventIssueCluster: {
        groupBy: vi.fn().mockResolvedValue(overrides.openClusterTotals ?? []),
        findMany: vi.fn().mockResolvedValue(overrides.openIssues ?? []),
      },
      answerEventIntelligence: {
        groupBy: vi.fn().mockResolvedValue(overrides.sentimentGroups ?? []),
      },
      publicSurveyLink: { findMany: publicSurveyLinkFindMany },
    },
    responseGroupBy,
    publicSurveyLinkFindMany,
  }
}

const baseInput = {
  accountId: 'acct_1',
  accountSlug: 'live-co',
  accountType: 'EVENTS',
  now: new Date('2026-07-02T12:00:00.000Z'),
}

describe('buildEventsHomeMetrics', () => {
  it('uses the shared Events Home grouping and keeps incomplete event dates out of the live summary', async () => {
    const { db } = makeDb({})
    const result = await buildEventsHomeMetrics(
      {
        ...baseInput,
        events: [
          { id: 'live-1', status: 'ACTIVE', isActive: true, startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-07-03T23:59:59.000Z' },
          { id: 'live-2', status: 'ACTIVE', isActive: true, startDate: '2026-07-02T00:00:00.000Z', endDate: null },
          { id: 'past-1', status: 'COMPLETED', isActive: false, startDate: null, endDate: null },
        ],
      },
      { db: db as never },
    )

    expect(result.summary.liveCount).toBe(1)
    expect(result.events['live-1']).toBeDefined()
    expect(result.events['live-2']).toBeDefined()
  })

  it('scopes responses to each event and does not leak account-wide totals', async () => {
    const { db } = makeDb({
      responseTotals: [
        { eventId: 'live', _count: { _all: 40 } },
        { eventId: 'other', _count: { _all: 90 } },
      ],
      responseToday: [{ eventId: 'live', _count: { _all: 7 } }],
      surveyRows: Array.from({ length: 5 }, () => ({ eventId: 'live', status: 'ACTIVE', surveyTarget: { metadata: null } })),
    })
    const result = await buildEventsHomeMetrics(
      {
        ...baseInput,
        events: [
          { id: 'live', status: 'ACTIVE', isActive: true, startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-07-03T23:59:59.000Z' },
          { id: 'other', status: 'ACTIVE', isActive: false },
        ],
      },
      { db: db as never },
    )

    // Featured live event shows only its own responses, not the 90 from "other".
    expect(result.events.live.responses).toBe(40)
    expect(result.events.other.responses).toBe(90)
  })

  it('uses a today window for responses today, separate from all-time responses', async () => {
    const { db, responseGroupBy } = makeDb({
      responseTotals: [{ eventId: 'live', _count: { _all: 40 } }],
      responseToday: [{ eventId: 'live', _count: { _all: 7 } }],
    })

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'live', status: 'ACTIVE', isActive: true, startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-07-03T23:59:59.000Z' }] },
      { db: db as never },
    )

    expect(result.events.live.responses).toBe(40)
    expect(result.events.live.responsesToday).toBe(7)
    expect(result.summary.responsesToday).toBe(7)

    // The "today" query is filtered to completions at/after UTC midnight.
    const todayWhere = responseGroupBy.mock.calls[1][0].where
    expect(todayWhere.completedAt.gte).toEqual(new Date('2026-07-02T00:00:00.000Z'))
    expect(todayWhere.status).toBe('COMPLETED')
  })

  it('counts surveys from real Survey rows, including active and draft survey lifecycle counts', async () => {
    const { db } = makeDb({
      surveyRows: [
        { eventId: 'live', status: 'ACTIVE', surveyTarget: { metadata: null } },
        { eventId: 'live', status: 'ACTIVE', surveyTarget: { metadata: { listeningPoint: true } } },
        { eventId: 'live', status: 'DRAFT', surveyTarget: { metadata: { seededBy: 'voice-events-demo' } } },
      ],
    })

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'live', status: 'ACTIVE', isActive: true }] },
      { db: db as never },
    )

    expect(result.events.live.surveyCount).toBe(3)
    expect(result.events.live.liveSurveyCount).toBe(2)
    expect(result.events.live.draftSurveyCount).toBe(1)
    expect(db.survey.findMany).toHaveBeenCalledTimes(1)
    expect(db.survey.findMany.mock.calls[0][0].where).toMatchObject({
      surveyTarget: { isActive: true },
    })
  })

  it('excludes internal session and speaker result surveys from workspace counts', async () => {
    const { db } = makeDb({
      surveyRows: [
        { eventId: 'live', status: 'ACTIVE', surveyTarget: { metadata: { listeningPoint: true } } },
        { eventId: 'live', status: 'DRAFT', surveyTarget: { metadata: null } },
        { eventId: 'live', status: 'ACTIVE', surveyTarget: { metadata: { listeningPoint: false, resultScope: 'SESSION' } } },
        { eventId: 'live', status: 'ACTIVE', surveyTarget: { metadata: { listeningPoint: false, resultScope: 'SPEAKER_ASSIGNMENT' } } },
      ],
    })

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'live', status: 'ACTIVE', isActive: true }] },
      { db: db as never },
    )

    expect(result.events.live).toMatchObject({ surveyCount: 2, liveSurveyCount: 1, draftSurveyCount: 1 })
  })

  it('only counts open issue clusters as needing action (never resolved/dismissed)', async () => {
    const { db } = makeDb({
      openClusterTotals: [{ eventId: 'live', _count: { _all: 2 } }],
    })

    const result = await buildEventsHomeMetrics(
      {
        ...baseInput,
        events: [
          { id: 'live', status: 'ACTIVE', isActive: true, startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-07-03T23:59:59.000Z' },
          { id: 'draft', status: 'DRAFT', isActive: false },
        ],
      },
      { db: db as never },
    )

    expect(result.events.live.openAttentionCount).toBe(2)
    // needAction only sums live events.
    expect(result.summary.needActionCount).toBe(2)

    const clusterWhere = db.eventIssueCluster.groupBy.mock.calls[0][0].where
    expect(clusterWhere.status.in).toEqual(OPEN_EVENT_ISSUE_CLUSTER_STATUSES)
    expect(clusterWhere.status.in).not.toContain('RESOLVED')
    expect(clusterWhere.status.in).not.toContain('DISMISSED')
  })

  it('derives shared inferred satisfaction and the top open issue for live events', async () => {
    const { db } = makeDb({
      sentimentGroups: [
        { questionId: 'q-1', _count: { _all: 6 }, _avg: { sentimentScore: 0.7 } },
        { questionId: 'q-2', _count: { _all: 4 }, _avg: { sentimentScore: -0.8 } },
      ],
      openIssues: [
        { id: 'c-open', title: 'Long check-in lines', summary: 'Attendees waiting', priorityLevel: 'Immediate', impactScore: 8, timeSensitivityScore: 9, lastSeenAt: new Date('2026-07-02T11:00:00Z') },
      ],
    })

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'live', status: 'ACTIVE', isActive: true, startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-07-03T23:59:59.000Z' }] },
      { db: db as never },
    )

    expect(result.events.live.satisfaction?.scorePercent).toBe(60)
    expect(result.events.live.satisfaction?.confidence).toBe('ok')
    expect(db.answerEventIntelligence.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['questionId'],
      _count: { _all: true },
      _avg: { sentimentScore: true },
    }))
    // Top open issue skips the resolved cluster.
    expect(result.events.live.topOpenIssue).toEqual({
      id: 'c-open',
      title: 'Long check-in lines',
      summary: 'Attendees waiting',
      priorityLevel: 'Immediate',
    })
  })

  it('does not compute intelligence for non-live events', async () => {
    const { db } = makeDb({ responseTotals: [{ eventId: 'past', _count: { _all: 12 } }] })

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'past', status: 'COMPLETED', isActive: false }] },
      { db: db as never },
    )

    expect(db.answerEventIntelligence.groupBy).not.toHaveBeenCalled()
    expect(db.eventIssueCluster.findMany).not.toHaveBeenCalled()
    expect(result.events.past.satisfaction).toBeNull()
    expect(result.events.past.topOpenIssue).toBeNull()
    expect(result.summary.liveCount).toBe(0)
  })

  it('returns empty metrics for non-EVENTS accounts without querying', async () => {
    const { db } = makeDb({})
    const result = await buildEventsHomeMetrics(
      {
        ...baseInput,
        accountType: 'RETAIL',
        events: [{ id: 'x', status: 'ACTIVE', isActive: true }],
      },
      { db: db as never },
    )

    expect(result.events.x).toBeDefined()
    expect(result.events.x.responses).toBe(0)
    expect(db.response.groupBy).not.toHaveBeenCalled()
  })

  it('survives an intelligence failure without dropping real counts', async () => {
    const { db } = makeDb({
      responseTotals: [{ eventId: 'live', _count: { _all: 5 } }],
      openClusterTotals: [{ eventId: 'live', _count: { _all: 1 } }],
    })
    db.answerEventIntelligence.groupBy.mockRejectedValueOnce(new Error('not found'))

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'live', status: 'ACTIVE', isActive: true }] },
      { db: db as never },
    )

    expect(result.events.live.responses).toBe(5)
    expect(result.events.live.openAttentionCount).toBe(1)
    expect(result.events.live.satisfaction).toBeNull()
  })

  it('attaches a preferred tokenized launch link scoped to active event-wide surveys', async () => {
    const { db, publicSurveyLinkFindMany } = makeDb({
      preferredLinks: [{ token: 'tok_abc', surveyId: 'sv_1', survey: { eventId: 'live' } }],
    })

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'live', status: 'ACTIVE', isActive: true }] },
      { db: db as never },
    )

    expect(result.events.live.launch).toEqual({
      token: 'tok_abc',
      surveyId: 'sv_1',
      kioskPath: '/kiosk?token=tok_abc',
    })

    // The query only considers active, event-wide surveys with active links.
    const where = publicSurveyLinkFindMany.mock.calls[0][0].where
    expect(where.isActive).toBe(true)
    expect(where.survey.status).toBe('ACTIVE')
    expect(where.AND[0].OR).toEqual([
      { surveyTarget: { category: 'EVENT' } },
      { surveyTargetId: null, survey: { surveyTarget: { category: 'EVENT' } } },
    ])
  })

  it('leaves launch null when no event-wide survey link exists (legacy fallback)', async () => {
    const { db } = makeDb({ preferredLinks: [] })

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'live', status: 'ACTIVE', isActive: true }] },
      { db: db as never },
    )

    expect(result.events.live.launch).toBeNull()
  })

  it('keeps only the first launch link per event', async () => {
    const { db } = makeDb({
      preferredLinks: [
        { token: 'tok_first', surveyId: 'sv_1', survey: { eventId: 'live' } },
        { token: 'tok_second', surveyId: 'sv_2', survey: { eventId: 'live' } },
      ],
    })

    const result = await buildEventsHomeMetrics(
      { ...baseInput, events: [{ id: 'live', status: 'ACTIVE', isActive: true }] },
      { db: db as never },
    )

    expect(result.events.live.launch?.token).toBe('tok_first')
  })
})
