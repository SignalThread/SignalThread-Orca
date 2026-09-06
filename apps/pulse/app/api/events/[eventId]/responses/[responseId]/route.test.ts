import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const { requireLegacyEventReportingAccessMock, prismaMock } = vi.hoisted(() => ({
  requireLegacyEventReportingAccessMock: vi.fn(),
  prismaMock: { response: { findUnique: vi.fn() } },
}))

vi.mock('@/lib/auth/require-legacy-event-reporting-access', () => ({
  requireLegacyEventReportingAccess: requireLegacyEventReportingAccessMock,
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const anonymous = () => ({
  ok: false,
  status: 401,
  response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
})
const organizer = { ok: true, userId: 'user_1', accountId: 'account_a', isSuperAdmin: false }

function storedResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'resp_1',
    eventId: 'event_1',
    anonymousId: 'anon_secret',
    status: 'IN_PROGRESS',
    startedAt: new Date('2026-09-05T11:00:00.000Z'),
    completedAt: null,
    event: { id: 'event_1', name: 'Spring Summit' },
    answers: [
      {
        id: 'ans_1',
        promptLabel: 'How was registration?',
        questionKey: 'registration',
        objectKey: 'answers/secret-object.webm',
        status: 'COMPLETED',
        durationMs: 4200,
        createdAt: new Date('2026-09-05T11:01:00.000Z'),
        updatedAt: new Date('2026-09-05T11:02:00.000Z'),
        answerTranscript: { text: 'The registration line was very long.', provider: 'openai', model: 'whisper-1' },
        answerAnalysis: {
          summary: 'Registration felt slow.',
          sentimentLabel: 'negative',
          sentimentScore: -0.4,
          themesJson: { evidenceState: 'SUBSTANTIVE', themes: ['registration'], keyQuote: 'very long' },
          actionsJson: { actionItems: ['Add a second registration desk'] },
        },
      },
    ],
    ...overrides,
  }
}

const request = { url: 'http://localhost/api/events/event_1/responses/resp_1' } as never
const params = { params: { eventId: 'event_1', responseId: 'resp_1' } }

describe('GET /api/events/[eventId]/responses/[responseId]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.response.findUnique.mockResolvedValue(storedResponse())
  })

  it('gives an anonymous attendee only the scoped summary for an in-progress response', async () => {
    requireLegacyEventReportingAccessMock.mockResolvedValue(anonymous())
    const { GET } = await import('./route')
    const response = await GET(request, params)
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.data).toMatchObject({
      id: 'resp_1',
      eventId: 'event_1',
      status: 'IN_PROGRESS',
      scope: 'attendee',
      answersTotal: 1,
      answersCompleted: 1,
      answers: [{ status: 'COMPLETED', hasTranscript: true, analysis: { summary: 'Registration felt slow.', sentimentScore: -0.4, evidenceState: 'SUBSTANTIVE' } }],
    })
    const serialized = JSON.stringify(json)
    for (const secret of ['registration line', 'secret-object', 'anon_secret', 'Spring Summit', 'actionItems', 'keyQuote', 'promptLabel']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('keeps the attendee summary available shortly after completion, then closes the window', async () => {
    requireLegacyEventReportingAccessMock.mockResolvedValue(anonymous())
    prismaMock.response.findUnique.mockResolvedValue(storedResponse({ status: 'COMPLETED', completedAt: new Date(Date.now() - 60_000) }))
    const { GET } = await import('./route')
    expect((await GET(request, params)).status).toBe(200)

    prismaMock.response.findUnique.mockResolvedValue(storedResponse({ status: 'COMPLETED', completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }))
    const stale = await GET(request, params)
    expect(stale.status).toBe(404)
    await expect(stale.json()).resolves.toEqual({ success: false, error: 'Response not found' })
  })

  it('serves the full reporting payload only to an authorized organizer', async () => {
    requireLegacyEventReportingAccessMock.mockResolvedValue(organizer)
    const { GET } = await import('./route')
    const response = await GET(request, params)
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.data).toMatchObject({
      eventName: 'Spring Summit',
      anonymousId: 'anon_secret',
      answers: [expect.objectContaining({
        objectKey: 'answers/secret-object.webm',
        transcript: 'The registration line was very long.',
        analysis: expect.objectContaining({ actionItems: ['Add a second registration desk'] }),
      })],
    })
    expect(json.data.scope).toBeUndefined()
  })

  it('still rejects a response that belongs to a different event before any view is chosen', async () => {
    requireLegacyEventReportingAccessMock.mockResolvedValue(anonymous())
    prismaMock.response.findUnique.mockResolvedValue(storedResponse({ eventId: 'event_other' }))
    const { GET } = await import('./route')
    expect((await GET(request, params)).status).toBe(400)
  })

  it('returns 404 for an unknown response', async () => {
    requireLegacyEventReportingAccessMock.mockResolvedValue(anonymous())
    prismaMock.response.findUnique.mockResolvedValue(null)
    const { GET } = await import('./route')
    expect((await GET(request, params)).status).toBe(404)
  })
})
