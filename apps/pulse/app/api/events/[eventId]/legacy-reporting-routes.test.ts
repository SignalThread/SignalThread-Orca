import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const { requireLegacyEventReportingAccessMock, prismaMock, computeEventAnalysisMock, getOrCreateEventMock } = vi.hoisted(() => ({
  requireLegacyEventReportingAccessMock: vi.fn(),
  computeEventAnalysisMock: vi.fn(),
  getOrCreateEventMock: vi.fn(),
  prismaMock: {
    event: { findUnique: vi.fn() },
    response: { findMany: vi.fn(), findUnique: vi.fn() },
    answer: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-legacy-event-reporting-access', () => ({
  requireLegacyEventReportingAccess: requireLegacyEventReportingAccessMock,
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/event-analysis', () => ({ computeEventAnalysis: computeEventAnalysisMock }))
vi.mock('@/lib/event', () => ({ getOrCreateEvent: getOrCreateEventMock }))
vi.mock('@/lib/question-audio', () => ({ getEventQuestionsForRuntime: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/question-read', () => ({ getResolvedEventQuestions: vi.fn().mockResolvedValue([]) }))

const denied = () => ({
  ok: false,
  status: 401,
  response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
})
const granted = { ok: true, userId: 'user_1', accountId: 'account_a', isSuperAdmin: false }

const request = { url: 'http://localhost/api/events/event_1/x' } as never
const params = { params: { eventId: 'event_1' } }

const ROUTES = [
  ['questions', () => import('./questions/route'), 'GET', () => getOrCreateEventMock],
  ['responses', () => import('./responses/route'), 'GET', () => prismaMock.event.findUnique],
  ['answers', () => import('./answers/route'), 'GET', () => prismaMock.event.findUnique],
  ['analysis', () => import('./analysis/route'), 'GET', () => computeEventAnalysisMock],
  ['analysis/recompute', () => import('./analysis/recompute/route'), 'POST', () => computeEventAnalysisMock],
] as const

describe('legacy /api/events/[eventId] reporting routes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getOrCreateEventMock.mockResolvedValue({ id: 'event_1', name: 'Event' })
    prismaMock.event.findUnique.mockResolvedValue({ id: 'event_1', name: 'Event' })
    prismaMock.response.findMany.mockResolvedValue([])
    prismaMock.answer.findMany.mockResolvedValue([])
    computeEventAnalysisMock.mockResolvedValue({ totalResponses: 0 })
  })

  it.each(ROUTES)('%s returns the guard response and reads nothing when the organizer guard denies', async (_name, load, method, downstream) => {
    requireLegacyEventReportingAccessMock.mockResolvedValue(denied())
    const mod = await load()
    const handler = (mod as unknown as Record<string, (req: never, ctx: typeof params) => Promise<Response>>)[method]
    const response = await handler(request, params)
    expect(response.status).toBe(401)
    expect(requireLegacyEventReportingAccessMock).toHaveBeenCalledWith('event_1')
    expect(downstream()).not.toHaveBeenCalled()
  })

  it.each(ROUTES)('%s serves an authorized organizer with the unchanged response shape', async (_name, load, method) => {
    requireLegacyEventReportingAccessMock.mockResolvedValue(granted)
    const mod = await load()
    const handler = (mod as unknown as Record<string, (req: never, ctx: typeof params) => Promise<Response>>)[method]
    const response = await handler(request, params)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ success: true })
  })
})
