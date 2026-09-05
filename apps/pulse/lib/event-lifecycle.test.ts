import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, getEventQuestionsForRuntimeMock } = vi.hoisted(() => ({
  prismaMock: {
    event: {
      findFirst: vi.fn(),
    },
    eventStructureItem: {
      findFirst: vi.fn(),
    },
    response: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  getEventQuestionsForRuntimeMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/question-audio', () => ({
  getEventQuestionsForRuntime: getEventQuestionsForRuntimeMock,
  getSurveyQuestionsForRuntime: vi.fn(),
}))

describe('eventId kiosk launch and response lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getEventQuestionsForRuntimeMock.mockResolvedValue([
      {
        id: 'question_1',
        key: 'q-1',
        label: 'How was your visit?',
        order: 0,
        required: true,
        audioUrl: null,
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        fallbackReason: null,
      },
    ])
  })

  it('preserves legacy eventId kiosk launch for active events', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_active',
      status: 'ACTIVE',
      isActive: true,
      responseMode: 'VOICE_ONLY',
    })
    prismaMock.response.create.mockResolvedValue({
      id: 'resp_123',
      eventId: 'evt_active',
      anonymousId: 'anon_123',
      status: 'IN_PROGRESS',
    })

    const { createKioskLaunchResponse } = await import('./event')
    const result = await createKioskLaunchResponse({ eventId: 'evt_active' })

    expect(result).toMatchObject({
      mode: 'eventId',
      event: { id: 'evt_active', responseMode: 'VOICE_ONLY' },
      response: { id: 'resp_123', eventId: 'evt_active' },
    })
    expect(prismaMock.response.create).toHaveBeenCalledWith({
      data: {
        eventId: 'evt_active',
        responseMode: 'VOICE_ONLY',
        status: 'IN_PROGRESS',
      },
    })
    expect(getEventQuestionsForRuntimeMock).toHaveBeenCalledWith('evt_active')
  })

  it('rejects missing, inactive, or draft eventId kiosk launches before creating a response', async () => {
    const { createKioskLaunchResponse } = await import('./event')

    prismaMock.event.findFirst.mockResolvedValueOnce(null)
    await expect(createKioskLaunchResponse({ eventId: 'evt_missing' })).rejects.toThrow('not found')

    prismaMock.event.findFirst.mockResolvedValueOnce({
      id: 'evt_inactive',
      status: 'ACTIVE',
      isActive: false,
      responseMode: 'VOICE_ONLY',
    })
    await expect(createKioskLaunchResponse({ eventId: 'evt_inactive' })).rejects.toThrow('Event is not launchable')

    prismaMock.event.findFirst.mockResolvedValueOnce({
      id: 'evt_draft',
      status: 'DRAFT',
      isActive: true,
      responseMode: 'VOICE_ONLY',
    })
    await expect(createKioskLaunchResponse({ eventId: 'evt_draft' })).rejects.toThrow('Event is not launchable')

    expect(prismaMock.response.create).not.toHaveBeenCalled()
    expect(getEventQuestionsForRuntimeMock).not.toHaveBeenCalled()
  })

  it('creates anonymous kiosk responses in progress', async () => {
    prismaMock.response.create.mockResolvedValue({
      id: 'resp_created',
      eventId: 'evt_123',
      status: 'IN_PROGRESS',
    })

    const { createKioskResponse } = await import('./event')
    const result = await createKioskResponse('evt_123')

    expect(result.response.id).toBe('resp_created')
    expect(prismaMock.response.create).toHaveBeenCalledWith({
      data: {
        eventId: 'evt_123',
        responseMode: 'VOICE_ONLY',
        status: 'IN_PROGRESS',
      },
    })
  })

  it('completes responses idempotently without rewriting completed rows', async () => {
    const { completeResponse } = await import('./event')

    prismaMock.response.findUnique.mockResolvedValueOnce({
      id: 'resp_done',
      status: 'COMPLETED',
      completedAt: new Date('2026-01-01T12:00:00.000Z'),
    })
    const alreadyCompleted = await completeResponse('resp_done')
    expect(alreadyCompleted.id).toBe('resp_done')
    expect(prismaMock.response.update).not.toHaveBeenCalled()

    prismaMock.response.findUnique.mockResolvedValueOnce({
      id: 'resp_active',
      status: 'IN_PROGRESS',
      completedAt: null,
    })
    prismaMock.response.update.mockResolvedValueOnce({
      id: 'resp_active',
      status: 'COMPLETED',
      completedAt: new Date('2026-01-01T12:05:00.000Z'),
    })
    const completed = await completeResponse('resp_active')
    expect(completed.status).toBe('COMPLETED')
    expect(prismaMock.response.update).toHaveBeenCalledWith({
      where: { id: 'resp_active' },
      data: {
        status: 'COMPLETED',
        completedAt: expect.any(Date),
      },
    })
  })

  it('requires type-appropriate answers for required mixed survey questions', async () => {
    const { completeResponse } = await import('./event')
    prismaMock.response.findUnique.mockResolvedValueOnce({
      id: 'resp_mixed',
      status: 'IN_PROGRESS',
      completedAt: null,
      surveyId: 'survey_123',
      survey: {
        questions: [
          { id: 'rating_q', key: 'rating', type: 'RATING_1_TO_5', required: true },
          { id: 'voice_q', key: 'voice', type: 'VOICE', required: true },
          { id: 'open_q', key: 'open', type: 'OPEN_RESPONSE', required: true },
          { id: 'optional_q', key: 'optional', type: 'RECOMMENDATION_0_TO_10', required: false },
        ],
      },
      answers: [
        { questionId: 'rating_q', numericValue: 4, status: 'COMPLETED', objectKey: null, mimeType: null },
      ],
    })

    await expect(completeResponse('resp_mixed')).rejects.toThrow('voice')
    expect(prismaMock.response.update).not.toHaveBeenCalled()
  })

  it('completes mixed responses when required answers are durable and optional answers are omitted', async () => {
    const { completeResponse } = await import('./event')
    prismaMock.response.findUnique.mockResolvedValueOnce({
      id: 'resp_mixed',
      status: 'IN_PROGRESS',
      completedAt: null,
      surveyId: 'survey_123',
      survey: {
        questions: [
          { id: 'rating_q', key: 'rating', type: 'RATING_1_TO_5', required: true },
          { id: 'voice_q', key: 'voice', type: 'VOICE', required: true },
          { id: 'open_q', key: 'open', type: 'OPEN_RESPONSE', required: true },
          { id: 'optional_q', key: 'optional', type: 'RECOMMENDATION_0_TO_10', required: false },
        ],
      },
      answers: [
        { questionId: 'rating_q', numericValue: 5, status: 'COMPLETED', objectKey: null, mimeType: null },
        { questionId: 'voice_q', numericValue: null, status: 'UPLOADED', objectKey: 'voice.webm', mimeType: 'audio/webm' },
        { questionId: 'open_q', numericValue: null, status: 'COMPLETED', objectKey: 'answers/text/open', mimeType: 'text/plain' },
      ],
    })
    prismaMock.response.update.mockResolvedValueOnce({
      id: 'resp_mixed', status: 'COMPLETED', completedAt: new Date(),
    })

    await expect(completeResponse('resp_mixed')).resolves.toMatchObject({ status: 'COMPLETED' })
    expect(prismaMock.response.update).toHaveBeenCalledTimes(1)
  })

  it('completes a speakerless session response without requiring an impossible speaker answer', async () => {
    const { completeResponse } = await import('./event')
    prismaMock.response.findUnique.mockResolvedValueOnce({
      id: 'resp_speakerless', eventId: 'evt_123', status: 'IN_PROGRESS', completedAt: null, surveyId: 'survey_123',
      surveyTarget: { category: 'SESSION', eventStructureItemId: 'session_without_speakers' },
      survey: { questions: [{ id: 'speaker_q', key: 'speaker', type: 'SPEAKER_FEEDBACK', responseTarget: 'SPEAKERS', required: true }] },
      answers: [],
    })
    prismaMock.eventStructureItem.findFirst.mockResolvedValueOnce({
      id: 'session_without_speakers', name: 'Panel: Future of Events', speakerAssignments: [],
    })
    prismaMock.response.update.mockResolvedValueOnce({ id: 'resp_speakerless', status: 'COMPLETED', completedAt: new Date() })

    await expect(completeResponse('resp_speakerless')).resolves.toMatchObject({ status: 'COMPLETED' })
    expect(prismaMock.response.update).toHaveBeenCalledTimes(1)
  })

  it('continues to require speaker feedback when the live session has speakers', async () => {
    const { completeResponse } = await import('./event')
    prismaMock.response.findUnique.mockResolvedValueOnce({
      id: 'resp_speakers', eventId: 'evt_123', status: 'IN_PROGRESS', completedAt: null, surveyId: 'survey_123',
      surveyTarget: { category: 'SESSION', eventStructureItemId: 'session_with_speakers' },
      survey: { questions: [{ id: 'speaker_q', key: 'speaker', type: 'SPEAKER_FEEDBACK', responseTarget: 'SPEAKERS', required: true }] },
      answers: [],
    })
    prismaMock.eventStructureItem.findFirst.mockResolvedValueOnce({
      id: 'session_with_speakers', name: 'Keynote', speakerAssignments: [{ speakerId: 'speaker_1', speaker: { name: 'Avery Lee', isArchived: false } }],
    })

    await expect(completeResponse('resp_speakers')).rejects.toThrow('speaker')
    expect(prismaMock.response.update).not.toHaveBeenCalled()
  })
})
