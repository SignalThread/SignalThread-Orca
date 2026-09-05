import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    account: {
      findUnique: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
    },
    eventStructureItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    location: {
      findFirst: vi.fn(),
    },
  },
}))

const requireAccountAdminMock = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/auth/require-account-admin', () => ({
  requireAccountAdmin: requireAccountAdminMock,
}))

const NON_EVENTS_ACCOUNT_TYPES = ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined] as const

function request(url: string, body?: unknown) {
  return {
    nextUrl: new URL(url),
    json: vi.fn().mockResolvedValue(body),
  } as never
}

function structureItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'structure_123',
    eventId: 'event_123',
    kind: 'SESSION',
    name: 'Opening Keynote',
    slug: 'opening-keynote',
    description: 'Main stage keynote',
    parentId: null,
    locationId: 'loc_123',
    startsAt: new Date('2026-06-10T14:00:00.000Z'),
    endsAt: new Date('2026-06-10T15:00:00.000Z'),
    timezone: 'America/New_York',
    sortOrder: 1,
    metadata: { track: 'Main' },
    isActive: true,
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:30:00.000Z'),
    ...overrides,
  }
}

function mockScopedEventsAccount() {
  prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
  prismaMock.event.findFirst.mockResolvedValue({ id: 'event_123' })
}

describe('Event structure API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'events-co', name: 'Events Co' },
    })
    // No same-kind duplicates in the event unless a test says otherwise.
    prismaMock.eventStructureItem.findMany.mockResolvedValue([])
  })

  it('GET lists active structure items for the requested Event/account', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findMany.mockResolvedValue([
      structureItem(),
      structureItem({ id: 'structure_456', kind: 'AREA', name: 'Expo Hall', slug: 'expo-hall' }),
    ])

    const { GET } = await import('@/app/api/app/events/[eventId]/structure/route')

    const response = await GET(
      request('http://localhost/api/app/events/event_123/structure?account=events-co'),
      { params: { eventId: 'event_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.items).toHaveLength(2)
    expect(json.data.items[0]).toMatchObject({
      id: 'structure_123',
      kind: 'SESSION',
      startsAt: '2026-06-10T14:00:00.000Z',
      metadata: { track: 'Main' },
    })
    expect(prismaMock.eventStructureItem.findMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event_123',
        isActive: true,
      },
      select: expect.any(Object),
      orderBy: [
        { sortOrder: 'asc' },
        { startsAt: 'asc' },
        { name: 'asc' },
      ],
    })
  })

  it('GET rejects non-EVENTS accounts before loading structure items', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/structure/route')

    for (const accountType of NON_EVENTS_ACCOUNT_TYPES) {
      vi.clearAllMocks()
      requireAccountAdminMock.mockResolvedValue({
        ok: true,
        userId: 'user_123',
        account: { id: 'acct_123', slug: 'events-co', name: 'Events Co' },
      })
      prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType })

      const response = await GET(
        request('http://localhost/api/app/events/event_123/structure?account=retail-co'),
        { params: { eventId: 'event_123' } },
      )
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('Event structure is only available for EVENTS accounts')
      expect(prismaMock.eventStructureItem.findMany).not.toHaveBeenCalled()
    }
  })

  it('POST creates a valid SESSION item with a unique event slug', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findFirst.mockResolvedValue({ id: 'parent_123', parentId: null })
    prismaMock.location.findFirst.mockResolvedValue({ id: 'loc_123' })
    prismaMock.eventStructureItem.findUnique.mockResolvedValue(null)
    prismaMock.eventStructureItem.create.mockResolvedValue(structureItem())

    const { POST } = await import('@/app/api/app/events/[eventId]/structure/route')

    const response = await POST(
      request('http://localhost/api/app/events/event_123/structure?account=events-co', {
        kind: 'SESSION',
        name: 'Opening Keynote',
        description: 'Main stage keynote',
        parentId: 'parent_123',
        locationId: 'loc_123',
        startsAt: '2026-06-10T14:00:00.000Z',
        endsAt: '2026-06-10T15:00:00.000Z',
        timezone: 'America/New_York',
        sortOrder: 1,
        metadata: { track: 'Main' },
      }),
      { params: { eventId: 'event_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.data.slug).toBe('opening-keynote')
    expect(prismaMock.eventStructureItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'event_123',
        kind: 'SESSION',
        name: 'Opening Keynote',
        slug: 'opening-keynote',
        parentId: 'parent_123',
        locationId: 'loc_123',
        metadata: { track: 'Main' },
      }),
      select: expect.any(Object),
    })
  })

  it('POST rejects non-EVENTS accounts', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/structure/route')

    for (const accountType of NON_EVENTS_ACCOUNT_TYPES) {
      vi.clearAllMocks()
      requireAccountAdminMock.mockResolvedValue({
        ok: true,
        userId: 'user_123',
        account: { id: 'acct_123', slug: 'events-co', name: 'Events Co' },
      })
      prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType })

      const response = await POST(
        request('http://localhost/api/app/events/event_123/structure?account=retail-co', {
          kind: 'SESSION',
          name: 'Opening Keynote',
        }),
        { params: { eventId: 'event_123' } },
      )
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('Event structure is only available for EVENTS accounts')
      expect(prismaMock.eventStructureItem.create).not.toHaveBeenCalled()
    }
  })

  it('POST rejects parentId from another Event', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findFirst.mockResolvedValue(null)

    const { POST } = await import('@/app/api/app/events/[eventId]/structure/route')

    const response = await POST(
      request('http://localhost/api/app/events/event_123/structure?account=events-co', {
        kind: 'SESSION',
        name: 'Opening Keynote',
        parentId: 'parent_other',
      }),
      { params: { eventId: 'event_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Parent structure item not found for this event')
    expect(prismaMock.eventStructureItem.create).not.toHaveBeenCalled()
  })

  it('POST rejects locationId from another Account', async () => {
    mockScopedEventsAccount()
    prismaMock.location.findFirst.mockResolvedValue(null)

    const { POST } = await import('@/app/api/app/events/[eventId]/structure/route')

    const response = await POST(
      request('http://localhost/api/app/events/event_123/structure?account=events-co', {
        kind: 'AREA',
        name: 'Expo Hall',
        locationId: 'loc_other',
      }),
      { params: { eventId: 'event_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Location not found for this account')
    expect(prismaMock.eventStructureItem.create).not.toHaveBeenCalled()
  })

  it('POST rejects a duplicate area name in the same event with an inline human message', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findMany.mockResolvedValue([
      { id: 'structure_existing', name: 'Registration' },
    ])

    const { POST } = await import('@/app/api/app/events/[eventId]/structure/route')

    // Normalization: case and surrounding whitespace differences still conflict.
    for (const name of ['Registration', 'registration', '  REGISTRATION  ']) {
      const response = await POST(
        request('http://localhost/api/app/events/event_123/structure?account=events-co', {
          kind: 'AREA',
          name,
        }),
        { params: { eventId: 'event_123' } },
      )
      const json = await response.json()
      expect(response.status).toBe(409)
      expect(json.error).toBe('A location named "Registration" already exists in this event. Use a different name.')
    }
    expect(prismaMock.eventStructureItem.create).not.toHaveBeenCalled()
    // The duplicate scope is the current event only.
    expect(prismaMock.eventStructureItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'event_123', kind: 'AREA', isActive: true } }),
    )
  })

  it('POST treats collapsed internal whitespace as the same normalized name', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findMany.mockResolvedValue([
      { id: 'structure_existing', name: 'Main Hall' },
    ])

    const { POST } = await import('@/app/api/app/events/[eventId]/structure/route')

    const response = await POST(
      request('http://localhost/api/app/events/event_123/structure?account=events-co', {
        kind: 'AREA',
        name: 'Main    Hall',
      }),
      { params: { eventId: 'event_123' } },
    )
    expect(response.status).toBe(409)
    expect(prismaMock.eventStructureItem.create).not.toHaveBeenCalled()
  })

  it('POST still allows repeated SESSION titles (schedules legitimately repeat)', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findMany.mockResolvedValue([
      { id: 'structure_existing', name: 'Networking Break' },
    ])
    prismaMock.eventStructureItem.findUnique.mockResolvedValue(null)
    prismaMock.eventStructureItem.create.mockResolvedValue(structureItem({ name: 'Networking Break' }))

    const { POST } = await import('@/app/api/app/events/[eventId]/structure/route')

    const response = await POST(
      request('http://localhost/api/app/events/event_123/structure?account=events-co', {
        kind: 'SESSION',
        name: 'Networking Break',
      }),
      { params: { eventId: 'event_123' } },
    )
    expect(response.status).toBe(201)
  })

  it('PATCH rejects renaming an area to a name another area in the event already uses', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findFirst.mockResolvedValueOnce({
      id: 'structure_123', eventId: 'event_123', slug: 'expo-hall', kind: 'AREA',
    })
    prismaMock.eventStructureItem.findMany.mockResolvedValue([
      { id: 'structure_123', name: 'Expo Hall' },
      { id: 'structure_other', name: 'Registration' },
    ])

    const { PATCH } = await import('@/app/api/app/events/[eventId]/structure/[structureItemId]/route')

    const response = await PATCH(
      request('http://localhost/api/app/events/event_123/structure/structure_123?account=events-co', {
        name: 'registration',
      }),
      { params: { eventId: 'event_123', structureItemId: 'structure_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toBe('A location named "Registration" already exists in this event. Use a different name.')
    expect(prismaMock.eventStructureItem.update).not.toHaveBeenCalled()
  })

  it('PATCH allows saving an area under its own unchanged name', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findFirst.mockResolvedValueOnce({
      id: 'structure_123', eventId: 'event_123', slug: 'registration', kind: 'AREA',
    })
    prismaMock.eventStructureItem.findMany.mockResolvedValue([
      { id: 'structure_123', name: 'Registration' },
    ])
    prismaMock.eventStructureItem.update.mockResolvedValue(structureItem({ kind: 'AREA', name: 'Registration' }))

    const { PATCH } = await import('@/app/api/app/events/[eventId]/structure/[structureItemId]/route')

    const response = await PATCH(
      request('http://localhost/api/app/events/event_123/structure/structure_123?account=events-co', {
        name: 'Registration',
      }),
      { params: { eventId: 'event_123', structureItemId: 'structure_123' } },
    )
    expect(response.status).toBe(200)
  })

  it('reports validation problems with human field labels, never raw keys', async () => {
    mockScopedEventsAccount()

    const { POST } = await import('@/app/api/app/events/[eventId]/structure/route')

    const missingName = await POST(
      request('http://localhost/api/app/events/event_123/structure?account=events-co', { kind: 'AREA', name: '' }),
      { params: { eventId: 'event_123' } },
    )
    expect((await missingName.json()).error).toBe('Name is required')

    const badDate = await POST(
      request('http://localhost/api/app/events/event_123/structure?account=events-co', { kind: 'AREA', name: 'Expo Hall', startsAt: 'garbage' }),
      { params: { eventId: 'event_123' } },
    )
    expect((await badDate.json()).error).toBe('Start time must be a valid date and time')

    const badOrder = await POST(
      request('http://localhost/api/app/events/event_123/structure?account=events-co', { kind: 'AREA', name: 'Expo Hall', sortOrder: 1.5 }),
      { params: { eventId: 'event_123' } },
    )
    expect((await badOrder.json()).error).toBe('Order must be a whole number')
  })

  it('PATCH updates a valid structure item while preserving its slug on name changes', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findFirst
      .mockResolvedValueOnce({ id: 'structure_123', eventId: 'event_123', slug: 'opening-keynote', kind: 'SESSION' })
      .mockResolvedValueOnce({ id: 'parent_123', parentId: null })
    prismaMock.location.findFirst.mockResolvedValue({ id: 'loc_456' })
    prismaMock.eventStructureItem.update.mockResolvedValue(
      structureItem({
        name: 'Updated Keynote',
        slug: 'opening-keynote',
        parentId: 'parent_123',
        locationId: 'loc_456',
        sortOrder: 2,
      }),
    )

    const { PATCH } = await import('@/app/api/app/events/[eventId]/structure/[structureItemId]/route')

    const response = await PATCH(
      request('http://localhost/api/app/events/event_123/structure/structure_123?account=events-co', {
        name: 'Updated Keynote',
        parentId: 'parent_123',
        locationId: 'loc_456',
        sortOrder: 2,
      }),
      { params: { eventId: 'event_123', structureItemId: 'structure_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toMatchObject({
      id: 'structure_123',
      name: 'Updated Keynote',
      slug: 'opening-keynote',
      parentId: 'parent_123',
      locationId: 'loc_456',
    })
    expect(prismaMock.eventStructureItem.update).toHaveBeenCalledWith({
      where: { id: 'structure_123' },
      data: expect.objectContaining({
        name: 'Updated Keynote',
        parent: { connect: { id: 'parent_123' } },
        location: { connect: { id: 'loc_456' } },
        sortOrder: 2,
      }),
      select: expect.any(Object),
    })
  })

  it('PATCH rejects an item from another Event/account', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findFirst.mockResolvedValue(null)

    const { PATCH } = await import('@/app/api/app/events/[eventId]/structure/[structureItemId]/route')

    const response = await PATCH(
      request('http://localhost/api/app/events/event_123/structure/structure_other?account=events-co', {
        name: 'Updated Keynote',
      }),
      { params: { eventId: 'event_123', structureItemId: 'structure_other' } },
    )
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Structure item not found or access denied')
    expect(prismaMock.eventStructureItem.update).not.toHaveBeenCalled()
  })

  it('PATCH prevents parent loops', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findFirst
      .mockResolvedValueOnce({ id: 'structure_123', eventId: 'event_123', slug: 'opening-keynote', kind: 'SESSION' })
      .mockResolvedValueOnce({ id: 'child_123', parentId: 'structure_123' })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/structure/[structureItemId]/route')

    const response = await PATCH(
      request('http://localhost/api/app/events/event_123/structure/structure_123?account=events-co', {
        parentId: 'child_123',
      }),
      { params: { eventId: 'event_123', structureItemId: 'structure_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Parent structure loop detected')
    expect(prismaMock.eventStructureItem.update).not.toHaveBeenCalled()
  })

  it('DELETE soft-deletes and leaves linked SurveyTargets intact', async () => {
    mockScopedEventsAccount()
    prismaMock.eventStructureItem.findFirst.mockResolvedValue({
      id: 'structure_123',
      surveyTargets: [{ id: 'target_123' }, { id: 'target_456' }],
    })
    prismaMock.eventStructureItem.update.mockResolvedValue(structureItem({ isActive: false }))

    const { DELETE } = await import('@/app/api/app/events/[eventId]/structure/[structureItemId]/route')

    const response = await DELETE(
      request('http://localhost/api/app/events/event_123/structure/structure_123?account=events-co'),
      { params: { eventId: 'event_123', structureItemId: 'structure_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toMatchObject({
      softDeleted: true,
      linkedSurveyTargetCount: 2,
      item: {
        id: 'structure_123',
        isActive: false,
      },
    })
    expect(prismaMock.eventStructureItem.update).toHaveBeenCalledWith({
      where: { id: 'structure_123' },
      data: { isActive: false },
      select: expect.any(Object),
    })
  })
})
