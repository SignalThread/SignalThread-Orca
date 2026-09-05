import { beforeEach, describe, expect, it, vi } from 'vitest'

const listMock = vi.fn()
const accessMock = vi.fn()

vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventsEventAccess: accessMock }))
vi.mock('@/lib/event-raw-responses', async () => {
  const actual = await vi.importActual<typeof import('@/lib/event-raw-responses')>('@/lib/event-raw-responses')
  return { ...actual, listEventRawResponses: listMock }
})

describe('GET /api/app/events/[eventId]/raw-responses', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    accessMock.mockResolvedValue({ ok: true, account: { id: 'account_1', accountType: 'EVENTS' }, event: { id: 'event_1' } })
  })

  it('passes simple list filters to the account-scoped service', async () => {
    listMock.mockResolvedValue({ items: [], filters: {}, pagination: { total: 0 } })
    const { GET } = await import('@/app/api/app/events/[eventId]/raw-responses/route')
    const response = await GET({ nextUrl: new URL('http://localhost/api/app/events/event_1/raw-responses?account=events-co&search=networking&surveyTargetId=target_1&eventStructureItemId=structure_1&structureKind=SESSION&questionId=question_1&sentiment=positive&dateFrom=2026-08-01&dateTo=2026-08-12&page=2') } as never, { params: { eventId: 'event_1' } })
    expect(response.status).toBe(200)
    expect(listMock).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', search: 'networking', surveyId: null, surveyTargetId: 'target_1', eventStructureItemId: 'structure_1', structureKind: 'SESSION', questionId: 'question_1', sentiment: 'positive', dateFrom: '2026-08-01', dateTo: '2026-08-12', lifecyclePhase: null, page: 2, pageSize: 25 })
  })

  it('does not load evidence when event/account access fails', async () => {
    const { NextResponse } = await import('next/server')
    accessMock.mockResolvedValue({ ok: false, response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) })
    const { GET } = await import('@/app/api/app/events/[eventId]/raw-responses/route')
    const response = await GET({ nextUrl: new URL('http://localhost/api/app/events/event_1/raw-responses?account=events-co') } as never, { params: { eventId: 'event_1' } })
    expect(response.status).toBe(403)
    expect(listMock).not.toHaveBeenCalled()
  })
})
