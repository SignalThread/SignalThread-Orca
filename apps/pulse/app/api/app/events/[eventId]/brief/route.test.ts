import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireEventAccessMock, getEventClosingBriefMock, getPersistedEventClosingBriefMock, renderEventClosingBriefPdfMock } = vi.hoisted(() => ({
  requireEventAccessMock: vi.fn(),
  getEventClosingBriefMock: vi.fn(),
  getPersistedEventClosingBriefMock: vi.fn(),
  renderEventClosingBriefPdfMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventAccess: requireEventAccessMock }))
vi.mock('@/lib/event-closing-brief', () => ({
  getEventClosingBrief: getEventClosingBriefMock,
  getPersistedEventClosingBrief: getPersistedEventClosingBriefMock,
}))
vi.mock('@/lib/event-closing-brief-pdf', () => ({ renderEventClosingBriefPdf: renderEventClosingBriefPdfMock }))

const brief = {
  event: { name: 'Northstar Summit' },
  generatedAt: '2026-08-14T12:00:00.000Z',
  editorial: { inputHash: 'brief_hash_123' },
} as never

describe('GET /api/app/events/[eventId]/brief', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireEventAccessMock.mockResolvedValue({
      ok: true,
      account: { id: 'acct_123', slug: 'acme' },
      event: {
        id: 'evt_123',
        name: 'Northstar Summit',
        startDate: new Date('2026-08-01T09:00:00.000Z'),
        endDate: new Date('2026-08-02T17:00:00.000Z'),
      },
    })
    getEventClosingBriefMock.mockResolvedValue(brief)
    getPersistedEventClosingBriefMock.mockResolvedValue(brief)
    renderEventClosingBriefPdfMock.mockResolvedValue(Buffer.from('%PDF-test'))
  })

  it('exports the exact canonical brief payload used by the rendered brief', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/brief/route')
    const response = await GET(
      new Request('http://localhost/api/app/events/evt_123/brief?account=acme&format=pdf&briefHash=brief_hash_123') as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength('%PDF-test')))
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="northstar-summit-intelligence-brief.pdf"')
    expect(getPersistedEventClosingBriefMock).toHaveBeenCalledWith({ accountId: 'acct_123', eventId: 'evt_123', briefHash: 'brief_hash_123' })
    expect(getEventClosingBriefMock).not.toHaveBeenCalled()
    expect(renderEventClosingBriefPdfMock).toHaveBeenCalledWith({
      brief,
      eventDates: {
        startDate: '2026-08-01T09:00:00.000Z',
        endDate: '2026-08-02T17:00:00.000Z',
      },
    })
    await expect(response.arrayBuffer()).resolves.toEqual(expect.any(ArrayBuffer))
  })

  it('reuses the persisted canonical payload for repeated downloads without synthesis', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/brief/route')
    const request = () => GET(
      new Request('http://localhost/api/app/events/evt_123/brief?account=acme&format=pdf&briefHash=brief_hash_123') as never,
      { params: { eventId: 'evt_123' } },
    )

    const first = await request()
    const second = await request()

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(getPersistedEventClosingBriefMock).toHaveBeenCalledTimes(2)
    expect(renderEventClosingBriefPdfMock).toHaveBeenCalledTimes(2)
    expect(renderEventClosingBriefPdfMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ brief }))
    expect(renderEventClosingBriefPdfMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ brief }))
    expect(getEventClosingBriefMock).not.toHaveBeenCalled()
  })

  it('preserves access rejection and does not generate an export for an unauthorized Event', async () => {
    const { NextResponse } = await import('next/server')
    requireEventAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Event not found or access denied' }, { status: 404 }),
    })
    const { GET } = await import('@/app/api/app/events/[eventId]/brief/route')
    const response = await GET(
      new Request('http://localhost/api/app/events/other/brief?account=acme&format=pdf') as never,
      { params: { eventId: 'other' } },
    )

    expect(response.status).toBe(404)
    expect(getPersistedEventClosingBriefMock).not.toHaveBeenCalled()
    expect(getEventClosingBriefMock).not.toHaveBeenCalled()
  })

  it('returns a structured conflict without generating when no canonical brief exists', async () => {
    getPersistedEventClosingBriefMock.mockResolvedValue(null)
    const { GET } = await import('@/app/api/app/events/[eventId]/brief/route')
    const response = await GET(
      new Request('http://localhost/api/app/events/evt_123/brief?account=acme&format=pdf') as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ success: false, code: 'BRIEF_NOT_GENERATED' })
    expect(getEventClosingBriefMock).not.toHaveBeenCalled()
    expect(renderEventClosingBriefPdfMock).not.toHaveBeenCalled()
  })

  it('returns a structured error when export rendering fails', async () => {
    renderEventClosingBriefPdfMock.mockRejectedValue(new Error('font unavailable'))
    const { GET } = await import('@/app/api/app/events/[eventId]/brief/route')
    const response = await GET(
      new Request('http://localhost/api/app/events/evt_123/brief?account=acme&format=pdf') as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'PDF_RENDER_FAILED',
      error: 'Unable to render the Event Intelligence Brief PDF.',
      errorId: expect.any(String),
    })
    expect(getEventClosingBriefMock).not.toHaveBeenCalled()
  })

  it('loads or generates the canonical brief only for the JSON page-data request', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/brief/route')
    const response = await GET(
      new Request('http://localhost/api/app/events/evt_123/brief?account=acme') as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { briefHash: 'brief_hash_123' } })
    expect(getEventClosingBriefMock).toHaveBeenCalledTimes(1)
    expect(getPersistedEventClosingBriefMock).not.toHaveBeenCalled()
  })

  it('returns a structured safe error when canonical generation fails', async () => {
    getEventClosingBriefMock.mockRejectedValue(new Error('editorial provider timed out'))
    const { GET } = await import('@/app/api/app/events/[eventId]/brief/route')
    const response = await GET(
      new Request('http://localhost/api/app/events/evt_123/brief?account=acme') as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'BRIEF_GENERATION_FAILED',
      error: 'Unable to generate the event intelligence brief.',
      errorId: expect.any(String),
    })
    expect(renderEventClosingBriefPdfMock).not.toHaveBeenCalled()
  })
})
