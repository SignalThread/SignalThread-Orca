import { beforeEach, describe, expect, it, vi } from 'vitest'

const answerCreateMock = vi.fn()
const verifyObjectExistsMock = vi.fn()
const resolveAnswerQuestionContextMock = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    answer: {
      create: answerCreateMock,
    },
  },
}))

vi.mock('@/lib/objectStorage', () => ({
  verifyObjectExists: verifyObjectExistsMock,
}))

vi.mock('@/lib/answer-question-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/answer-question-context')>('@/lib/answer-question-context')
  return {
    ...actual,
    resolveAnswerQuestionContext: resolveAnswerQuestionContextMock,
  }
})

describe('POST /api/answer/complete', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.S3_BUCKET_NAME = 'uploads'
    verifyObjectExistsMock.mockResolvedValue(true)
    answerCreateMock.mockResolvedValue({ id: 'answer_123' })
  })

  it('preserves legacy event response answer creation without questionId', async () => {
    resolveAnswerQuestionContextMock.mockResolvedValue({
      responseId: 'ck12345678901234567890123',
      eventId: 'evt_123',
      surveyId: null,
      questionId: null,
      questionKey: 'q-1',
      responseMode: 'VOICE_ONLY',
      scope: 'event',
    })

    const { POST } = await import('@/app/api/answer/complete/route')

    const response = await POST({
      json: async () => ({
        responseId: 'ck12345678901234567890123',
        questionKey: 'q-1',
        promptLabel: 'Legacy question',
        fileSize: 1024,
        mimeType: 'audio/webm',
        key: 'recordings/answer.webm',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(answerCreateMock).toHaveBeenCalledWith({
      data: {
        responseId: 'ck12345678901234567890123',
        questionKey: 'q-1',
        promptLabel: 'Legacy question',
        objectKey: 'recordings/answer.webm',
        mimeType: 'audio/webm',
        fileSizeBytes: 1024,
        status: 'UPLOADING',
      },
    })
  })

  it('writes questionId for survey-scoped answer creation', async () => {
    resolveAnswerQuestionContextMock.mockResolvedValue({
      responseId: 'ck12345678901234567890123',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      questionId: 'question_123',
      questionKey: 'survey-q1',
      responseMode: 'VOICE_ONLY',
      scope: 'survey',
    })

    const { POST } = await import('@/app/api/answer/complete/route')

    const response = await POST({
      json: async () => ({
        responseId: 'ck12345678901234567890123',
        questionKey: 'survey-q1',
        promptLabel: 'Survey question',
        fileSize: 2048,
        mimeType: 'audio/webm;codecs=opus',
        key: 'recordings/survey-answer.webm',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(answerCreateMock).toHaveBeenCalledWith({
      data: {
        responseId: 'ck12345678901234567890123',
        questionId: 'question_123',
        questionKey: 'survey-q1',
        promptLabel: 'Survey question',
        objectKey: 'recordings/survey-answer.webm',
        mimeType: 'audio/webm',
        fileSizeBytes: 2048,
        status: 'UPLOADING',
      },
    })
  })

  it('rejects speaker identity on non-speaker questions', async () => {
    resolveAnswerQuestionContextMock.mockResolvedValue({
      responseId: 'ck12345678901234567890123',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      questionId: 'question_123',
      questionKey: 'rating',
      questionType: 'RATING_1_TO_5',
      responseMode: 'VOICE_ONLY',
      scope: 'survey',
    })

    const { POST } = await import('@/app/api/answer/complete/route')
    const response = await POST({
      json: async () => ({
        responseId: 'ck12345678901234567890123',
        questionKey: 'rating',
        promptLabel: 'Rate the session',
        fileSize: 1024,
        mimeType: 'audio/webm',
        key: 'recordings/rating.webm',
        speakerId: 'ck98765432109876543210987',
      }),
    } as never)

    expect(response.status).toBe(400)
    expect(answerCreateMock).not.toHaveBeenCalled()
    expect(verifyObjectExistsMock).not.toHaveBeenCalled()
  })

  it('requires speaker identity for speaker rating uploads', async () => {
    resolveAnswerQuestionContextMock.mockResolvedValue({
      responseId: 'ck12345678901234567890123',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      questionId: 'question_123',
      questionKey: 'speaker-rating',
      questionType: 'SPEAKER_FEEDBACK',
      responseMode: 'VOICE_ONLY',
      scope: 'survey',
    })

    const { POST } = await import('@/app/api/answer/complete/route')
    const response = await POST({
      json: async () => ({
        responseId: 'ck12345678901234567890123',
        questionKey: 'speaker-rating',
        promptLabel: 'Rate this speaker',
        fileSize: 1024,
        mimeType: 'audio/webm',
        key: 'recordings/speaker-rating.webm',
      }),
    } as never)

    expect(response.status).toBe(400)
    expect(answerCreateMock).not.toHaveBeenCalled()
    expect(verifyObjectExistsMock).not.toHaveBeenCalled()
  })
})
