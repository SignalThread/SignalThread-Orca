import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock, coverageMocks } = vi.hoisted(() => ({
  authMock: vi.fn(),
  coverageMocks: {
    getEventSurveyCoverage: vi.fn(),
    ensureEventSurveyCoverageTarget: vi.fn(),
    createEventAreaForSurveyCoverage: vi.fn(),
    renameEventAreaForSurveyCoverage: vi.fn(),
    removeEventAreaForSurveyCoverage: vi.fn(),
    bulkAttachSurveyToSessions: vi.fn(),
    setEventSurveyDeployment: vi.fn(),
    setAdvancedSurveyCollectionState: vi.fn(),
    duplicateAdvancedSurvey: vi.fn(),
  },
}))

vi.mock('@/lib/auth/require-account-admin', () => ({ requireAccountAdmin: authMock }))
vi.mock('@/lib/event-survey-coverage', () => ({
  EventSurveyCoverageError: class EventSurveyCoverageError extends Error {
    constructor(message: string, public status: number, public code: string, public details?: unknown) { super(message) }
  },
  ...coverageMocks,
}))
vi.mock('@/lib/event-structure', () => ({ EventStructureError: class EventStructureError extends Error { constructor(message: string, public status: number) { super(message) } } }))

function request(method: string, body?: unknown) {
  return {
    nextUrl: new URL('http://localhost/api/app/events/event_1/survey-coverage?account=acme'),
    json: vi.fn().mockResolvedValue(body),
    method,
  } as never
}

describe('Event survey coverage route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ ok: true, account: { id: 'account_1' } })
  })

  it('loads event-scoped canonical coverage', async () => {
    coverageMocks.getEventSurveyCoverage.mockResolvedValue({ summary: { sessionCount: 22, sessionsWithSurveys: 12 } })
    const { GET } = await import('./route')
    const response = await GET(request('GET'), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(200)
    expect(coverageMocks.getEventSurveyCoverage).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1' })
  })

  it('validates one 500-session bulk attachment and calls the service once', async () => {
    const sessionIds = Array.from({ length: 500 }, (_, index) => `session_${index}`)
    coverageMocks.bulkAttachSurveyToSessions.mockResolvedValue({ counts: { requested: 500, attached: 500 } })
    const { POST } = await import('./route')
    const response = await POST(request('POST', { action: 'BULK_ATTACH_SESSIONS', sessionIds, surveyId: 'survey_1' }), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(200)
    expect(coverageMocks.bulkAttachSurveyToSessions).toHaveBeenCalledTimes(1)
    expect(coverageMocks.bulkAttachSurveyToSessions).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', sessionIds, surveyId: 'survey_1' })
  })

  it('rejects oversized bulk requests before invoking business logic', async () => {
    const { POST } = await import('./route')
    const response = await POST(request('POST', { action: 'BULK_ATTACH_SESSIONS', sessionIds: Array.from({ length: 501 }, (_, index) => `session_${index}`), surveyId: 'survey_1' }), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(400)
    expect(coverageMocks.bulkAttachSurveyToSessions).not.toHaveBeenCalled()
  })

  it('saves a final session deployment set through one event-scoped service call', async () => {
    coverageMocks.setEventSurveyDeployment.mockResolvedValue({ counts: { requested: 2, attached: 1, alreadyAttached: 1 } })
    const { POST } = await import('./route')
    const response = await POST(request('POST', {
      action: 'SET_SURVEY_DEPLOYMENT',
      surveyId: 'survey_1',
      kind: 'SESSION',
      structureItemIds: ['session_1', 'session_2'],
    }), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(200)
    expect(coverageMocks.setEventSurveyDeployment).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', kind: 'SESSION', structureItemIds: ['session_1', 'session_2'], customKey: undefined, customName: undefined,
    })
  })

  it.each([
    { kind: 'OVERALL_EVENT', structureItemIds: undefined },
    { kind: 'SESSION', structureItemIds: ['session_1'] },
    { kind: 'SPEAKER', structureItemIds: ['speaker_1'] },
    { kind: 'EVENT_AREA', structureItemIds: ['area_1'] },
    { kind: 'CUSTOM', structureItemIds: undefined, customKey: 'vip-key', customName: 'VIP lounge' },
  ])('accepts canonical $kind assignment input from the Surveys-list drawer', async (assignment) => {
    coverageMocks.setEventSurveyDeployment.mockResolvedValue({ id: 'survey_1' })
    const { POST } = await import('./route')
    const response = await POST(request('POST', {
      action: 'SET_SURVEY_DEPLOYMENT', surveyId: 'survey_1', ...assignment,
    }), { params: { eventId: 'event_1' } })

    expect(response.status).toBe(200)
    expect(coverageMocks.setEventSurveyDeployment).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', ...assignment,
    }))
  })

  it('allows a response-bearing Surveys-list assignment to reach the canonical service', async () => {
    coverageMocks.setEventSurveyDeployment.mockResolvedValue({ id: 'survey_1', publicSurveyLinks: [{ id: 'link_live', surveyTargetId: 'target_new' }] })
    const { POST } = await import('./route')
    const response = await POST(request('POST', {
      action: 'SET_SURVEY_DEPLOYMENT', surveyId: 'survey_1', kind: 'SESSION', structureItemIds: ['session_2'],
    }), { params: { eventId: 'event_1' } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 'survey_1' },
    })
    expect(coverageMocks.setEventSurveyDeployment).toHaveBeenCalledWith(expect.objectContaining({ surveyId: 'survey_1', kind: 'SESSION', structureItemIds: ['session_2'] }))
  })

  it('persists pause and resume through the canonical collection-state service', async () => {
    coverageMocks.setAdvancedSurveyCollectionState.mockResolvedValue({ id: 'survey_1', availabilityOverride: 'FORCE_CLOSED' })
    const { POST } = await import('./route')
    const response = await POST(request('POST', {
      action: 'SET_SURVEY_COLLECTION_STATE', surveyId: 'survey_1', paused: true,
    }), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(200)
    expect(coverageMocks.setAdvancedSurveyCollectionState).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', paused: true,
    })
  })

  it('duplicates only through the Advanced survey draft service route', async () => {
    coverageMocks.duplicateAdvancedSurvey.mockResolvedValue({ id: 'survey_copy' })
    const { POST } = await import('./route')
    const response = await POST(request('POST', {
      action: 'DUPLICATE_ADVANCED_SURVEY', surveyId: 'survey_1',
    }), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(201)
    expect(coverageMocks.duplicateAdvancedSurvey).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
    })
  })

  it('returns authentication failures without exposing event coverage', async () => {
    authMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    const { GET } = await import('./route')
    const response = await GET(request('GET'), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(403)
    expect(coverageMocks.getEventSurveyCoverage).not.toHaveBeenCalled()
  })
})
