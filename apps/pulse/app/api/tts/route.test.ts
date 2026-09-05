import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyObjectExistsMock = vi.fn()
const getPlayableObjectUrlMock = vi.fn()
const uploadObjectMock = vi.fn()
const previewQuestionAudioMock = vi.fn()

vi.mock('@/lib/objectStorage', () => ({
  verifyObjectExists: verifyObjectExistsMock,
  getPlayableObjectUrl: getPlayableObjectUrlMock,
  uploadObject: uploadObjectMock,
}))

vi.mock('@/lib/question-audio', () => ({
  previewQuestionAudio: previewQuestionAudioMock,
}))

describe('POST /api/tts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.S3_BUCKET_NAME = 'uploads'
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
      json: async () => ({
        text: 'How was your visit?',
        provider: 'google',
        voice: 'en-GB-Neural2-A',
        locale: 'en-US',
      }),
    } as never)

    expect(response.status).toBe(200)
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
      json: async () => ({
        text: 'How was your visit?',
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
})
