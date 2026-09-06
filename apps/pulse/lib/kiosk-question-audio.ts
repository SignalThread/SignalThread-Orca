import { playAudioUrl, playTTS, type PlaybackOptions } from './tts'

export interface RuntimeQuestionPlayback {
  id: string
  text: string
  audioUrl?: string | null
  ttsProvider?: string | null
  ttsVoice?: string | null
  ttsLocale?: string | null
  fallbackReason?: string | null
}

export type RuntimeQuestionPlaybackOptions = PlaybackOptions & {
  /** The attendee's in-progress response; lets the server verify the fallback TTS text. */
  responseId?: string
}

export async function playRuntimeQuestionAudio(
  question: RuntimeQuestionPlayback,
  options: RuntimeQuestionPlaybackOptions = {},
): Promise<void> {
  if (question.audioUrl) {
    console.info('[Kiosk] Playing cached question audio asset', {
      questionId: question.id,
      audioUrl: question.audioUrl,
      voice: question.ttsVoice ?? null,
      locale: question.ttsLocale ?? null,
    })

    return playAudioUrl(question.audioUrl, options)
  }

  console.warn('[Kiosk] Falling back to temporary server TTS for question playback', {
    questionId: question.id,
    reason: question.fallbackReason ?? 'missing-audio-url',
    provider: question.ttsProvider ?? null,
    voice: question.ttsVoice ?? null,
    locale: question.ttsLocale ?? null,
  })

  const { responseId, ...playback } = options
  return playTTS(question.text, {
    ...playback,
    provider: question.ttsProvider ?? undefined,
    voice: question.ttsVoice ?? undefined,
    locale: question.ttsLocale ?? undefined,
    responseId,
    // Runtime questions are keyed by their question key (see /api/response/create).
    questionKey: question.id,
  })
}
