import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireEventsEventAccessMock = vi.fn()
const getEventAlertMock = vi.fn()
const transitionEventAlertMock = vi.fn()
const assignEventAlertMock = vi.fn()
const addEventAlertNoteMock = vi.fn()

vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventsEventAccess: requireEventsEventAccessMock }))
vi.mock('@/lib/event-intelligence/alerts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/event-intelligence/alerts')>('@/lib/event-intelligence/alerts')
  return {
    ...actual,
    getEventAlert: getEventAlertMock,
    transitionEventAlert: transitionEventAlertMock,
    assignEventAlert: assignEventAlertMock,
    addEventAlertNote: addEventAlertNoteMock,
  }
})
function request(method: string, body?: unknown, account = 'events-co') {
  return {
    method,
    nextUrl: new URL(`http://localhost/api/app/events/event_1/clusters/alert_1/status${account ? `?account=${account}` : ''}`),
    json: vi.fn().mockResolvedValue(body),
  } as never
}

const params = { params: { eventId: 'event_1', clusterId: 'alert_1' } }

describe('event alert workflow route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireEventsEventAccessMock.mockResolvedValue({
      ok: true,
      userId: 'user_1',
      account: { id: 'account_1', slug: 'events-co' },
      event: {
        id: 'event_1',
        startDate: new Date('2099-09-10T09:00:00.000Z'),
        endDate: new Date('2099-09-12T17:00:00.000Z'),
        location: { timezone: 'America/New_York' },
      },
    })
  })

  it('requires account membership before reading an alert', async () => {
    const { GET } = await import('./route')
    const response = await GET(request('GET', undefined, ''), params)
    expect(response.status).toBe(400)
    expect(getEventAlertMock).not.toHaveBeenCalled()
  })

  it('reads one scoped alert with evidence and notes', async () => {
    getEventAlertMock.mockResolvedValue({ id: 'alert_1', evidence: [], notes: [] })
    const { GET } = await import('./route')
    const response = await GET(request('GET'), params)
    expect(response.status).toBe(200)
    expect(requireEventsEventAccessMock).toHaveBeenCalledWith('events-co', 'event_1')
    expect(getEventAlertMock).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1',
      lifecyclePhase: 'PRE_EVENT',
    })
  })

  it('transitions and assigns through server-authoritative services', async () => {
    transitionEventAlertMock.mockResolvedValue({ id: 'alert_1', status: 'ACKNOWLEDGED' })
    assignEventAlertMock.mockResolvedValue({ id: 'alert_1', ownerUserId: 'user_2' })
    const { PATCH } = await import('./route')

    await PATCH(request('PATCH', { status: 'ACKNOWLEDGED' }), params)
    await PATCH(request('PATCH', { ownerUserId: 'user_2' }), params)

    expect(transitionEventAlertMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user_1', status: 'ACKNOWLEDGED',
    }))
    expect(assignEventAlertMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user_1', ownerUserId: 'user_2',
    }))
  })

  it('adds an internal note with the authenticated actor', async () => {
    addEventAlertNoteMock.mockResolvedValue({ id: 'note_1' })
    const { POST } = await import('./route')
    const response = await POST(request('POST', { body: 'Changed the registration lane.' }), params)
    expect(response.status).toBe(201)
    expect(addEventAlertNoteMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user_1', body: 'Changed the registration lane.',
    }))
  })
})
