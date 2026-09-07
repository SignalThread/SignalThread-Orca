/**
 * Client-side TTS playback helpers.
 *
 * Primary path:
 * - play cached server-generated question audio URLs
 *
 * Fallback path:
 * - request temporary server-generated Google TTS audio for the specific
 *   provider / voice / locale requested by the survey runtime
 */

const TTS_TIMEOUT = 30000
const SILENT_AUDIO_URL = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYlPUGiAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYlPUGiAAAAAAAAAAAAAAAAAAAA'

export interface BrowserAudioSession {
  audio: HTMLAudioElement
  ready: Promise<boolean>
}

export interface PlaybackOptions {
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
  signal?: AbortSignal
  audioSession?: BrowserAudioSession
}

export interface TTSOptions extends PlaybackOptions {
  provider?: string
  voice?: string
  locale?: string
  /** In-progress kiosk response the spoken question belongs to; required by /api/tts. */
  responseId?: string
  /** Question key within that response; the server speaks only that question's text. */
  questionKey?: string
}

async function playAudioSource(url: string, options: PlaybackOptions = {}): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let audio: HTMLAudioElement | null = null
    let completed = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      if (audio) {
        audio.pause()
        audio.src = ''
        audio.load()
        audio = null
      }
    }

    const complete = (success: boolean, error?: Error) => {
      if (completed) return
      completed = true
      cleanup()

      if (success) {
        options.onEnd?.()
        resolve()
      } else {
        options.onError?.(error!)
        reject(error)
      }
    }

    try {
      if (options.signal) {
        if (options.signal.aborted) {
          throw new Error('Audio playback aborted before start')
        }
        options.signal.addEventListener('abort', () => {
          complete(false, new Error('Audio playback aborted'))
        })
      }

      if (options.audioSession) {
        const audioSessionReady = await options.audioSession.ready
        if (completed || options.signal?.aborted) return
        if (!audioSessionReady) {
          throw new Error('Browser audio session could not be unlocked')
        }
        audio = options.audioSession.audio
      } else {
        audio = new Audio()
      }
      audio.src = url

      timeout = setTimeout(() => {
        complete(false, new Error('Audio playback timeout'))
      }, TTS_TIMEOUT)

      audio.onloadedmetadata = () => {
        options.onStart?.()
      }

      audio.onended = () => {
        complete(true)
      }

      audio.onerror = () => {
        complete(false, new Error('Audio playback error'))
      }

      await audio.play()
    } catch (error: any) {
      complete(false, error)
    }
  })
}

/**
 * Starts the browser's media unlock handshake inside a user gesture.
 * Real question audio must wait for `ready`, which also restores the reusable
 * element from the handshake level to normal playback volume.
 */
export function beginBrowserAudioSession(audio: HTMLAudioElement): BrowserAudioSession {
  audio.src = SILENT_AUDIO_URL
  audio.volume = 0.01

  const ready = audio.play().then(
    () => {
      audio.volume = 1
      return true
    },
    () => false,
  )

  return { audio, ready }
}

export async function playAudioUrl(url: string, options: PlaybackOptions = {}): Promise<void> {
  return playAudioSource(url, options)
}

export async function playTTS(text: string, options: TTSOptions = {}): Promise<void> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      provider: options.provider,
      voice: options.voice,
      locale: options.locale,
      responseId: options.responseId,
      questionKey: options.questionKey,
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    throw new Error('Failed to generate TTS audio')
  }

  const data = await response.json()
  if (!data.success || !data.url) {
    throw new Error('Invalid TTS response')
  }

  return playAudioSource(data.url, options)
}

export function cancelTTS(): void {
  // Callers own AbortController state. This helper remains a no-op to keep
  // the old API surface stable.
}
