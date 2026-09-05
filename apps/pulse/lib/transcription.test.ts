import { beforeEach, describe, expect, it, vi } from 'vitest'

const downloadObject = vi.fn()
vi.mock('./s3', () => ({ downloadObject }))

describe('deterministic external transcription boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    downloadObject.mockReset().mockResolvedValue(Buffer.from('real stored bytes'))
    process.env.EVENTS_TEST_DISABLE_EXTERNAL_PROVIDERS = '1'
    process.env.EVENTS_TEST_TRANSCRIPT = 'Deterministic test transcript.'
  })

  it('still downloads the real storage object before returning the test provider result', async () => {
    const { transcribeAudio } = await import('./transcription')
    await expect(transcribeAudio('recordings/answer.webm', 'audio/webm')).resolves.toMatchObject({
      text: 'Deterministic test transcript.',
      language: 'en',
    })
    expect(downloadObject).toHaveBeenCalledWith('recordings/answer.webm')
  })
})
