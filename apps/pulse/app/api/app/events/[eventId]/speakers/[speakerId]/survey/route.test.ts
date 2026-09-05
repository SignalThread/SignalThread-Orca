import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAccountAdmin: vi.fn(), get: vi.fn(), attach: vi.fn(), remove: vi.fn() }))

vi.mock('@/lib/auth/require-account-admin', () => ({ requireAccountAdmin: mocks.requireAccountAdmin }))
vi.mock('@/lib/event-speaker-surveys', () => ({
  getEventSpeakerSurvey: mocks.get,
  attachExistingSurveyToEventSpeaker: mocks.attach,
  removeEventSpeakerSurveyAttachment: mocks.remove,
}))

import { DELETE, GET, POST } from './route'

const url = 'http://localhost/api/app/events/event_1/speakers/speaker_1/survey?account=events-demo'
const context = { params: { eventId: 'event_1', speakerId: 'speaker_1' } }

describe('/api/app/events/[eventId]/speakers/[speakerId]/survey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAccountAdmin.mockResolvedValue({ ok: true, account: { id: 'account_1' } })
  })

  it('loads speaker attachment context', async () => {
    mocks.get.mockResolvedValue({ speaker: { id: 'speaker_1', name: 'Jane Smith' }, attachment: null })
    const response = await GET(new NextRequest(url), context)
    expect(response.status).toBe(200)
    expect(mocks.get).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1' })
  })

  it('attaches a survey with optional session launch context', async () => {
    mocks.attach.mockResolvedValue({ target: { id: 'target_1', speakerId: 'speaker_1' } })
    const response = await POST(new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surveyId: 'survey_1', speakerAssignmentId: 'assignment_1' }) }), context)
    expect(response.status).toBe(200)
    expect(mocks.attach).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1', surveyId: 'survey_1', speakerAssignmentId: 'assignment_1' })
  })

  it('deactivates an attachment without deleting history', async () => {
    mocks.remove.mockResolvedValue({ removed: true, deactivatedLinkCount: 1 })
    const response = await DELETE(new NextRequest(url, { method: 'DELETE' }), context)
    expect(response.status).toBe(200)
    expect(mocks.remove).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1' })
  })
})
