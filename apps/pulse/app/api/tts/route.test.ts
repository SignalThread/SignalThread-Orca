import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyObjectExistsMock = vi.fn()
const getPlayableObjectUrlMock = vi.fn()
const uploadObjectMock = vi.fn()
const previewQuestionAudioMock = vi.fn()
const resolveAnswerQuestionContextMock = vi.fn()

vi.mock('@/lib/objectStorage', () => ({
  verifyObjectExists: verifyObjectExistsMock,
  getPlayableObjectUrl: getPlayableObjectUrlMock,
  uploadObject: uploadObjectMock,
}))

vi.mock('@/lib/question-audio', () => ({
  previewQuestionAudio: previewQuestionAudioMock,
}))

vi.mock('@/lib/answer-question-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/answer-question-context')>('@/lib/answer-question-context')
  return { ...actual, resolveAnswerQuestionContext: resolveAnswerQuestionContextMock }
})

const RESPONSE_ID = 'clresponse000000000000001'
const scopedBody = (overrides: Record<string, unknown> = {}) => ({
  text: 'How was your visit?',
  responseId: RESPONSE_ID,
  questionKey: 'q_visit',
  ...overrides,
})

describe('POST /api/tts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.S3_BUCKET_NAME = 'uploads'
    resolveAnswerQuestionContextMock.mockResolvedValue({
      responseId: RESPONSE_ID,
      questionKey: 'q_visit',
      spokenTexts: ['How was your visit?', 'Tell me, how was your visit today?'],
    })
  })

  it('uses the selected voice and derived locale for fallback TTS instead of old hardcoded defaults', async () => {
    verifyObjectExistsMock.mockResolvedValue(false)
    previewQuestionAudioMock.mockResolvedValue({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
      durationMs: null,
    })
    getPlayableObjectUrlMock.mockResolvedValue('https://signed.example/tts/hash.mp3')

    const { POST } = await import('@/app/api/tts/route')

    const response = await POST({
      json: async () => scopedBody({
        provider: 'google',
        voice: 'en-GB-Neural2-A',
        locale: 'en-US',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(resolveAnswerQuestionContextMock).toHaveBeenCalledWith({ responseId: RESPONSE_ID, questionKey: 'q_visit' })
    expect(previewQuestionAudioMock).toHaveBeenCalledWith({
      provider: 'google',
      voice: 'en-GB-Neural2-A',
      locale: 'en-GB',
      text: 'How was your visit?',
    })
    expect(uploadObjectMock).toHaveBeenCalledTimes(1)
    expect(getPlayableObjectUrlMock).toHaveBeenCalledTimes(1)
  })

  it('reuses cached fallback TTS audio when provider, voice, locale, and text match', async () => {
    verifyObjectExistsMock.mockResolvedValue(true)
    getPlayableObjectUrlMock.mockResolvedValue('https://signed.example/tts/hash.mp3')

    const { POST } = await import('@/app/api/tts/route')

    const response = await POST({
      json: async () => scopedBody({
        provider: 'google',
        voice: 'en-AU-Neural2-A',
        locale: 'en-AU',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(previewQuestionAudioMock).not.toHaveBeenCalled()
    expect(uploadObjectMock).not.toHaveBeenCalled()
    expect(getPlayableObjectUrlMock).toHaveBeenCalledWith('uploads', expect.stringMatching(/^tts\/.*\.mp3$/))
  })

  it('speaks the configured TTS override wording as well as the label', async () => {
    verifyObjectExistsMock.mockResolvedValue(true)
    getPlayableObjectUrlMock.mockResolvedValue('https://signed.example/tts/hash.mp3')
    const { POST } = await import('@/app/api/tts/route')
    const response = await POST({ json: async () => scopedBody({ text: 'Tell me, how was your visit today?' }) } as never)
    expect(response.status).toBe(200)
  })

  it('refuses free text without a response and question before any provider or storage call', async () => {
    const { POST } = await import('@/app/api/tts/route')
    const response = await POST({ json: async () => ({ text: 'Read my marketing copy aloud', provider: 'google' }) } as never)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'responseId and questionKey are required: /api/tts only speaks a survey question for an existing response',
    })
    expect(resolveAnswerQuestionContextMock).not.toHaveBeenCalled()
    expect(verifyObjectExistsMock).not.toHaveBeenCalled()
    expect(previewQuestionAudioMock).not.toHaveBeenCalled()
    expect(uploadObjectMock).not.toHaveBeenCalled()
  })

  it('refuses text that is not the question wording, even for a real response', async () => {
    const { POST } = await import('@/app/api/tts/route')
    const response = await POST({ json: async () => scopedBody({ text: 'Something the organizer never configured' }) } as never)
    expect(response.status).toBe(403)
    expect(verifyObjectExistsMock).not.toHaveBeenCalled()
    expect(previewQuestionAudioMock).not.toHaveBeenCalled()
  })

  it('maps an unknown response or question to the context error status', async () => {
    const { AnswerQuestionContextError } = await import('@/lib/answer-question-context')
    resolveAnswerQuestionContextMock.mockRejectedValue(new AnswerQuestionContextError('No response found with ID: x', 404))
    const { POST } = await import('@/app/api/tts/route')
    const response = await POST({ json: async () => scopedBody() } as never)
    expect(response.status).toBe(404)
    expect(previewQuestionAudioMock).not.toHaveBeenCalled()
  })
})
