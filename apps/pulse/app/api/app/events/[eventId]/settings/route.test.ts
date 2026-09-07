import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAccountAdminMock = vi.fn()

const prismaMock = {
  event: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}

vi.mock('@/lib/auth/require-account-admin', () => ({
  requireAccountAdmin: requireAccountAdminMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

function eventRecord(accountType: string | null | undefined) {
  return {
    id: 'evt_123',
    startDate: null,
    endDate: null,
    location: {
      account: {
        accountType,
      },
    },
  }
}

describe('PATCH /api/app/events/[eventId]/settings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'acme', name: 'Acme Events' },
    })
    prismaMock.event.findFirst.mockResolvedValue(eventRecord('EVENTS'))
    prismaMock.event.update.mockResolvedValue({
      id: 'evt_123',
      name: 'Updated Event',
      description: 'Two days of sessions',
      status: 'ACTIVE',
      startDate: new Date('2026-07-01T09:00:00.000Z'),
      endDate: new Date('2026-07-02T17:00:00.000Z'),
    })
  })

  it('updates safe event metadata for EVENTS accounts', async () => {
    const { PATCH } = await import('@/app/api/app/events/[eventId]/settings/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
        json: async () => ({
          name: 'Updated Event',
          description: 'Two days of sessions',
          startDate: '2026-07-01T09:00',
          endDate: '2026-07-02T17:00',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt_123' },
        data: expect.objectContaining({
          name: 'Updated Event',
          description: 'Two days of sessions',
        }),
      }),
    )
    const updateArgs = prismaMock.event.update.mock.calls[0][0]
    expect(updateArgs.data.startDate).toBeInstanceOf(Date)
    expect(updateArgs.data.endDate).toBeInstanceOf(Date)

    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.event.name).toBe('Updated Event')
  })

  it('clears dates and description when explicitly set to null', async () => {
    const { PATCH } = await import('@/app/api/app/events/[eventId]/settings/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
        json: async () => ({ description: null, startDate: null, endDate: null }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { description: null, startDate: null, endDate: null },
      }),
    )
  })

  it('rejects non-EVENTS account types without updating the event', async () => {
    const { PATCH } = await import('@/app/api/app/events/[eventId]/settings/route')

    for (const accountType of ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined]) {
      prismaMock.event.findFirst.mockResolvedValueOnce(eventRecord(accountType))

      const response = await PATCH(
        {
          nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
          json: async () => ({ name: 'Updated Event' }),
        } as never,
        { params: { eventId: 'evt_123' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.error).toBe('Event settings are only available for EVENTS accounts')
    }

    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the event is outside the scoped account', async () => {
    prismaMock.event.findFirst.mockResolvedValue(null)

    const { PATCH } = await import('@/app/api/app/events/[eventId]/settings/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_other/settings?account=acme'),
        json: async () => ({ name: 'Updated Event' }),
      } as never,
      { params: { eventId: 'evt_other' } },
    )

    expect(response.status).toBe(404)
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('rejects an end date that is before the start date', async () => {
    const { PATCH } = await import('@/app/api/app/events/[eventId]/settings/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
        json: async () => ({
          startDate: '2026-07-02T17:00',
          endDate: '2026-07-01T09:00',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json.error).toBe('End date cannot be before the start date')
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('persists date-only input as the intended calendar date (noon UTC, no midnight drift)', async () => {
    const { PATCH } = await import('@/app/api/app/events/[eventId]/settings/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
        json: async () => ({ startDate: '2026-09-17', endDate: '2026-09-18' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    const updateArgs = prismaMock.event.update.mock.calls[0][0]
    expect(updateArgs.data.startDate.toISOString()).toBe('2026-09-17T12:00:00.000Z')
    expect(updateArgs.data.endDate.toISOString()).toBe('2026-09-18T12:00:00.000Z')
    expect(updateArgs.data.startDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' })).toBe('9/17/2026')
  })

  it('updates and clears the venue through the canonical settings path', async () => {
    const { PATCH } = await import('@/app/api/app/events/[eventId]/settings/route')

    const setResponse = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
        json: async () => ({ venue: 'Henry B. González Convention Center' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )
    expect(setResponse.status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { venue: 'Henry B. González Convention Center' } }),
    )

    const clearResponse = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
        json: async () => ({ venue: null }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )
    expect(clearResponse.status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { venue: null } }),
    )
  })

  it('reports invalid dates and validation failures with human field labels, not raw keys', async () => {
    const { PATCH } = await import('@/app/api/app/events/[eventId]/settings/route')

    const invalidDate = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
        json: async () => ({ startDate: 'not-a-date' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )
    const invalidDateJson = await invalidDate.json()
    expect(invalidDate.status).toBe(400)
    expect(invalidDateJson.error).toBe('Start date must be a valid date')

    const invalidName = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/settings?account=acme'),
        json: async () => ({ name: '' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )
    const invalidNameJson = await invalidName.json()
    expect(invalidName.status).toBe(400)
    expect(invalidNameJson.message).toContain('Event name: Event name is required')
    expect(invalidNameJson.message).not.toMatch(/(^|, )name:/)
  })
})
