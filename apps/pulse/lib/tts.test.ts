import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginBrowserAudioSession, playAudioUrl } from './tts'

class FakeAudio {
  static instances: FakeAudio[] = []
  static finishUnlock: (() => void) | null = null

  src = ''
  volume = 1
  onloadedmetadata: (() => void) | null = null
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn(() => {
    if (FakeAudio.instances[0] === this && this.play.mock.calls.length === 1) {
      return new Promise<void>((resolve) => {
        FakeAudio.finishUnlock = resolve
      })
    }
    return Promise.resolve()
  })
  pause = vi.fn()
  load = vi.fn()

  constructor() {
    FakeAudio.instances.push(this)
  }
}

async function finishPlayback(audio: FakeAudio, playback: Promise<void>) {
  audio.onended?.()
  await playback
}

describe('kiosk browser audio session', () => {
  const OriginalAudio = globalThis.Audio

  beforeEach(() => {
    FakeAudio.instances = []
    FakeAudio.finishUnlock = null
    globalThis.Audio = FakeAudio as unknown as typeof Audio
  })

  afterEach(() => {
    globalThis.Audio = OriginalAudio
    vi.restoreAllMocks()
  })

  it('plays question one normally after unlock, then question two and replay normally', async () => {
    // start kiosk: the consent gesture begins a silent unlock on one reusable element
    const firstAudio = new Audio() as unknown as FakeAudio
    const session = beginBrowserAudioSession(firstAudio as unknown as HTMLAudioElement)
    expect(firstAudio.src).toMatch(/^data:audio\/mp3/)
    expect(firstAudio.volume).toBe(0.01)
    expect(firstAudio.play).toHaveBeenCalledTimes(1)

    // question one cannot replace or play over the unlock source while the
    // browser's first play promise is still pending
    const firstQuestion = playAudioUrl('/cached/question-1.mp3', { audioSession: session })
    expect(firstAudio.src).toMatch(/^data:audio\/mp3/)
    expect(firstAudio.play).toHaveBeenCalledTimes(1)

    FakeAudio.finishUnlock?.()
    await vi.waitFor(() => {
      expect(firstAudio.src).toBe('/cached/question-1.mp3')
      expect(firstAudio.play).toHaveBeenCalledTimes(2)
    })
    expect(firstAudio.volume).toBe(1)
    await finishPlayback(firstAudio, firstQuestion)

    // replay of question one remains the fresh-element path and is full volume
    const replay = playAudioUrl('/cached/question-1.mp3')
    const replayAudio = FakeAudio.instances[1]
    expect(replayAudio.src).toBe('/cached/question-1.mp3')
    expect(replayAudio.volume).toBe(1)
    expect(replayAudio.play).toHaveBeenCalledTimes(1)
    await finishPlayback(replayAudio, replay)

    // question two follows the unchanged fresh-element path at normal volume
    const secondQuestion = playAudioUrl('/cached/question-2.mp3')
    const secondAudio = FakeAudio.instances[2]
    expect(secondAudio.src).toBe('/cached/question-2.mp3')
    expect(secondAudio.volume).toBe(1)
    expect(secondAudio.play).toHaveBeenCalledTimes(1)
    await finishPlayback(secondAudio, secondQuestion)
  })
})
