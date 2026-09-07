import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    response: {
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

const NON_EVENTS_ACCOUNT_TYPES = ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined] as const

describe('GET /api/app/events/[eventId]/timeline', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    requireEventAccessMock.mockImplementation(async (_accountSlug: string | null, eventId: string) => ({
      ok: true,
      userId: 'user_123',
      account: await prismaMock.account.findUnique(),
      event: { id: eventId },
    }))
    prismaMock.event.findFirst.mockResolvedValue({ id: 'event_123' })
    prismaMock.survey.findFirst.mockResolvedValue({
      id: 'survey_123',
      surveyTarget: {
        eventStructureItemId: 'structure_123',
        eventStructureItem: { kind: 'SESSION' },
      },
    })
    prismaMock.eventStructureItem.findFirst.mockResolvedValue({ id: 'structure_123', kind: 'SESSION' })
    prismaMock.response.findMany.mockResolvedValue([
      { startedAt: new Date('2026-06-01T12:00:00.000Z') },
    ])
  })

  it('filters timeline responses by an event-scoped surveyId', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/timeline/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/timeline?account=events-co&days=30&surveyId=survey_123',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(200)
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
    expect(prismaMock.response.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_123',
          surveyId: 'survey_123',
        }),
      }),
    )
  })

  it('rejects cross-account timeline access before querying rows', async () => {
    const { NextResponse } = await import('next/server')
    requireEventAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Event not found or access denied' }, { status: 404 }),
    })
    const { GET } = await import('@/app/api/app/events/[eventId]/timeline/route')

    const response = await GET(
      { url: 'http://localhost/api/app/events/event_other/timeline?account=events-co' } as never,
      { params: { eventId: 'event_other' } },
    )

    expect(response.status).toBe(404)
    expect(prismaMock.response.findMany).not.toHaveBeenCalled()
  })

  it('filters timeline responses by eventStructureItemId and structureKind', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/timeline/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/timeline?account=events-co&days=30&eventStructureItemId=structure_123&structureKind=SESSION',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    expect(response.status).toBe(200)
    expect(prismaMock.response.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_123',
          OR: expect.arrayContaining([{
            surveyTarget: {
              eventStructureItemId: 'structure_123',
              eventStructureItem: { kind: 'SESSION' },
            },
          }]),
        }),
      }),
    )
  })

  it('allows retail base timeline calls without structure filters', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'RETAIL' })
    const { GET } = await import('@/app/api/app/events/[eventId]/timeline/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/timeline?account=retail-co&days=30',
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

  it('rejects non-EVENTS structure filters before querying timeline rows', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/timeline/route')

    for (const accountType of NON_EVENTS_ACCOUNT_TYPES) {
      vi.clearAllMocks()
      prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType })
      prismaMock.event.findFirst.mockResolvedValue({ id: 'event_123' })

      const response = await GET(
        {
          url: 'http://localhost/api/app/events/event_123/timeline?account=retail-co&eventStructureItemId=structure_123',
        } as never,
        { params: { eventId: 'event_123' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.message).toBe('Event structure dashboard filters are only available for EVENTS accounts')
      expect(prismaMock.response.findMany).not.toHaveBeenCalled()
    }
  })

  it('rejects a surveyId from another event before querying timeline rows', async () => {
    prismaMock.survey.findFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/app/events/[eventId]/timeline/route')

    const response = await GET(
      {
        url: 'http://localhost/api/app/events/event_123/timeline?account=events-co&surveyId=survey_other',
      } as never,
      { params: { eventId: 'event_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.message).toBe('Survey not found for this event')
    expect(prismaMock.response.findMany).not.toHaveBeenCalled()
  })
})
