import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueMock = vi.fn()
const presignPutMock = vi.fn()
const generateObjectKeyMock = vi.fn()
const getStorageConfigMock = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    response: {
      findUnique: findUniqueMock,
    },
  },
}))

vi.mock('@/lib/objectStorage', () => ({
  presignPut: presignPutMock,
  generateObjectKey: generateObjectKeyMock,
  getStorageConfig: getStorageConfigMock,
}))

describe('POST /api/answer/presign', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.S3_BUCKET_NAME = 'uploads'
    process.env.S3_UPLOAD_EXPIRES_IN = '300'
    getStorageConfigMock.mockReturnValue({ provider: 's3' })
    generateObjectKeyMock.mockReturnValue('answers/tmp-key.webm')
    presignPutMock.mockResolvedValue('https://example.com/presigned')
  })

  it('validates questionKey against Question rows when they exist', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'resp_123',
      event: {
        id: 'evt_123',
        responseMode: 'VOICE_ONLY',
        questions: [
          { key: 'q-1', label: 'Primary question', ttsText: null, order: 1, required: true },
        ],
        questionsJson: [
          { key: 'legacy-only', label: 'Legacy question', order: 1, required: true },
        ],
      },
    })

    const { POST } = await import('@/app/api/answer/presign/route')

    const response = await POST({
      text: async () =>
        JSON.stringify({
          responseId: 'ck12345678901234567890123',
          questionKey: 'q-1',
          promptLabel: 'Primary question',
          fileName: 'answer.webm',
          fileSize: 1024,
          mimeType: 'audio/webm',
        }),
    } as never)

    expect(response.status).toBe(200)
    expect(presignPutMock).toHaveBeenCalledWith({
      bucket: 'uploads',
      key: 'answers/tmp-key.webm',
      contentType: 'audio/webm',
      expiresIn: 300,
    })
  })

  it('falls back to questionsJson when the event has zero Question rows', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'resp_456',
      event: {
        id: 'evt_456',
        responseMode: 'VOICE_ONLY',
        questions: [],
        questionsJson: [
          { id: 'q-fallback', text: 'Fallback question', order: 0, required: true },
        ],
      },
    })

    const { POST } = await import('@/app/api/answer/presign/route')

    const response = await POST({
      text: async () =>
        JSON.stringify({
          responseId: 'ck12345678901234567890123',
          questionKey: 'q-fallback',
          promptLabel: 'Fallback question',
          fileName: 'answer.webm',
          fileSize: 1024,
          mimeType: 'audio/webm;codecs=opus',
        }),
    } as never)

    expect(response.status).toBe(200)
    expect(presignPutMock).toHaveBeenCalledWith({
      bucket: 'uploads',
      key: 'answers/tmp-key.webm',
      contentType: 'audio/webm',
      expiresIn: 300,
    })
  })

  it('rejects voice upload presign when survey is text-only', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'resp_txt',
      responseMode: 'TEXT_ONLY',
      event: {
        id: 'evt_txt',
        responseMode: 'TEXT_ONLY',
        questions: [{ key: 'q-1', label: 'Q', ttsText: null, order: 1, required: true }],
        questionsJson: [],
      },
    })

    const { POST } = await import('@/app/api/answer/presign/route')

    const response = await POST({
      text: async () =>
        JSON.stringify({
          responseId: 'ck12345678901234567890123',
          questionKey: 'q-1',
          promptLabel: 'Q',
          fileName: 'answer.webm',
          fileSize: 1024,
          mimeType: 'audio/webm',
        }),
    } as never)

    expect(response.status).toBe(400)
    expect(presignPutMock).not.toHaveBeenCalled()
  })

  it('allows voice upload presign for a structured survey question', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'resp_rating',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      event: { responseMode: 'VOICE_ONLY', questions: [], questionsJson: [] },
      survey: {
        id: 'survey_123',
        responseMode: 'VOICE_ONLY',
        questions: [{
          id: 'question_rating', key: 'rating', label: 'Rate the session', ttsText: null,
          type: 'RATING_1_TO_5', order: 0, required: true,
        }],
      },
    })

    const { POST } = await import('@/app/api/answer/presign/route')
    const response = await POST({
      text: async () => JSON.stringify({
        responseId: 'ck12345678901234567890123', questionKey: 'rating', promptLabel: 'Rate the session',
        fileName: 'answer.webm', fileSize: 1024, mimeType: 'audio/webm',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(presignPutMock).toHaveBeenCalled()
  })
})
