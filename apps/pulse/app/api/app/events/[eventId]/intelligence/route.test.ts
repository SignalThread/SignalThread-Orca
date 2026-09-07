import { beforeEach, describe, expect, it, vi } from 'vitest'

const getEventIntelligenceSummaryMock = vi.fn()
const requireEventsEventAccessMock = vi.fn()

vi.mock('@/lib/auth/require-events-event-access', () => ({
  requireEventsEventAccess: requireEventsEventAccessMock,
}))

vi.mock('@/lib/event-intelligence/aggregation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/event-intelligence/aggregation')>(
    '@/lib/event-intelligence/aggregation',
  )
  return {
    ...actual,
    getEventIntelligenceSummary: getEventIntelligenceSummaryMock,
  }
})

describe('GET /api/app/events/[eventId]/intelligence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireEventsEventAccessMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'account_123', slug: 'events-co', accountType: 'EVENTS' },
      event: { id: 'event_123', name: 'Event', status: 'ACTIVE', eventType: 'SURVEY' },
    })
  })

  it('requires an account query parameter', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/intelligence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/intelligence'),
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json.error).toBe('Account parameter required')
    expect(getEventIntelligenceSummaryMock).not.toHaveBeenCalled()
  })

  it('returns event intelligence summaries with supported filters', async () => {
    getEventIntelligenceSummaryMock.mockResolvedValue({
      eventId: 'event_123',
      eventPulse: { status: 'ATTENTION' },
      responseCount: 2,
      answerCount: 3,
      avgSentiment: -0.1,
      highUrgencyCount: 1,
      topThemes: [],
      topActions: [],
      targetBreakdown: [],
      questionBreakdown: [],
      urgentIssues: [],
      signalCandidates: [],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/intelligence/route')

    const response = await GET(
      {
        nextUrl: new URL(
          'http://localhost/api/app/events/event_123/intelligence?account=events-co&surveyId=survey_123&surveyTargetId=target_123&questionId=question_123&eventStructureItemId=structure_123&structureKind=SESSION&sentimentLabel=negative&urgency=high&days=7',
        ),
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.responseCount).toBe(2)
    expect(requireEventsEventAccessMock).toHaveBeenCalledWith('events-co', 'event_123')
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledWith({
      accountSlug: 'events-co',
      eventId: 'event_123',
      filters: {
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        questionId: 'question_123',
        eventStructureItemId: 'structure_123',
        structureKind: 'SESSION',
        sentimentLabel: 'NEGATIVE',
        urgency: 'HIGH',
        days: 7,
      },
      authorized: {
        account: { id: 'account_123', accountType: 'EVENTS' },
        event: { id: 'event_123', name: 'Event', status: 'ACTIVE', eventType: 'SURVEY' },
      },
      lifecyclePhase: null,
      attention: { limit: 25, cursor: null },
    })
  })

  it('rejects unauthenticated account access before loading intelligence', async () => {
    const { NextResponse } = await import('next/server')
    requireEventsEventAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    })
    const { GET } = await import('@/app/api/app/events/[eventId]/intelligence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/intelligence?account=events-co'),
      } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(401)
    expect(getEventIntelligenceSummaryMock).not.toHaveBeenCalled()
  })

  it('keeps ordinary reads mutation-free and returns the persisted summary once', async () => {
    getEventIntelligenceSummaryMock.mockResolvedValue({ attentionQueue: [{ id: 'alert_1', status: 'NEW' }] })
    const { GET } = await import('@/app/api/app/events/[eventId]/intelligence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/intelligence?account=events-co'),
      } as never,
      { params: { eventId: 'event_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledTimes(1)
    expect(json.data.attentionQueue).toEqual([{ id: 'alert_1', status: 'NEW' }])
  })

  it('bounds attention pagination requested by the client', async () => {
    getEventIntelligenceSummaryMock.mockResolvedValue({ attentionQueue: [] })
    const { GET } = await import('@/app/api/app/events/[eventId]/intelligence/route')
    await GET({
      nextUrl: new URL('http://localhost/api/app/events/event_123/intelligence?account=events-co&limit=999&cursor=cluster_25'),
    } as never, { params: { eventId: 'event_123' } })

    expect(getEventIntelligenceSummaryMock).toHaveBeenCalledWith(expect.objectContaining({
      attention: { limit: 50, cursor: 'cluster_25' },
    }))
  })

  it('returns service status errors cleanly', async () => {
    const { EventIntelligenceAggregationError } = await import('@/lib/event-intelligence/aggregation')
    getEventIntelligenceSummaryMock.mockRejectedValue(
      new EventIntelligenceAggregationError('Event not found or access denied', 404),
    )

    const { GET } = await import('@/app/api/app/events/[eventId]/intelligence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_missing/intelligence?account=events-co'),
      } as never,
      { params: { eventId: 'event_missing' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.error).toBe('Event not found or access denied')
  })

  it('returns product-mode guard errors cleanly', async () => {
    const { EventIntelligenceAggregationError } = await import('@/lib/event-intelligence/aggregation')
    getEventIntelligenceSummaryMock.mockRejectedValue(
      new EventIntelligenceAggregationError('Event intelligence is only available for EVENTS accounts', 403),
    )

    const { GET } = await import('@/app/api/app/events/[eventId]/intelligence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/intelligence?account=retail-co'),
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(403)
    expect(json.error).toBe('Event intelligence is only available for EVENTS accounts')
  })
})
