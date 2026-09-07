import { beforeEach, describe, expect, it, vi } from 'vitest'

const computeSignalsWithDataMock = vi.fn()
const fetchEventDataLifetimeMock = vi.fn()
const computeLifetimeKeyInsightsPayloadMock = vi.fn()

const { prismaMock, requireEventAccessMock } = vi.hoisted(() => ({
  requireEventAccessMock: vi.fn(),
  prismaMock: {
    account: {
      findUnique: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
    },
    survey: {
      findFirst: vi.fn(),
    },
    eventStructureItem: {
      findFirst: vi.fn(),
    },
    insight: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/auth/require-events-event-access', () => ({
  requireEventAccess: requireEventAccessMock,
}))

vi.mock('@/lib/analytics/signals', () => ({
  computeSignalsWithData: computeSignalsWithDataMock,
  fetchEventDataLifetime: fetchEventDataLifetimeMock,
  computeLifetimeKeyInsightsPayload: computeLifetimeKeyInsightsPayloadMock,
}))

const NON_EVENTS_ACCOUNT_TYPES = ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined] as const

const emptySignals = {
  pulse: {
    score: null,
    label: null,
    delta: null,
    confidence: null,
    components: { sentiment: 25, volume: 0, diversity: 0 },
    metadata: { responseCount: 0, themeCount: 0, avgSentiment: 0 },
  },
  momentum: {
    label: null,
    slope: null,
    sentimentDeltaPoints: null,
    confidence: 0,
    confidenceLabel: 'Low',
    metadata: {
      daysWithData: 0,
      totalResponses: 0,
      previousResponses: 0,
      dateRange: {
        start: '2026-06-01T00:00:00.000Z',
        end: '2026-06-02T00:00:00.000Z',
      },
    },
  },
  topFriction: {
    status: 'none',
    severity: 0,
    theme: null,
    frictionScore: null,
    mentionCount: null,
    negativeMentionsCount: null,
    avgSentiment: null,
    lastMention: null,
    frictionType: null,
    frictionReason: null,
    components: { frequencyWeight: 0, severityWeight: 0, recencyWeight: 0 },
  },
  biggestOpportunity: {
    type: null,
    text: null,
    opportunityScore: null,
    mentionCount: null,
    priority: null,
    impactScore: null,
    effortScore: null,
    opportunities: [],
    components: { improvementPotential: 0, frequencySignal: 0, effortEstimate: 0 },
  },
  themeSentimentBreakdown: [],
  metadata: {
    periodStart: '2026-06-01T00:00:00.000Z',
    periodEnd: '2026-06-02T00:00:00.000Z',
    totalResponses: 0,
    completedResponses: 0,
    answersCaptured: 0,
    answersAnalyzed: 0,
    totalAnswers: 0,
    computedAt: '2026-06-02T00:00:00.000Z',
  },
}

describe('GET /api/app/events/[eventId]/signals', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    requireEventAccessMock.mockImplementation(async (_accountSlug: string | null, eventId: string) => ({
      ok: true,
      userId: 'user_123',
      account: await prismaMock.account.findUnique(),
      event: {
        id: eventId,
        startDate: new Date('2099-09-10T09:00:00.000Z'),
        endDate: new Date('2099-09-12T17:00:00.000Z'),
        location: { timezone: 'America/New_York' },
      },
    }))
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'event_123',
      name: 'Event Container',
      status: 'ACTIVE',
    })
    prismaMock.survey.findFirst.mockResolvedValue({
      id: 'survey_123',
      surveyTarget: {
        eventStructureItemId: 'structure_123',
        eventStructureItem: { kind: 'SESSION' },
      },
    })
    prismaMock.eventStructureItem.findFirst.mockResolvedValue({ id: 'structure_123', kind: 'SESSION' })
    computeSignalsWithDataMock.mockResolvedValue({
      signals: emptySignals,
      windowData: { responses: [], periodStart: new Date('2026-06-01T00:00:00.000Z'), periodEnd: new Date('2026-06-02T00:00:00.000Z') },
      windowDays: 30,
    })
    fetchEventDataLifetimeMock.mockResolvedValue({
      responses: [],
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-02T00:00:00.000Z'),
    })
    computeLifetimeKeyInsightsPayloadMock.mockReturnValue({
      themeSentimentBreakdown: [],
      biggestOpportunity: emptySignals.biggestOpportunity,
    })
    prismaMock.insight.findMany.mockResolvedValue([])
  })

  it('computes signals for a selected survey without syncing event-level insights', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/signals/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/signals?account=events-co&windowDays=30&surveyId=survey_123',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.data.surveyId).toBe('survey_123')
    expect(prismaMock.survey.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'survey_123',
        eventId: 'event_123',
      },
      select: {
        id: true,
        surveyTarget: {
          select: {
            eventStructureItemId: true,
            eventStructureItem: {
              select: {
                kind: true,
              },
            },
          },
        },
        publicSurveyLinks: {
          select: {
            surveyTarget: {
              select: {
                eventStructureItemId: true,
                eventStructureItem: {
                  select: {
                    kind: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    expect(computeSignalsWithDataMock).toHaveBeenCalledWith({
      eventId: 'event_123',
      windowDays: 30,
      surveyId: 'survey_123',
      eventStructureItemId: null,
      structureKind: null,
      lifecyclePhase: 'PRE_EVENT',
    })
    expect(fetchEventDataLifetimeMock).toHaveBeenCalledWith('event_123', 'survey_123', {
      eventStructureItemId: null,
      structureKind: null,
    }, 'PRE_EVENT')
    expect(prismaMock.insight.findMany).not.toHaveBeenCalled()
  })

  it('rejects cross-account signals access before computing analytics', async () => {
    const { NextResponse } = await import('next/server')
    requireEventAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Event not found or access denied' }, { status: 404 }),
    })
    const { GET } = await import('@/app/api/app/events/[eventId]/signals/route')

    const response = await GET(
      { url: 'http://localhost/api/app/events/event_other/signals?account=events-co' } as never,
      { params: { eventId: 'event_other' } },
    )

    expect(response.status).toBe(404)
    expect(computeSignalsWithDataMock).not.toHaveBeenCalled()
  })

  it('computes signals scoped to an EventStructureItem without syncing event-level insights', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/signals/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/signals?account=events-co&windowDays=30&eventStructureItemId=structure_123',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.data.eventStructureItemId).toBe('structure_123')
    expect(computeSignalsWithDataMock).toHaveBeenCalledWith({
      eventId: 'event_123',
      windowDays: 30,
      surveyId: null,
      eventStructureItemId: 'structure_123',
      structureKind: null,
      lifecyclePhase: 'PRE_EVENT',
    })
    expect(fetchEventDataLifetimeMock).toHaveBeenCalledWith('event_123', null, {
      eventStructureItemId: 'structure_123',
      structureKind: null,
    }, 'PRE_EVENT')
    expect(prismaMock.insight.findMany).not.toHaveBeenCalled()
  })

  it('keeps an unfiltered dashboard read read-only and maps persisted insights', async () => {
    prismaMock.insight.findMany.mockResolvedValue([
      { id: 'insight_1', themeKey: 'registration' },
    ])
    const { GET } = await import('@/app/api/app/events/[eventId]/signals/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/signals?account=events-co&windowDays=30',
      } as never,
      { params: { eventId: 'event_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(prismaMock.insight.findMany).toHaveBeenCalledWith({
      where: { eventId: 'event_123' },
      select: { id: true, themeKey: true },
    })
    expect(json.data.insightKeyByThemeKey).toEqual({ registration: 'insight_1' })
  })

  it('allows retail base signals calls without structure filters', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'RETAIL' })
    const { GET } = await import('@/app/api/app/events/[eventId]/signals/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/signals?account=retail-co&windowDays=30',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(200)
    expect(computeSignalsWithDataMock).toHaveBeenCalledWith({
      eventId: 'event_123',
      windowDays: 30,
      surveyId: null,
      eventStructureItemId: null,
      structureKind: null,
    })
  })

  it('rejects non-EVENTS structure filters before computing signals', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/signals/route')

    for (const accountType of NON_EVENTS_ACCOUNT_TYPES) {
      vi.clearAllMocks()
      prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType })
      prismaMock.event.findFirst.mockResolvedValue({
        id: 'event_123',
        name: 'Event Container',
        status: 'ACTIVE',
      })

      const response = await GET(
        {
          url: 'http://localhost/api/app/events/event_123/signals?account=retail-co&structureKind=SESSION',
        } as never,
        { params: { eventId: 'event_123' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.message).toBe('Event structure dashboard filters are only available for EVENTS accounts')
      expect(computeSignalsWithDataMock).not.toHaveBeenCalled()
    }
  })

  it('rejects a surveyId from another event before computing signals', async () => {
    prismaMock.survey.findFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/app/events/[eventId]/signals/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/signals?account=events-co&surveyId=survey_other',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.message).toBe('Survey not found for this event')
    expect(computeSignalsWithDataMock).not.toHaveBeenCalled()
  })
})
