import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  prismaMock,
  transcribeAudioMock,
  runAnswerReviewSynopsisPipelineMock,
} = vi.hoisted(() => ({
  prismaMock: {
    answer: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    answerTranscript: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    answerAnalysis: {
      findFirst: vi.fn(),
    },
    answerProcessingLog: {
      create: vi.fn(),
    },
    eventSessionSpeakerAssignment: {
      findFirst: vi.fn(),
    },
  },
  transcribeAudioMock: vi.fn(),
  runAnswerReviewSynopsisPipelineMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/transcription', () => ({
  transcribeAudio: transcribeAudioMock,
}))

vi.mock('@/lib/answer-review-synopsis-pipeline', () => ({
  runAnswerReviewSynopsisPipeline: runAnswerReviewSynopsisPipelineMock,
}))

async function flushBackgroundWork() {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('POST /api/answer/confirm', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.answer.update.mockResolvedValue({ id: 'answer_123' })
    prismaMock.answerProcessingLog.create.mockResolvedValue({})
    prismaMock.answerTranscript.upsert.mockResolvedValue({})
    transcribeAudioMock.mockResolvedValue({ text: 'Great event.', language: 'en', duration: 1.2 })
    runAnswerReviewSynopsisPipelineMock.mockResolvedValue(undefined)
  })

  it('confirms uploaded audio and runs mocked transcription and analysis pipeline', async () => {
    prismaMock.answer.findUnique
      .mockResolvedValueOnce({
        id: 'answer_123',
        responseId: 'resp_123',
        status: 'UPLOADING',
        objectKey: 'recordings/answer.webm',
        mimeType: 'audio/webm',
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
      })
      .mockResolvedValueOnce({ responseId: 'resp_123' })

    const { POST } = await import('./route')
    const response = await POST({
      json: async () => ({
        answerId: 'ck12345678901234567890123',
        objectEtag: 'etag-123',
        durationMs: 1200,
        language: 'en',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(prismaMock.answer.update).toHaveBeenCalledWith({
      where: { id: 'ck12345678901234567890123' },
      data: expect.objectContaining({
        status: 'UPLOADED',
        objectEtag: 'etag-123',
        durationMs: 1200,
      }),
    })

    await flushBackgroundWork()

    expect(transcribeAudioMock).toHaveBeenCalledWith('recordings/answer.webm', 'audio/webm')
    expect(prismaMock.answerTranscript.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { answerId: 'ck12345678901234567890123' },
        create: expect.objectContaining({ text: 'Great event.' }),
      }),
    )
    expect(runAnswerReviewSynopsisPipelineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        answerId: 'ck12345678901234567890123',
        transcriptText: 'Great event.',
        cid: 'resp_123',
      }),
    )
  })

  it('is idempotent for already-processing answers', async () => {
    prismaMock.answer.findUnique.mockResolvedValue({
      id: 'answer_done',
      responseId: 'resp_123',
      status: 'COMPLETED',
      objectKey: 'recordings/answer.webm',
      mimeType: 'audio/webm',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    })
    prismaMock.answerTranscript.findFirst.mockResolvedValue({ text: 'Existing transcript' })
    prismaMock.answerAnalysis.findFirst.mockResolvedValue({
      summary: 'Existing summary',
      sentimentLabel: 'POSITIVE',
      sentimentScore: 0.6,
      themesJson: { themes: ['Staff'], keyQuote: 'Great staff' },
      actionsJson: { actionItems: [] },
    })

    const { POST } = await import('./route')
    const response = await POST({
      json: async () => ({
        answerId: 'ck12345678901234567890123',
        objectEtag: 'etag-123',
        durationMs: 1200,
      }),
    } as never)

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.data.status).toBe('COMPLETED')
    expect(json.data.transcript).toBe('Existing transcript')
    expect(transcribeAudioMock).not.toHaveBeenCalled()
    expect(runAnswerReviewSynopsisPipelineMock).not.toHaveBeenCalled()
  })

  it.each([
    ['RATING_1_TO_5', 'Four.', null, 4],
    ['RECOMMENDATION_0_TO_10', 'Eight.', null, 8],
    ['YES_NO', 'Yes, definitely.', null, 1],
    ['SINGLE_CHOICE', 'Networking.', { options: ['Content', 'Networking', 'Venue'] }, 1],
  ])('stores canonical structured voice values for %s', async (type, transcript, configurationJson, expectedValue) => {
    transcribeAudioMock.mockResolvedValue({ text: transcript, language: 'en', duration: 1.2 })
    prismaMock.answer.findUnique.mockResolvedValue({
      id: 'answer_123',
      responseId: 'resp_123',
      status: 'UPLOADING',
      objectKey: 'recordings/answer.webm',
      mimeType: 'audio/webm',
      speakerId: null,
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
      question: { type, responseTarget: 'GENERAL', configurationJson },
      response: { eventId: 'event_123', surveyTarget: { category: 'EVENT', eventStructureItemId: null } },
    })

    const { POST } = await import('./route')
    const response = await POST({
      json: async () => ({
        answerId: 'ck12345678901234567890123',
        objectEtag: 'etag-123',
        durationMs: 1200,
      }),
    } as never)

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.data.numericValue).toBe(expectedValue)
    expect(prismaMock.answer.update).toHaveBeenCalledWith({
      where: { id: 'ck12345678901234567890123' },
      data: { numericValue: expectedValue, status: 'COMPLETED', statusReason: null },
    })
    expect(runAnswerReviewSynopsisPipelineMock).not.toHaveBeenCalled()
  })

  it('rejects ambiguous structured speech without guessing', async () => {
    transcribeAudioMock.mockResolvedValue({ text: 'Four, maybe five.', language: 'en', duration: 1.2 })
    prismaMock.answer.findUnique.mockResolvedValue({
      id: 'answer_123', responseId: 'resp_123', status: 'UPLOADING', objectKey: 'recordings/answer.webm',
      mimeType: 'audio/webm', speakerId: null, createdAt: new Date('2026-01-01T12:00:00.000Z'),
      question: { type: 'RATING_1_TO_5', responseTarget: 'GENERAL', configurationJson: null },
      response: { eventId: 'event_123', surveyTarget: { category: 'EVENT', eventStructureItemId: null } },
    })

    const { POST } = await import('./route')
    const response = await POST({
      json: async () => ({ answerId: 'ck12345678901234567890123', objectEtag: 'etag-123', durationMs: 1200 }),
    } as never)

    expect(response.status).toBe(422)
    expect(prismaMock.answer.update).toHaveBeenCalledWith({
      where: { id: 'ck12345678901234567890123' },
      data: { status: 'FAILED', statusReason: expect.stringContaining('AMBIGUOUS') },
    })
    expect(runAnswerReviewSynopsisPipelineMock).not.toHaveBeenCalled()
  })

  it('stores a voice speaker rating against a current session speaker', async () => {
    transcribeAudioMock.mockResolvedValue({ text: 'Five.', language: 'en', duration: 1.2 })
    prismaMock.eventSessionSpeakerAssignment.findFirst.mockResolvedValue({ id: 'assignment_123' })
    prismaMock.answer.findUnique.mockResolvedValue({
      id: 'answer_123', responseId: 'resp_123', status: 'UPLOADING', objectKey: 'recordings/speaker.webm',
      mimeType: 'audio/webm', speakerId: 'speaker_123', createdAt: new Date('2026-01-01T12:00:00.000Z'),
      question: { type: 'SPEAKER_FEEDBACK', responseTarget: 'SPEAKERS', configurationJson: null },
      response: { eventId: 'event_123', surveyTarget: { category: 'SESSION', eventStructureItemId: 'session_123' } },
    })

    const { POST } = await import('./route')
    const response = await POST({
      json: async () => ({ answerId: 'ck12345678901234567890123', objectEtag: 'etag-123', durationMs: 1200 }),
    } as never)

    expect(response.status).toBe(200)
    expect(prismaMock.eventSessionSpeakerAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: 'event_123',
        sessionId: 'session_123',
        speakerId: 'speaker_123',
        speaker: { isArchived: false },
      },
      select: { id: true },
    })
    expect(prismaMock.answer.update).toHaveBeenCalledWith({
      where: { id: 'ck12345678901234567890123' },
      data: { numericValue: 5, status: 'COMPLETED', statusReason: null },
    })
  })

  it('keeps a failed structured confirmation retryable on an idempotent replay', async () => {
    prismaMock.answer.findUnique.mockResolvedValue({
      id: 'answer_123',
      responseId: 'resp_123',
      status: 'FAILED',
      statusReason: 'AMBIGUOUS: Please say one number from 1 to 5.',
      objectKey: 'recordings/answer.webm',
      mimeType: 'audio/webm',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
      question: { type: 'RATING_1_TO_5', responseTarget: 'GENERAL', configurationJson: null },
      response: { eventId: 'event_123', surveyTarget: { category: 'EVENT', eventStructureItemId: null } },
    })
    prismaMock.answerTranscript.findFirst.mockResolvedValue({ text: 'Four, maybe five.' })

    const { POST } = await import('./route')
    const response = await POST({
      json: async () => ({ answerId: 'ck12345678901234567890123', objectEtag: 'etag-123', durationMs: 1200 }),
    } as never)

    expect(response.status).toBe(422)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(json.data).toMatchObject({ retry: true, transcript: 'Four, maybe five.' })
    expect(transcribeAudioMock).not.toHaveBeenCalled()
  })
})
