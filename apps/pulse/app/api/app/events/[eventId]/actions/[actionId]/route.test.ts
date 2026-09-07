import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireEventsEventAccessMock = vi.fn()
const getEventActionMock = vi.fn()
const assignEventActionMock = vi.fn()
const retryEventActionAssignmentDeliveryMock = vi.fn()
const transitionEventActionMock = vi.fn()
const updateEventActionFieldMock = vi.fn()
const addEventActionUpdateMock = vi.fn()

vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventsEventAccess: requireEventsEventAccessMock }))
vi.mock('@/lib/event-actions/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/event-actions/service')>('@/lib/event-actions/service')
  return {
    ...actual,
    getEventAction: getEventActionMock,
    assignEventAction: assignEventActionMock,
    retryEventActionAssignmentDelivery: retryEventActionAssignmentDeliveryMock,
    transitionEventAction: transitionEventActionMock,
    updateEventActionField: updateEventActionFieldMock,
    addEventActionUpdate: addEventActionUpdateMock,
  }
})

function request(body?: unknown, account = 'events-co') {
  return {
    nextUrl: new URL(`http://localhost/api/app/events/event_1/actions/cluster_1${account ? `?account=${account}` : ''}`),
    json: vi.fn().mockResolvedValue(body),
  } as never
}

const params = { params: { eventId: 'event_1', actionId: 'cluster_1' } }

describe('event action detail route', () => {
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

  it('reads one scoped action with canonical evidence and history', async () => {
    getEventActionMock.mockResolvedValue({ id: 'cluster_1', evidence: [], actionHistory: [] })
    const { GET } = await import('./route')
    const response = await GET(request(), params)
    expect(response.status).toBe(200)
    expect(getEventActionMock).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      lifecyclePhase: 'PRE_EVENT',
    })
  })

  it('dispatches assignment, transition, and field mutations to canonical services', async () => {
    assignEventActionMock.mockResolvedValue({ id: 'cluster_1' })
    transitionEventActionMock.mockResolvedValue({ id: 'cluster_1' })
    updateEventActionFieldMock.mockResolvedValue({ id: 'cluster_1' })
    retryEventActionAssignmentDeliveryMock.mockResolvedValue({ id: 'delivery_1', status: 'SENT' })
    const { PATCH } = await import('./route')
    await PATCH(request({ operation: 'ASSIGN', ownerUserId: 'owner_1', idempotencyKey: 'assign-request-1' }), params)
    await PATCH(request({ operation: 'RETRY_ASSIGNMENT_EMAIL', deliveryId: 'delivery_1', idempotencyKey: 'retry-request-1' }), params)
    await PATCH(request({ operation: 'TRANSITION', status: 'WORKING', idempotencyKey: 'status-request-1' }), params)
    await PATCH(request({ operation: 'SET_DUE_DATE', dueAt: null, idempotencyKey: 'due-request-1' }), params)
    await PATCH(request({ operation: 'SET_PRIORITY', priority: 'Soon', idempotencyKey: 'priority-request-1' }), params)
    await PATCH(request({
      operation: 'SET_CLASSIFICATION', classification: 'NEXT_EVENT_LEARNING', idempotencyKey: 'class-request-1',
    }), params)

    expect(assignEventActionMock).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: 'owner_1',
      deepLink: expect.stringContaining('/login?next='),
    }))
    const assignmentDeepLink = assignEventActionMock.mock.calls[0][0].deepLink as string
    expect(decodeURIComponent(new URL(assignmentDeepLink).searchParams.get('next')!)).toBe(
      '/app/events/event_1/dashboard?account=events-co&tab=actions&actionView=my&actionId=cluster_1',
    )
    expect(retryEventActionAssignmentDeliveryMock).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: 'delivery_1', idempotencyKey: 'retry-request-1',
    }))
    expect(transitionEventActionMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'WORKING' }))
    expect(updateEventActionFieldMock.mock.calls.map(([value]) => value.field)).toEqual([
      'DUE_DATE', 'PRIORITY', 'CLASSIFICATION',
    ])
  })

  it('creates written or voice updates outside attendee answer routes', async () => {
    addEventActionUpdateMock.mockResolvedValue({ id: 'update_1' })
    const { POST } = await import('./route')
    const response = await POST(request({
      kind: 'WRITTEN', body: 'Done', idempotencyKey: 'written-update-1',
    }), params)
    expect(response.status).toBe(201)
    expect(addEventActionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      kind: 'WRITTEN', body: 'Done', idempotencyKey: 'written-update-1',
    }))
  })
})
