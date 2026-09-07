import type { Page } from '@playwright/test'

export async function installMockMediaRecorder(page: Page, options: { denyMicrophone?: boolean } = {}) {
  await page.addInitScript(({ denyMicrophone }) => {
    const audioChunk = new Uint8Array(12 * 1024)
    audioChunk.set([82, 73, 70, 70, 1, 2, 3, 4])

    class MockMediaStream {
      getTracks() {
        return [{ stop() {} }]
      }
    }

    class MockMediaRecorder extends EventTarget {
      static isTypeSupported() {
        return true
      }

      state = 'inactive'
      mimeType = 'audio/webm'
      stream: unknown
      ondataavailable: ((event: BlobEvent) => void) | null = null
      onstop: (() => void) | null = null

      constructor(stream: unknown) {
        super()
        this.stream = stream
      }

      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        const blob = new Blob([audioChunk], { type: this.mimeType })
        const event = new BlobEvent('dataavailable', { data: blob })
        this.ondataavailable?.(event)
        this.dispatchEvent(event)
        this.onstop?.()
        this.dispatchEvent(new Event('stop'))
      }
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: denyMicrophone
          ? () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
          : () => Promise.resolve(new MockMediaStream()),
      },
    })

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: MockMediaRecorder,
    })

    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: function play() {
        window.setTimeout(() => {
          this.onloadedmetadata?.(new Event('loadedmetadata'))
          this.onended?.(new Event('ended'))
        }, 0)
        return Promise.resolve()
      },
    })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: () => undefined,
    })

    class MockAudioContext {
      decodeAudioData() {
        return Promise.resolve({ duration: 2 })
      }

      close() {
        return Promise.resolve()
      }
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: MockAudioContext,
    })
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: MockAudioContext,
    })
  }, options)
}
