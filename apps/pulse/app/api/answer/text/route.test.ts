import { beforeEach, describe, expect, it, vi } from 'vitest'

const answerCreateMock = vi.fn()
const answerProcessingLogCreateMock = vi.fn()
const answerTranscriptUpsertMock = vi.fn()
const answerTranscriptFindFirstMock = vi.fn()
const answerAnalysisFindFirstMock = vi.fn()
const resolveAnswerQuestionContextMock = vi.fn()
const runAnswerReviewSynopsisPipelineMock = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    answer: {
      create: answerCreateMock,
    },
    answerProcessingLog: {
      create: answerProcessingLogCreateMock,
    },
    answerTranscript: {
      upsert: answerTranscriptUpsertMock,
      findFirst: answerTranscriptFindFirstMock,
    },
    answerAnalysis: {
      findFirst: answerAnalysisFindFirstMock,
    },
  },
}))

vi.mock('@/lib/answer-question-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/answer-question-context')>('@/lib/answer-question-context')
  return {
    ...actual,
    resolveAnswerQuestionContext: resolveAnswerQuestionContextMock,
  }
})

vi.mock('@/lib/answer-review-synopsis-pipeline', () => ({
  runAnswerReviewSynopsisPipeline: runAnswerReviewSynopsisPipelineMock,
}))

describe('POST /api/answer/text', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    answerCreateMock.mockResolvedValue({ id: 'answer_123' })
    answerProcessingLogCreateMock.mockResolvedValue({})
    answerTranscriptUpsertMock.mockResolvedValue({})
    answerTranscriptFindFirstMock.mockResolvedValue({ text: 'Typed answer' })
    answerAnalysisFindFirstMock.mockResolvedValue(null)
    runAnswerReviewSynopsisPipelineMock.mockResolvedValue(undefined)
  })

  it('writes questionId for survey-scoped typed answers', async () => {
    resolveAnswerQuestionContextMock.mockResolvedValue({
      responseId: 'ck12345678901234567890123',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      questionId: 'question_123',
      questionKey: 'survey-q1',
      questionType: 'VOICE',
      responseMode: 'TEXT_ONLY',
      scope: 'survey',
    })

    const { POST } = await import('@/app/api/answer/text/route')

    const response = await POST({
      json: async () => ({
        responseId: 'ck12345678901234567890123',
        questionKey: 'survey-q1',
        promptLabel: 'Survey question',
        text: 'Typed answer',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(answerCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        responseId: 'ck12345678901234567890123',
        questionId: 'question_123',
        questionKey: 'survey-q1',
        promptLabel: 'Survey question',
        mimeType: 'text/plain',
        objectEtag: 'text-entry',
        status: 'PROCESSING_TRANSCRIPT',
      }),
    })
  })

  it('preserves legacy event-scoped typed answers without questionId', async () => {
    resolveAnswerQuestionContextMock.mockResolvedValue({
      responseId: 'ck12345678901234567890123',
      eventId: 'evt_123',
      surveyId: null,
      questionId: null,
      questionKey: 'q-1',
      questionType: 'VOICE',
      responseMode: 'TEXT_ONLY',
      scope: 'event',
    })

    const { POST } = await import('@/app/api/answer/text/route')

    const response = await POST({
      json: async () => ({
        responseId: 'ck12345678901234567890123',
        questionKey: 'q-1',
        promptLabel: 'Legacy question',
        text: 'Typed answer',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(answerCreateMock).toHaveBeenCalledWith({
      data: expect.not.objectContaining({
        questionId: expect.any(String),
      }),
    })
  })

  it('does not route structured questions through text analysis', async () => {
    resolveAnswerQuestionContextMock.mockResolvedValue({
      responseId: 'ck12345678901234567890123',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      questionId: 'question_123',
      questionKey: 'rating',
      questionType: 'RATING_1_TO_5',
      responseMode: 'VOICE_AND_TEXT',
      scope: 'survey',
    })

    const { POST } = await import('@/app/api/answer/text/route')
    const response = await POST({
      json: async () => ({
        responseId: 'ck12345678901234567890123',
        questionKey: 'rating',
        promptLabel: 'Rate it',
        text: 'five',
      }),
    } as never)

    expect(response.status).toBe(400)
    expect(answerCreateMock).not.toHaveBeenCalled()
    expect(runAnswerReviewSynopsisPipelineMock).not.toHaveBeenCalled()
  })
})
