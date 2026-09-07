import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAccountAdminMock, serviceMocks, listeningMocks } = vi.hoisted(() => ({
  requireAccountAdminMock: vi.fn(),
  serviceMocks: {
  getEventAgendaWorkspace: vi.fn(),
  addSpeakerToEvent: vi.fn(),
  createAgendaSession: vi.fn(),
  createEventSpeakerProfile: vi.fn(),
  createSpeakerForAgendaSession: vi.fn(),
  assignSpeakerToAgendaSession: vi.fn(),
  assignSpeakersToAgendaSession: vi.fn(),
  updateAgendaSession: vi.fn(),
  updateAgendaSessionWithSpeakerAssignments: vi.fn(),
  updateEventSpeakerProfile: vi.fn(),
  archiveAgendaSession: vi.fn(),
  archiveEventSpeakerProfile: vi.fn(),
  removeSpeakerFromAgendaSession: vi.fn(),
  },
  listeningMocks: {
    getEventListeningPlan: vi.fn(),
    getEventListeningPlanSummary: vi.fn(),
    addSessionsToListeningPlan: vi.fn(),
    attachSurveyToListeningSessions: vi.fn(),
    createSurveyForListeningSessions: vi.fn(),
    bulkAssignExistingSurvey: vi.fn(),
    clearExistingSurveyAssignment: vi.fn(),
    removeSessionsFromListeningPlan: vi.fn(),
  },
}))

vi.mock('@/lib/auth/require-account-admin', () => ({ requireAccountAdmin: requireAccountAdminMock }))
vi.mock('@/lib/event-agenda-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/event-agenda-service')>(),
  ...serviceMocks,
}))
vi.mock('@/lib/event-listening-plan', () => listeningMocks)

import { DELETE, GET, PATCH, POST } from './route'
import { EventAgendaServiceError } from '@/lib/event-agenda-service'

const params = { params: { eventId: 'event_1' } }
const url = 'http://localhost/api/app/events/event_1/agenda?account=events-demo'

function request(method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  })
}

describe('/api/app/events/[eventId]/agenda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      userId: 'user_1',
      account: { id: 'account_1', slug: 'events-demo', accountType: 'EVENTS' },
    })
  })

  it('preserves the canonical account-admin rejection', async () => {
    requireAccountAdminMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })
    const response = await GET(request('GET'), params)
    expect(response.status).toBe(403)
    expect(serviceMocks.getEventAgendaWorkspace).not.toHaveBeenCalled()
  })

  it('loads the workspace with the authorized account and route event', async () => {
    serviceMocks.getEventAgendaWorkspace.mockResolvedValue({ sessions: [], speakers: [] })
    listeningMocks.getEventListeningPlan.mockResolvedValue({
      summary: { agendaSessionCount: 0, selectedSessionCount: 0, representedSessionCount: 0 },
      sessions: [],
      surveys: [],
    })
    const response = await GET(request('GET'), params)
    expect(response.status).toBe(200)
    expect(serviceMocks.getEventAgendaWorkspace).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1' })
    expect(listeningMocks.getEventListeningPlan).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1' })
    await expect(response.json()).resolves.toMatchObject({
      data: { sessions: [], listeningPlan: { summary: { agendaSessionCount: 0 } } },
    })
  })

  it('loads only the bounded listening summary for the Setup bootstrap', async () => {
    listeningMocks.getEventListeningPlanSummary.mockResolvedValue({
      agendaSessionCount: 48,
      selectedSessionCount: 4,
      representedSessionCount: 4,
    })
    const response = await GET(new NextRequest(`${url}&summary=1`), params)
    expect(response.status).toBe(200)
    expect(listeningMocks.getEventListeningPlanSummary).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1' })
    expect(serviceMocks.getEventAgendaWorkspace).not.toHaveBeenCalled()
    expect(listeningMocks.getEventListeningPlan).not.toHaveBeenCalled()
  })

  it('dispatches listening-plan add, attach, create, and removal through scoped services', async () => {
    listeningMocks.addSessionsToListeningPlan.mockResolvedValue({ selectedCount: 2 })
    listeningMocks.attachSurveyToListeningSessions.mockResolvedValue({ surveyId: 'survey_1' })
    listeningMocks.createSurveyForListeningSessions.mockResolvedValue({ surveyId: 'survey_new' })
    listeningMocks.removeSessionsFromListeningPlan.mockResolvedValue({ removedSessionCount: 1, historyPreserved: true })

    expect((await POST(request('POST', { action: 'ADD_LISTENING_POINTS', sessionIds: ['session_1', 'session_2'] }), params)).status).toBe(201)
    expect((await POST(request('POST', { action: 'ATTACH_LISTENING_SURVEY', sessionIds: ['session_1'], surveyId: 'survey_1' }), params)).status).toBe(200)
    expect((await POST(request('POST', {
      action: 'CREATE_LISTENING_SURVEY', sessionIds: ['session_1'], surveyName: 'Session pulse', questionPrompt: 'How was it?', publish: true,
    }), params)).status).toBe(201)
    expect((await DELETE(request('DELETE', { action: 'REMOVE_LISTENING_POINTS', sessionIds: ['session_1'] }), params)).status).toBe(200)

    expect(listeningMocks.addSessionsToListeningPlan).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', sessionIds: ['session_1', 'session_2'] })
    expect(listeningMocks.attachSurveyToListeningSessions).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1' }))
    expect(listeningMocks.createSurveyForListeningSessions).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account_1', eventId: 'event_1', publish: true }))
    expect(listeningMocks.removeSessionsFromListeningPlan).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', sessionIds: ['session_1'] })
  })

  it('dispatches session and speaker creation through canonical services', async () => {
    serviceMocks.createAgendaSession.mockResolvedValue({ session: { id: 'session_1' }, warnings: [] })
    serviceMocks.createEventSpeakerProfile.mockResolvedValue({ id: 'speaker_1' })
    serviceMocks.createSpeakerForAgendaSession.mockResolvedValue({ speaker: { id: 'speaker_2' }, assignment: { id: 'assignment_2' } })

    const sessionResponse = await POST(request('POST', { action: 'CREATE_SESSION', session: { title: 'Opening' } }), params)
    const speakerResponse = await POST(request('POST', { action: 'CREATE_SPEAKER', profile: { name: 'Ali' } }), params)
    const sessionSpeakerResponse = await POST(request('POST', {
      action: 'CREATE_AND_ASSIGN_SPEAKER', sessionId: 'session_1', profile: { name: 'Ada' }, assignment: { role: 'SPEAKER', sortOrder: 0 },
    }), params)

    expect(sessionResponse.status).toBe(201)
    expect(speakerResponse.status).toBe(201)
    expect(sessionSpeakerResponse.status).toBe(201)
    expect(serviceMocks.createAgendaSession).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', session: { title: 'Opening' },
    })
    expect(serviceMocks.createEventSpeakerProfile).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account_1', eventId: 'event_1', profile: { name: 'Ali' },
    }))
    expect(serviceMocks.createSpeakerForAgendaSession).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account_1', eventId: 'event_1', sessionId: 'session_1', profile: { name: 'Ada' },
    }))
  })

  it('dispatches assignment, edit, archive, and removal without route-owned writes', async () => {
    serviceMocks.addSpeakerToEvent.mockResolvedValue({ id: 'speaker_1' })
    serviceMocks.assignSpeakerToAgendaSession.mockResolvedValue({ id: 'assignment_1' })
    serviceMocks.assignSpeakersToAgendaSession.mockResolvedValue([{ id: 'assignment_1' }, { id: 'assignment_2' }])
    serviceMocks.updateAgendaSession.mockResolvedValue({ session: { id: 'session_1' } })
    serviceMocks.updateAgendaSessionWithSpeakerAssignments.mockResolvedValue({ session: { id: 'session_1' }, assignments: [] })
    serviceMocks.updateEventSpeakerProfile.mockResolvedValue({ id: 'speaker_1', name: 'Updated speaker' })
    serviceMocks.archiveAgendaSession.mockResolvedValue({ softArchived: true })
    serviceMocks.removeSpeakerFromAgendaSession.mockResolvedValue({ removed: true })

    await POST(request('POST', {
      action: 'ADD_EXISTING_SPEAKER', speakerId: 'speaker_1',
    }), params)
    await POST(request('POST', {
      action: 'ASSIGN_SPEAKER', sessionId: 'session_1', assignment: { speakerId: 'speaker_1', role: 'HOST' },
    }), params)
    await POST(request('POST', {
      action: 'ASSIGN_SPEAKERS', sessionId: 'session_1', speakerIds: ['speaker_1', 'speaker_2'], assignment: { role: 'HOST', sortOrder: 1 },
    }), params)
    await PATCH(request('PATCH', {
      action: 'UPDATE_SESSION', session: { sessionId: 'session_1', title: 'Updated' },
    }), params)
    await PATCH(request('PATCH', {
      action: 'UPDATE_SESSION_WITH_SPEAKER_ASSIGNMENTS',
      session: { sessionId: 'session_1', title: 'Updated' },
      speakerIds: ['speaker_1', 'speaker_2'], assignment: { role: 'PANELIST', sortOrder: 0 },
    }), params)
    const updateSpeakerResponse = await PATCH(request('PATCH', {
      action: 'UPDATE_SPEAKER', speakerId: 'speaker_1', profile: { name: 'Updated speaker', title: 'Host' },
    }), params)
    await DELETE(request('DELETE', {
      action: 'ARCHIVE_SESSION', sessionId: 'session_1', confirmLiveEdit: true,
    }), params)
    await DELETE(request('DELETE', {
      action: 'REMOVE_ASSIGNMENT', sessionId: 'session_1', speakerId: 'speaker_1',
    }), params)

    expect(serviceMocks.addSpeakerToEvent).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1' })
    expect(serviceMocks.assignSpeakerToAgendaSession).toHaveBeenCalledOnce()
    expect(serviceMocks.assignSpeakersToAgendaSession).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', sessionId: 'session_1', speakerIds: ['speaker_1', 'speaker_2'], assignment: { role: 'HOST', sortOrder: 1 },
    })
    expect(serviceMocks.updateAgendaSession).toHaveBeenCalledOnce()
    expect(serviceMocks.updateAgendaSessionWithSpeakerAssignments).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', session: { sessionId: 'session_1', title: 'Updated' }, speakerIds: ['speaker_1', 'speaker_2'], assignment: { role: 'PANELIST', sortOrder: 0 },
    })
    expect(updateSpeakerResponse.status).toBe(200)
    expect(serviceMocks.updateEventSpeakerProfile).toHaveBeenCalledWith({
      accountId: 'account_1',
      eventId: 'event_1',
      speakerId: 'speaker_1',
      profile: { name: 'Updated speaker', title: 'Host' },
      confirmDuplicate: false,
    })
    expect(serviceMocks.createEventSpeakerProfile).not.toHaveBeenCalled()
    expect(serviceMocks.archiveAgendaSession).toHaveBeenCalledWith(expect.objectContaining({ confirmLiveEdit: true }))
    expect(serviceMocks.removeSpeakerFromAgendaSession).toHaveBeenCalledOnce()
  })

  it('dispatches bulk survey assignment through the scoped service and preserves structured validation errors', async () => {
    listeningMocks.bulkAssignExistingSurvey.mockResolvedValue({ counts: { requested: 1, attached: 0, alreadyAttached: 0, skipped: 0, replaced: 1, failed: 0 }, assignments: [{ targetId: 'target_1', surveyId: 'survey_2' }] })
    const response = await PATCH(request('PATCH', { action: 'BULK_ASSIGN_EXISTING_SURVEY', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_2', conflictMode: 'REPLACE_EXISTING' }), params)
    expect(response.status).toBe(200)
    expect(listeningMocks.bulkAssignExistingSurvey).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_2', conflictMode: 'REPLACE_EXISTING' }))
    await expect(response.json()).resolves.toMatchObject({ data: { assignments: [{ targetId: 'target_1', surveyId: 'survey_2' }] } })

    const areaResponse = await PATCH(request('PATCH', { action: 'BULK_ASSIGN_EXISTING_SURVEY', targetType: 'AREA', targetIds: ['area_1', 'area_2'], surveyId: 'survey_1' }), params)
    expect(areaResponse.status).toBe(200)
    expect(listeningMocks.bulkAssignExistingSurvey).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'AREA', targetIds: ['area_1', 'area_2'] }))

    listeningMocks.bulkAssignExistingSurvey.mockRejectedValueOnce(new EventAgendaServiceError('Survey is required', 400, 'SURVEY_REQUIRED', { field: 'surveyId' }))
    const invalid = await PATCH(request('PATCH', { action: 'BULK_ASSIGN_EXISTING_SURVEY', targetType: 'SESSION', targetIds: ['session_1'], surveyId: '' }), params)
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({ code: 'SURVEY_REQUIRED', details: { field: 'surveyId' } })
  })

  it('dispatches a survey detach through the same scoped assignment service', async () => {
    listeningMocks.clearExistingSurveyAssignment.mockResolvedValue({ targetIds: ['target_1'], detached: 1 })

    const response = await PATCH(request('PATCH', {
      action: 'CLEAR_EXISTING_SURVEY_ASSIGNMENT', targetType: 'SPEAKER', targetIds: ['speaker_1'],
    }), params)

    expect(response.status).toBe(200)
    expect(listeningMocks.clearExistingSurveyAssignment).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SPEAKER', targetIds: ['speaker_1'],
    })
    await expect(response.json()).resolves.toMatchObject({ data: { targetIds: ['target_1'], detached: 1 } })
  })

  it('returns explicit validation and confirmation details from the service', async () => {
    serviceMocks.createAgendaSession.mockRejectedValue(new EventAgendaServiceError(
      'Review possible schedule conflicts before saving',
      409,
      'SESSION_REVIEW_CONFIRMATION_REQUIRED',
      { warnings: [{ code: 'POSSIBLE_ROOM_OVERLAP', message: 'One overlap' }] },
    ))
    const response = await POST(request('POST', { action: 'CREATE_SESSION', session: {} }), params)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'SESSION_REVIEW_CONFIRMATION_REQUIRED',
      details: { warnings: [{ code: 'POSSIBLE_ROOM_OVERLAP' }] },
    })
  })

  it('rejects unknown route actions without falling through to a write', async () => {
    const response = await POST(request('POST', { action: 'UNKNOWN' }), params)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_ACTION' })
    expect(serviceMocks.createAgendaSession).not.toHaveBeenCalled()
  })
})
