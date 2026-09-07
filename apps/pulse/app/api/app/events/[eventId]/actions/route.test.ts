import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireEventsEventAccessMock = vi.fn()
const listEventActionsMock = vi.fn()
const convertEventFindingToActionMock = vi.fn()

vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventsEventAccess: requireEventsEventAccessMock }))
vi.mock('@/lib/event-actions/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/event-actions/service')>('@/lib/event-actions/service')
  return {
    ...actual,
    listEventActions: listEventActionsMock,
    convertEventFindingToAction: convertEventFindingToActionMock,
  }
})

function request(body?: unknown, account = 'events-co') {
  return {
    nextUrl: new URL(`http://localhost/api/app/events/event_1/actions${account ? `?account=${account}` : ''}`),
    json: vi.fn().mockResolvedValue(body),
  } as never
}

const params = { params: { eventId: 'event_1' } }

describe('event actions collection route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireEventsEventAccessMock.mockResolvedValue({
      ok: true,
      userId: 'actor_1',
      account: { id: 'account_1', slug: 'events-co' },
      event: {
        id: 'event_1',
        startDate: new Date('2099-09-10T09:00:00.000Z'),
        endDate: new Date('2099-09-12T17:00:00.000Z'),
        location: { timezone: 'America/New_York' },
      },
    })
  })

  it('requires an account before reading actions', async () => {
    const { GET } = await import('./route')
    const response = await GET(request(undefined, ''), params)
    expect(response.status).toBe(400)
    expect(listEventActionsMock).not.toHaveBeenCalled()
  })

  it('lists actions only through the scoped service', async () => {
    listEventActionsMock.mockResolvedValue({ actions: [], availableFindings: [], availableOwners: [] })
    const { GET } = await import('./route')
    const response = await GET(request(), params)
    expect(response.status).toBe(200)
    expect(requireEventsEventAccessMock).toHaveBeenCalledWith('events-co', 'event_1')
    expect(listEventActionsMock).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', lifecyclePhase: 'PRE_EVENT',
    })
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { currentUserId: 'actor_1', actions: [], availableFindings: [] },
    })
  })

  it('converts a finding with the authenticated actor and caller idempotency key', async () => {
    convertEventFindingToActionMock.mockResolvedValue({ id: 'cluster_1', actionStatus: 'UNASSIGNED' })
    const { POST } = await import('./route')
    const response = await POST(request({
      clusterId: 'cluster_1',
      classification: 'DURING_EVENT',
      idempotencyKey: 'convert-request-1',
    }), params)
    expect(response.status).toBe(201)
    expect(convertEventFindingToActionMock).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      actorUserId: 'actor_1', classification: 'DURING_EVENT', idempotencyKey: 'convert-request-1',
    }))
  })

  it('passes the editable conversion fields to the canonical service', async () => {
    convertEventFindingToActionMock.mockResolvedValue({ id: 'cluster_1', actionStatus: 'UNASSIGNED' })
    const { POST } = await import('./route')
    await POST(request({
      clusterId: 'cluster_1', classification: 'DURING_EVENT', title: 'Editable title', priority: 'Soon',
      ownerUserId: null, dueAt: null, initialUpdate: 'Starting now.', idempotencyKey: 'convert-fields-1',
    }), params)
    expect(convertEventFindingToActionMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Editable title', priority: 'Soon', ownerUserId: null, dueAt: null, initialUpdate: 'Starting now.',
    }))
  })
})
