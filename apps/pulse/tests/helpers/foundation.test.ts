import { describe, expect, it, vi } from 'vitest'
import {
  createEventVoiceSurveyFixture,
  createEventsAccount,
  createProcessedAnswer,
  createTestAccount,
  createTestEvent,
  createTestLocation,
  createTestResponse,
} from './fixtures'
import { jsonRequest, readJson } from './route'
import { mockAuthenticatedUser, mockSupabaseSession } from '@/tests/mocks/auth'
import { mockObjectStorage, mockOpenAIAnalysis, mockOpenAITranscription, mockTTS } from '@/tests/mocks/providers'

describe('voice test foundation', () => {
  it('builds explicit canonical SMB fixtures', () => {
    const account = createTestAccount()
    const user = mockAuthenticatedUser(account)
    const location = createTestLocation(account)
    const event = createTestEvent(location)
    const response = createTestResponse(event)
    const processed = createProcessedAnswer(response)

    expect(user.accountId).toBe(account.id)
    expect(location.accountId).toBe(account.id)
    expect(event.locationId).toBe(location.id)
    expect(response.eventId).toBe(event.id)
    expect(processed.answer.responseId).toBe(response.id)
    expect(processed.transcript.answerId).toBe(processed.answer.id)
    expect(processed.analysis.answerId).toBe(processed.answer.id)
  })

  it('builds Events survey fixtures without creating a second event system', () => {
    const account = createEventsAccount()
    const location = createTestLocation(account)
    const event = createTestEvent(location, { name: 'Live Summit 2026' })
    const fixture = createEventVoiceSurveyFixture(event)

    expect(fixture.target.eventId).toBe(event.id)
    expect(fixture.survey.eventId).toBe(event.id)
    expect(fixture.survey.surveyTargetId).toBe(fixture.target.id)
    expect(fixture.publicLink.surveyId).toBe(fixture.survey.id)
    expect(fixture.questions.every((question) => question.eventId === event.id)).toBe(true)
    expect(fixture.questions.every((question) => question.surveyId === fixture.survey.id)).toBe(true)
  })

  it('provides reusable route and provider mocks', async () => {
    const request = jsonRequest({ body: { eventId: 'evt_123' } })
    await expect(request.json()).resolves.toEqual({ eventId: 'evt_123' })

    const response = new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' },
    })
    await expect(readJson(response)).resolves.toEqual({ success: true })

    const storage = mockObjectStorage()
    const transcription = mockOpenAITranscription()
    const analysis = mockOpenAIAnalysis()
    const tts = mockTTS()
    const supabase = mockSupabaseSession()

    await expect(storage.verifyObjectExists('uploads', 'recordings/test.webm')).resolves.toBe(true)
    await expect(transcription.transcribeAudio('recordings/test.webm', 'audio/webm')).resolves.toMatchObject({ language: 'en' })
    await expect(analysis.analyzeTranscript('Great visit')).resolves.toMatchObject({ sentiment: 'POSITIVE' })
    await expect(tts.previewQuestionAudio({ text: 'Question?' })).resolves.toMatchObject({ mimeType: 'audio/mpeg' })
    await expect(supabase.auth.getUser()).resolves.toMatchObject({ data: { user: { id: 'user_test' } } })
    expect(vi.isMockFunction(storage.presignPut)).toBe(true)
  })
})
