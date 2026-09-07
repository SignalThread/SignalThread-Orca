import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAccountAdmin: vi.fn(),
  reconcile: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  generate: vi.fn(),
  rewrite: vi.fn(),
  load: vi.fn(),
}))

vi.mock('@/lib/auth/require-account-admin', () => ({ requireAccountAdmin: mocks.requireAccountAdmin }))
vi.mock('@/lib/advanced-event-survey-builder', () => ({
  AdvancedEventSurveyBuilderError: class AdvancedEventSurveyBuilderError extends Error { status = 400 },
  reconcileAdvancedSurveyAssignments: mocks.reconcile,
  saveAdvancedEventSurveyDraft: mocks.save,
  publishAdvancedEventSurvey: mocks.publish,
  loadAdvancedEventSurvey: mocks.load,
}))
vi.mock('@/lib/advanced-event-survey-ai', () => ({
  generateAdvancedSurveyQuestions: mocks.generate,
  rewriteAdvancedSurveyQuestion: mocks.rewrite,
}))

import { GET, PATCH, POST } from './route'

function request(method: string, body: unknown) {
  return new NextRequest('http://localhost/api/app/events/event_1/advanced-survey-builder?account=events', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Advanced Event survey builder route actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAccountAdmin.mockResolvedValue({ ok: true, account: { id: 'account_1' } })
  })

  it('loads an existing event survey through the canonical Advanced builder route', async () => {
    mocks.load.mockResolvedValue({ id: 'survey_1', name: 'Existing survey', questions: [] })
    const response = await GET(new NextRequest('http://localhost/api/app/events/event_1/advanced-survey-builder?account=events&survey=survey_1'), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(200)
    expect(mocks.load).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1' })
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { survey: { id: 'survey_1', name: 'Existing survey' } } })
  })

  it('dispatches AI generation only after account-admin authorization and validation', async () => {
    mocks.generate.mockResolvedValue({ questions: [{ text: 'How was it?', type: 'OPEN_RESPONSE' }], contextChips: [] })
    const response = await POST(request('POST', { action: 'GENERATE_AI', surveyId: 'survey_1', goal: 'feedback', tone: 'friendly', count: 5 }), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(200)
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1' }))
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('routes a single temporary-suggestion replacement through the canonical generator with one requested question', async () => {
    mocks.generate.mockResolvedValue({ questions: [{ text: 'What stood out?', type: 'OPEN_RESPONSE' }], contextChips: [] })
    const response = await POST(request('POST', {
      action: 'REGENERATE_AI_SUGGESTION', surveyId: 'survey_1', goal: 'feedback', tone: 'friendly',
      avoidQuestions: ['How was the event?', 'What should improve?'],
    }), { params: { eventId: 'event_1' } })

    expect(response.status).toBe(200)
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', count: 1,
      avoidQuestions: ['How was the event?', 'What should improve?'],
    }))
  })

  it('forwards every selected session in one bulk assignment request to the canonical service', async () => {
    mocks.reconcile.mockResolvedValue({ id: 'survey_1', assignmentWarnings: [{ message: "This survey has 1 speaker question. Panel: Future of Events has no speakers — that question won't be shown to attendees." }] })
    const response = await POST(request('POST', {
      surveyId: 'survey_1', assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_1', 'session_2', 'session_3'] }],
    }), { params: { eventId: 'event_1' } })

    expect(response.status).toBe(200)
    expect(mocks.reconcile).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_1', 'session_2', 'session_3'] }],
    })
    await expect(response.json()).resolves.toMatchObject({
      data: {
        survey: { id: 'survey_1' },
        assignmentWarnings: [{ message: "This survey has 1 speaker question. Panel: Future of Events has no speakers — that question won't be shown to attendees." }],
      },
    })
  })

  it('publishes through the Advanced-scoped server service', async () => {
    mocks.publish.mockResolvedValue({ id: 'survey_1', status: 'ACTIVE', review: { ready: true, issues: [] } })
    const response = await PATCH(request('PATCH', { action: 'PUBLISH', surveyId: 'survey_1' }), { params: { eventId: 'event_1' } })
    expect(response.status).toBe(200)
    expect(mocks.publish).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1' })
  })
})
