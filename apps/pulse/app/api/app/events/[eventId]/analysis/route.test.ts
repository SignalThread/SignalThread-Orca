import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, requireEventAccessMock, getEventPreEventReadinessMock, getEventClosingBriefMock, getEventIntelligenceSummaryMock } = vi.hoisted(() => ({
  requireEventAccessMock: vi.fn(),
  getEventPreEventReadinessMock: vi.fn(),
  getEventClosingBriefMock: vi.fn(),
  getEventIntelligenceSummaryMock: vi.fn(),
  prismaMock: {
    $transaction: vi.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries)),
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
    response: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    answer: {
      count: vi.fn(),
    },
    answerAnalysis: {
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

vi.mock('@/lib/event-pre-event-readiness', () => ({
  getEventPreEventReadiness: getEventPreEventReadinessMock,
}))

vi.mock('@/lib/event-closing-brief', () => ({
  getEventClosingBrief: getEventClosingBriefMock,
}))

vi.mock('@/lib/event-intelligence/aggregation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-intelligence/aggregation')>()
  return {
    ...actual,
    getEventIntelligenceSummary: getEventIntelligenceSummaryMock,
  }
})

const NON_EVENTS_ACCOUNT_TYPES = ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined] as const

describe('GET /api/app/events/[eventId]/analysis', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getEventPreEventReadinessMock.mockReset()
    getEventClosingBriefMock.mockReset()
    getEventIntelligenceSummaryMock.mockReset()
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', slug: 'events-co', accountType: 'EVENTS' })
    requireEventAccessMock.mockImplementation(async (_accountSlug: string | null, eventId: string) => ({
      ok: true,
      userId: 'user_123',
      account: await prismaMock.account.findUnique(),
      event: await prismaMock.event.findFirst() ?? { id: eventId },
    }))
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'event_123',
      name: 'Event Container',
      status: 'ACTIVE',
      eventType: 'SURVEY',
      isActive: true,
      startDate: null,
      endDate: null,
    })
    prismaMock.survey.findFirst.mockResolvedValue({
      id: 'survey_123',
      surveyTarget: {
        eventStructureItemId: 'structure_123',
        eventStructureItem: { kind: 'SESSION' },
      },
    })
    prismaMock.eventStructureItem.findFirst.mockResolvedValue({ id: 'structure_123', kind: 'SESSION' })
    prismaMock.response.count.mockResolvedValue(1)
    prismaMock.response.findFirst.mockResolvedValue({ startedAt: new Date('2026-06-01T12:00:00.000Z') })
    prismaMock.response.findMany.mockResolvedValue([
      {
        id: 'response_123',
        status: 'COMPLETED',
      },
    ])
    prismaMock.answer.count.mockResolvedValue(1)
    prismaMock.answerAnalysis.findMany.mockResolvedValue([{
      sentimentScore: 0.7,
      themesJson: { themes: ['Session Content'] },
      actionsJson: { actionItems: [{ text: 'Repeat the format', priority: 'Low' }] },
    }])
    getEventIntelligenceSummaryMock.mockResolvedValue({
      responseCount: 1,
      capturedAnswerCount: 2,
      answerCount: 1,
      avgSentiment: 0.7,
      eventPulse: {
        sentimentLabel: 'POSITIVE',
        summary: '1 analyzed answer across 1 completed response.',
        lastComputedAt: '2026-07-30T12:00:00.000Z',
      },
      topThemes: [{ label: 'Session Content', count: 1 }],
      topActions: [{ title: 'Repeat the format', priority: 'LOW' }],
    })
  })

  it('uses survey intelligence rather than setup readiness for future Events', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'event_123',
      name: 'Future Event',
      status: 'ACTIVE',
      eventType: 'SURVEY',
      isActive: true,
      startDate: new Date('2026-09-01T12:00:00.000Z'),
      endDate: new Date('2026-09-02T12:00:00.000Z'),
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'))
    try {
      const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')
      const response = await GET(
        { url: 'http://localhost/api/app/events/event_123/analysis?account=events-co' } as never,
        { params: { eventId: 'event_123' } },
      )
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data.lifecyclePhase).toBe('PRE_EVENT')
      expect(json.data.preEventReadiness).toBeUndefined()
      expect(getEventPreEventReadinessMock).not.toHaveBeenCalled()
      expect(json.data.totalResponses).toBe(1)
      expect(getEventIntelligenceSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ lifecyclePhase: 'PRE_EVENT' }))
      expect(prismaMock.response.count).not.toHaveBeenCalled()
      expect(prismaMock.response.findFirst).not.toHaveBeenCalled()
      expect(prismaMock.response.findMany).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['future', new Date('2026-07-30T12:00:00.000Z'), new Date('2026-09-01T12:00:00.000Z'), new Date('2026-09-02T12:00:00.000Z'), 'PRE_EVENT'],
    ['running', new Date('2026-08-01T12:00:00.000Z'), new Date('2026-08-01T09:00:00.000Z'), new Date('2026-08-01T17:00:00.000Z'), 'IN_EVENT'],
    ['ended', new Date('2026-08-03T12:00:00.000Z'), new Date('2026-08-01T09:00:00.000Z'), new Date('2026-08-02T17:00:00.000Z'), 'POST_EVENT'],
  ])('uses the same date-derived default for direct Signals dashboard entry when the Event is %s', async (_state, now, startDate, endDate, phase) => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'event_123', name: 'Lifecycle Event', status: 'ACTIVE', eventType: 'EVENT', isActive: true, startDate, endDate,
    })
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')
      const response = await GET(
        { url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&scope=bootstrap' } as never,
        { params: { eventId: 'event_123' } },
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ data: { lifecyclePhase: phase, defaultLifecyclePhase: phase } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps dashboard lifecycle neutral when event dates are missing', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')
    const response = await GET(
      { url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&scope=bootstrap' } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ data: { lifecyclePhase: null, defaultLifecyclePhase: null } })
  })

  it('adds one account-scoped closing payload only for canonical post-event lifecycle', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'event_123', name: 'Completed Event', status: 'COMPLETED', eventType: 'EVENT', isActive: false,
      startDate: new Date('2026-07-01T12:00:00.000Z'), endDate: new Date('2026-07-02T12:00:00.000Z'),
    })
    const closingBrief = {
      lifecyclePhase: 'POST_EVENT',
      generatedAt: '2026-07-30T12:00:00.000Z',
      summary: {
        responseCount: 42,
        answerCount: 67,
        avgSentiment: 0.4,
        sentiment: 'Mostly positive',
        verdict: 'Attendee evidence indicates a positive event outcome.',
      },
    }
    getEventClosingBriefMock.mockResolvedValue(closingBrief)

    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')
    const response = await GET(
      { url: 'http://localhost/api/app/events/event_123/analysis?account=events-co' } as never,
      { params: { eventId: 'event_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.lifecyclePhase).toBe('POST_EVENT')
    expect(json.data.postEventClosingBrief).toEqual(closingBrief)
    expect(json.data.totalResponses).toBe(42)
    expect(json.data.totalAnswers).toBe(67)
    expect(json.data.overallSummary).toBe(closingBrief.summary.verdict)
    expect(json.data.avgSentimentScore).toBe(0.7)
    expect(getEventClosingBriefMock).toHaveBeenCalledWith({ accountId: 'acct_123', accountSlug: 'events-co', eventId: 'event_123', lifecyclePhase: 'POST_EVENT', forceEditorialRefresh: false })
    expect(getEventPreEventReadinessMock).not.toHaveBeenCalled()
    expect(prismaMock.response.count).not.toHaveBeenCalled()
    expect(prismaMock.response.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.response.findMany).not.toHaveBeenCalled()
  })

  it('keeps old lifecycle URLs backward-compatible but date-authoritative', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'event_123', name: 'Future Event', status: 'ACTIVE', eventType: 'EVENT', isActive: true,
      startDate: new Date('2026-09-01T12:00:00.000Z'), endDate: new Date('2026-09-02T12:00:00.000Z'),
    })
    const closingBrief = {
      lifecyclePhase: 'POST_EVENT', generatedAt: '2026-07-30T12:00:00.000Z',
      summary: { responseCount: 2, answerCount: 3, avgSentiment: 0, sentiment: 'Mixed', verdict: 'Closing view.' },
    }
    getEventClosingBriefMock.mockResolvedValue(closingBrief)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'))
    try {
      const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')
      const response = await GET(
        { url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&lifecycle=post-event&cacheBust=1' } as never,
        { params: { eventId: 'event_123' } },
      )
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data.defaultLifecyclePhase).toBe('PRE_EVENT')
      expect(json.data.lifecyclePhase).toBe('PRE_EVENT')
      expect(json.data.postEventClosingBrief).toBeUndefined()
      expect(getEventPreEventReadinessMock).not.toHaveBeenCalled()
      expect(getEventClosingBriefMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps All Surveys dashboard analysis unfiltered when no scope is selected', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&days=30',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.data).toMatchObject({
      totalResponses: 1,
      completedResponses: 1,
      totalAnswers: 2,
      answersCaptured: 2,
      answersAnalyzed: 1,
    })
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledWith(expect.objectContaining({
      accountSlug: 'events-co',
      eventId: 'event_123',
      filters: expect.objectContaining({ days: 30 }),
    }))
    expect(prismaMock.response.findMany).not.toHaveBeenCalled()
    expect(prismaMock.answerAnalysis.findMany).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated analysis before querying analytics data', async () => {
    const { NextResponse } = await import('next/server')
    requireEventAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    })
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      { url: 'http://localhost/api/app/events/event_123/analysis?account=events-co' } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(401)
    expect(prismaMock.response.findMany).not.toHaveBeenCalled()
  })

  it('filters dashboard analysis responses by an event-scoped surveyId', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&days=30&surveyId=survey_123',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.data.totalResponses).toBe(1)
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_123',
      filters: expect.objectContaining({ surveyId: 'survey_123', days: 30 }),
    }))
    expect(prismaMock.response.findMany).not.toHaveBeenCalled()
  })

  it('filters dashboard analysis by eventStructureItemId', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&eventStructureItemId=structure_123',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(200)
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ eventStructureItemId: 'structure_123' }),
    }))
    expect(prismaMock.response.findMany).not.toHaveBeenCalled()
  })

  it('filters dashboard analysis by structureKind', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&structureKind=SPONSOR_ACTIVATION',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(200)
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ structureKind: 'SPONSOR_ACTIVATION' }),
    }))
    expect(prismaMock.response.findMany).not.toHaveBeenCalled()
  })

  it('allows retail base dashboard analysis without structure filters', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'RETAIL' })
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/analysis?account=retail-co&days=30',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(200)
    expect(prismaMock.response.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_123',
        }),
      }),
    )
  })

  it('allows missing or unknown accountType base dashboard analysis without structure filters', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    for (const accountType of ['UNKNOWN', null, undefined] as const) {
      vi.clearAllMocks()
      prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType })
      prismaMock.event.findFirst.mockResolvedValue({
        id: 'event_123',
        name: 'Event Container',
        status: 'ACTIVE',
        eventType: 'SURVEY',
      })
      prismaMock.response.count.mockResolvedValue(1)
      prismaMock.response.findFirst.mockResolvedValue({ startedAt: new Date('2026-06-01T12:00:00.000Z') })
      prismaMock.response.findMany.mockResolvedValue([])

      const response = await GET(
        {
          url: 'http://localhost/api/app/events/event_123/analysis?account=retail-co&days=30',
        } as never,
        { params: { eventId: 'event_123' } },
      )

      expect(response.status).toBe(200)
      expect(prismaMock.eventStructureItem.findFirst).not.toHaveBeenCalled()
      expect(prismaMock.response.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventId: 'event_123',
          }),
        }),
      )
    }
  })

  it('rejects non-EVENTS structure filters before querying responses', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    for (const accountType of NON_EVENTS_ACCOUNT_TYPES) {
      vi.clearAllMocks()
      prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType })
      prismaMock.event.findFirst.mockResolvedValue({
        id: 'event_123',
        name: 'Event Container',
        status: 'ACTIVE',
        eventType: 'SURVEY',
      })

      const response = await GET(
        {
          url: 'http://localhost/api/app/events/event_123/analysis?account=retail-co&structureKind=SESSION',
        } as never,
        { params: { eventId: 'event_123' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.message).toBe('Event structure dashboard filters are only available for EVENTS accounts')
      expect(prismaMock.response.findMany).not.toHaveBeenCalled()
    }
  })

  it('rejects an eventStructureItemId from another event/account', async () => {
    getEventIntelligenceSummaryMock.mockRejectedValue(
      Object.assign(new Error('Event structure item not found for this event'), { status: 404 }),
    )
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&eventStructureItemId=structure_other',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.message).toBe('Event structure item not found for this event')
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledOnce()
  })

  it('returns a clear 400 when surveyId conflicts with eventStructureItemId', async () => {
    getEventIntelligenceSummaryMock.mockRejectedValue(
      Object.assign(new Error('surveyId conflicts with eventStructureItemId'), { status: 400 }),
    )
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&surveyId=survey_123&eventStructureItemId=structure_other',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json.message).toBe('surveyId conflicts with eventStructureItemId')
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledOnce()
  })

  it('rejects a surveyId from another event before querying responses', async () => {
    getEventIntelligenceSummaryMock.mockRejectedValue(
      Object.assign(new Error('Survey not found for this event'), { status: 404 }),
    )
    const { GET } = await import('@/app/api/app/events/[eventId]/analysis/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/analysis?account=events-co&surveyId=survey_other',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.message).toBe('Survey not found for this event')
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledOnce()
  })
})
