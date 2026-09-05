import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION } from '@/lib/event-signage'

const { authMock, applyMock } = vi.hoisted(() => ({ authMock: vi.fn(), applyMock: vi.fn() }))

vi.mock('@/lib/auth/require-account-admin', () => ({ requireAccountAdmin: authMock }))
vi.mock('@/lib/event-signage-service', () => ({
  applyEventSurveySignageConfiguration: applyMock,
  EventSignageApplyError: class EventSignageApplyError extends Error {
    constructor(message: string, public status: number, public code: string, public details?: unknown) { super(message) }
  },
}))

function request(body: unknown) {
  return {
    nextUrl: new URL('http://localhost/api/app/events/event-1/signage?account=acme'),
    json: vi.fn().mockResolvedValue(body),
  } as never
}

describe('event signage apply route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ ok: true, account: { id: 'account-1' } })
    applyMock.mockResolvedValue({ updatedSurveyIds: ['survey-1'], configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION })
  })

  it('passes an explicit survey ID list through one canonical account/event-scoped service', async () => {
    const { POST } = await import('./route')
    const response = await POST(request({
      surveyIds: ['survey-1', 'survey-2'],
      configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
    }), { params: { eventId: 'event-1' } })
    expect(response.status).toBe(200)
    expect(applyMock).toHaveBeenCalledTimes(1)
    expect(applyMock).toHaveBeenCalledWith({
      accountId: 'account-1',
      eventId: 'event-1',
      surveyIds: ['survey-1', 'survey-2'],
      configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
    })
  })

  it.each(['tabletop', 'clean', 'bold_event'] as const)('accepts and forwards the stable %s template ID', async (preset) => {
    const { POST } = await import('./route')
    const configuration = { ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, preset }
    const response = await POST(request({ surveyIds: ['survey-1'], configuration }), { params: { eventId: 'event-1' } })
    expect(response.status).toBe(200)
    expect(applyMock).toHaveBeenCalledWith(expect.objectContaining({ configuration }))
  })

  it.each(['portrait', 'landscape'] as const)('persists the %s sign orientation', async (orientation) => {
    const { POST } = await import('./route')
    const configuration = { ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, orientation }
    const response = await POST(request({ surveyIds: ['survey-1'], configuration }), { params: { eventId: 'event-1' } })
    expect(response.status).toBe(200)
    expect(applyMock).toHaveBeenCalledWith(expect.objectContaining({ configuration }))
  })

  it('rejects QR destinations from the persisted visual configuration request', async () => {
    const { POST } = await import('./route')
    const response = await POST(request({
      surveyIds: ['survey-1'],
      configuration: { ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, qrUrl: 'https://example.com/private-token' },
    }), { params: { eventId: 'event-1' } })
    expect(response.status).toBe(400)
    expect(applyMock).not.toHaveBeenCalled()
  })

  it('prevents empty and oversized duplicate mutation requests before service execution', async () => {
    const { POST } = await import('./route')
    expect((await POST(request({ surveyIds: [], configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION }), { params: { eventId: 'event-1' } })).status).toBe(400)
    expect((await POST(request({ surveyIds: Array.from({ length: 501 }, (_, index) => `survey-${index}`), configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION }), { params: { eventId: 'event-1' } })).status).toBe(400)
    expect(applyMock).not.toHaveBeenCalled()
  })

  it('returns authentication failures without invoking signage mutation', async () => {
    authMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    const { POST } = await import('./route')
    const response = await POST(request({ surveyIds: ['survey-1'], configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION }), { params: { eventId: 'event-1' } })
    expect(response.status).toBe(403)
    expect(applyMock).not.toHaveBeenCalled()
  })
})
