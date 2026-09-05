import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const createKioskLaunchResponseMock = vi.fn()

vi.mock('@/lib/event', () => ({
  createKioskLaunchResponse: createKioskLaunchResponseMock,
}))

describe('POST /api/response/create', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns runtime questions with cached audio metadata for kiosk playback', async () => {
    createKioskLaunchResponseMock.mockResolvedValue({
      mode: 'eventId',
      event: { id: 'evt_123', responseMode: 'VOICE_ONLY' },
      response: {
        id: 'resp_123',
        eventId: 'evt_123',
        anonymousId: 'anon_123',
        responseMode: 'VOICE_ONLY',
      },
      questions: [
        {
          id: 'question_1',
          key: 'q1',
          label: 'How was your visit?',
          order: 0,
          required: true,
          type: 'VOICE',
          audioUrl: 'https://signed.example/question-audio/q1.mp3',
          ttsProvider: 'google',
          ttsVoice: 'en-AU-Neural2-A',
          ttsLocale: 'en-AU',
          fallbackReason: null,
        },
      ],
    })

    const { POST } = await import('@/app/api/response/create/route')

    const response = await POST({
      json: async () => ({ eventId: 'evt_123' }),
    } as never)

    expect(response.status).toBe(200)
    expect(createKioskLaunchResponseMock).toHaveBeenCalledWith({ eventId: 'evt_123' })

    const json = await response.json()
    expect(json.data.responseMode).toBe('VOICE_ONLY')
    expect(json.data.questions).toEqual([
      {
        id: 'q1',
        questionId: 'question_1',
        text: 'How was your visit?',
        order: 0,
        type: 'VOICE',
        responseTarget: 'GENERAL',
        isRequired: true,
        audioUrl: 'https://signed.example/question-audio/q1.mp3',
        ttsProvider: 'google',
        ttsVoice: 'en-AU-Neural2-A',
        ttsLocale: 'en-AU',
        fallbackReason: null,
      },
    ])
  })

  it('preserves an optional public-survey question through the kiosk payload', async () => {
    createKioskLaunchResponseMock.mockResolvedValue({
      mode: 'token',
      event: { id: 'evt_123', responseMode: 'VOICE_ONLY' },
      survey: { id: 'survey_123', surveyTargetId: 'target_123', responseMode: 'VOICE_ONLY' },
      target: { id: 'target_123' },
      publicLink: { id: 'link_123' },
      response: {
        id: 'resp_123',
        eventId: 'evt_123',
        anonymousId: 'anon_123',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        publicSurveyLinkId: 'link_123',
        responseMode: 'VOICE_ONLY',
      },
      questions: [
        {
          id: 'question_1',
          key: 'survey-q1',
          label: 'What did you think?',
          order: 4,
          required: false,
          type: 'RATING_1_TO_5',
          audioUrl: null,
          ttsProvider: 'google',
          ttsVoice: 'en-US-Neural2-F',
          ttsLocale: 'en-US',
          fallbackReason: 'survey-token-question-audio-not-loaded',
        },
      ],
    })

    const { POST } = await import('@/app/api/response/create/route')

    const response = await POST({
      json: async () => ({ token: 'public-token' }),
    } as never)

    expect(response.status).toBe(200)
    expect(createKioskLaunchResponseMock).toHaveBeenCalledWith({ token: 'public-token' })

    const json = await response.json()
    expect(json.data).toMatchObject({
      responseId: 'resp_123',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      surveyTargetId: 'target_123',
      publicSurveyLinkId: 'link_123',
    })
    expect(json.data.questions).toEqual([
      {
        id: 'survey-q1',
        questionId: 'question_1',
        text: 'What did you think?',
        order: 4,
        type: 'RATING_1_TO_5',
        responseTarget: 'GENERAL',
        isRequired: false,
        audioUrl: null,
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        fallbackReason: 'survey-token-question-audio-not-loaded',
      },
    ])
  })

  it('returns live session and presenter context only for a session-linked survey', async () => {
    createKioskLaunchResponseMock.mockResolvedValue({
      mode: 'token', event: { id: 'evt_123', responseMode: 'VOICE_ONLY' },
      survey: { id: 'survey_123', surveyTargetId: 'target_123', responseMode: 'VOICE_ONLY' }, target: { id: 'target_123' }, publicLink: { id: 'link_123' },
      response: { id: 'resp_123', eventId: 'evt_123', anonymousId: 'anon_123', responseMode: 'VOICE_ONLY' },
      questions: [{ id: 'question_presenters', key: 'presenters', label: 'Rate the presenters', order: 1, type: 'RATING_1_TO_5', responseTarget: 'SPEAKERS', required: true }],
      sessionContext: {
        session: { id: 'session_123', name: 'Building Better Workshops' },
        speakers: [{ id: 'speaker_jane', name: 'Jane Doe' }, { id: 'speaker_john', name: 'John Doe' }],
        presenterRatingQuestionId: 'question_presenters',
      },
    })
    const { POST } = await import('@/app/api/response/create/route')
    const response = await POST({ json: async () => ({ token: 'public-token' }) } as never)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        sessionContext: {
          session: { name: 'Building Better Workshops' },
          speakers: [{ id: 'speaker_jane', name: 'Jane Doe' }, { id: 'speaker_john', name: 'John Doe' }],
        },
        questions: [{ responseTarget: 'SPEAKERS' }],
      },
    })
  })

  it('returns the backend-resolved canonical speaker for a direct speaker launch', async () => {
    createKioskLaunchResponseMock.mockResolvedValue({
      mode: 'token', event: { id: 'evt_123', responseMode: 'VOICE_ONLY' },
      survey: { id: 'survey_123', surveyTargetId: 'speaker_target', responseMode: 'VOICE_ONLY' }, target: { id: 'speaker_target' }, publicLink: { id: 'speaker_link' },
      response: { id: 'resp_123', eventId: 'evt_123', anonymousId: 'anon_123', responseMode: 'VOICE_ONLY' },
      questions: [{ id: 'question_1', key: 'q1', label: 'How was this speaker?', order: 0, type: 'VOICE', required: true }],
      speakerContext: { speaker: { id: 'speaker_jane', name: 'Jane Smith' } },
    })
    const { POST } = await import('@/app/api/response/create/route')
    const response = await POST({ json: async () => ({ token: 'jane-token' }) } as never)
    await expect(response.json()).resolves.toMatchObject({ data: { speakerContext: { speaker: { id: 'speaker_jane', name: 'Jane Smith' } } } })
  })

  it('requires exactly one launch identifier', async () => {
    const { POST } = await import('@/app/api/response/create/route')

    const missing = await POST({
      json: async () => ({}),
    } as never)
    expect(missing.status).toBe(400)

    const both = await POST({
      json: async () => ({ eventId: 'evt_123', token: 'public-token' }),
    } as never)
    expect(both.status).toBe(400)
    expect(createKioskLaunchResponseMock).not.toHaveBeenCalled()
  })

  it('forwards the attendee choice and returns the persisted response method', async () => {
    createKioskLaunchResponseMock.mockResolvedValue({
      mode: 'token',
      event: { id: 'evt_123', responseMode: 'VOICE_AND_TEXT' },
      survey: { id: 'survey_123', surveyTargetId: 'target_123', responseMode: 'VOICE_AND_TEXT' },
      target: { id: 'target_123' },
      publicLink: { id: 'link_123' },
      response: { id: 'resp_123', eventId: 'evt_123', anonymousId: 'anon_123', responseMode: 'TEXT_ONLY' },
      questions: [],
    })
    const { POST } = await import('@/app/api/response/create/route')
    const response = await POST({ json: async () => ({ token: 'public-token', selectedResponseMode: 'TEXT_ONLY' }) } as never)

    expect(response.status).toBe(200)
    expect(createKioskLaunchResponseMock).toHaveBeenCalledWith({ token: 'public-token', selectedResponseMode: 'TEXT_ONLY' })
    expect((await response.json()).data.responseMode).toBe('TEXT_ONLY')
  })

  it('rejects invalid attendee response methods before creating a response', async () => {
    const { POST } = await import('@/app/api/response/create/route')
    const response = await POST({ json: async () => ({ token: 'public-token', selectedResponseMode: 'VOICE_AND_TEXT' }) } as never)

    expect(response.status).toBe(400)
    expect(createKioskLaunchResponseMock).not.toHaveBeenCalled()
  })

  it('returns a clean error for bad token states', async () => {
    createKioskLaunchResponseMock.mockRejectedValueOnce(new Error('Public survey link is inactive'))

    const { POST } = await import('@/app/api/response/create/route')

    const response = await POST({
      json: async () => ({ token: 'inactive-token' }),
    } as never)

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.message).toBe('Public survey link is inactive')
  })

  it('returns a clean error for non-launchable token context', async () => {
    createKioskLaunchResponseMock.mockRejectedValueOnce(new Error('Event is not launchable'))

    const { POST } = await import('@/app/api/response/create/route')

    const response = await POST({
      json: async () => ({ token: 'draft-event-token' }),
    } as never)

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.message).toBe('Event is not launchable')
  })

  it('returns a structured safe error when production is missing Response.responseMode', async () => {
    createKioskLaunchResponseMock.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'The column `responseMode` does not exist in the current database.',
        {
          code: 'P2022',
          clientVersion: 'test',
          meta: { modelName: 'Response', column: 'responseMode' },
        },
      ),
    )

    const { POST } = await import('@/app/api/response/create/route')
    const response = await POST({
      json: async () => ({ token: 'public-token', selectedResponseMode: 'VOICE_ONLY' }),
    } as never)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      success: false,
      error: 'response_creation_unavailable',
      message: 'Unable to start this survey right now. Please try again shortly.',
    })
  })

  it('does not expose unexpected server exception details to public survey clients', async () => {
    createKioskLaunchResponseMock.mockRejectedValueOnce(new Error('sensitive database detail'))

    const { POST } = await import('@/app/api/response/create/route')
    const response = await POST({ json: async () => ({ token: 'public-token' }) } as never)

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'Internal server error',
      message: 'Unable to start this survey right now. Please try again shortly.',
    })
  })
})
