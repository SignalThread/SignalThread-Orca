import { beforeEach, describe, expect, it, vi } from 'vitest'

const playAudioUrlMock = vi.fn()
const playTtsMock = vi.fn()

vi.mock('./tts', () => ({
  playAudioUrl: playAudioUrlMock,
  playTTS: playTtsMock,
}))

describe('playRuntimeQuestionAudio', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('prefers cached QuestionAudioAsset URLs over fallback TTS', async () => {
    const { playRuntimeQuestionAudio } = await import('./kiosk-question-audio')

    await playRuntimeQuestionAudio({
      id: 'q1',
      text: 'How was your visit?',
      audioUrl: 'https://signed.example/question-audio/q1.mp3',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
    })

    expect(playAudioUrlMock).toHaveBeenCalledWith(
      'https://signed.example/question-audio/q1.mp3',
      {},
    )
    expect(playTtsMock).not.toHaveBeenCalled()
  })

  it('falls back to temporary server TTS with the selected saved voice when no cached audio exists', async () => {
    const { playRuntimeQuestionAudio } = await import('./kiosk-question-audio')

    await playRuntimeQuestionAudio({
      id: 'q2',
      text: 'Tell us about your visit.',
      audioUrl: null,
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Neural2-A',
      ttsLocale: 'en-GB',
      fallbackReason: 'playable-url-unavailable',
    })

    expect(playAudioUrlMock).not.toHaveBeenCalled()
    expect(playTtsMock).toHaveBeenCalledWith(
      'Tell us about your visit.',
      expect.objectContaining({
        provider: 'google',
        voice: 'en-GB-Neural2-A',
        locale: 'en-GB',
      }),
    )
  })

  it('forwards the response id and question key so the server can verify fallback TTS text', async () => {
    const { playRuntimeQuestionAudio } = await import('./kiosk-question-audio')

    await playRuntimeQuestionAudio(
      { id: 'q_visit', text: 'Tell us about your visit.', audioUrl: null },
      { responseId: 'clresponse000000000000001' },
    )

    expect(playTtsMock).toHaveBeenCalledWith(
      'Tell us about your visit.',
      expect.objectContaining({ responseId: 'clresponse000000000000001', questionKey: 'q_visit' }),
    )
    expect(playTtsMock.mock.calls[0][1]).not.toHaveProperty('audioSession')
  })
})
