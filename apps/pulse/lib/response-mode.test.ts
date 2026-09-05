import { describe, expect, it } from 'vitest'
import { ResponseModeSelectionError, resolveAttemptResponseMode } from './response-mode'

describe('resolveAttemptResponseMode', () => {
  it('preserves legacy voice-only surveys', () => {
    expect(resolveAttemptResponseMode(undefined)).toBe('VOICE_ONLY')
    expect(resolveAttemptResponseMode('VOICE_ONLY')).toBe('VOICE_ONLY')
  })

  it('uses the organizer-selected text method without a microphone choice', () => {
    expect(resolveAttemptResponseMode('TEXT_ONLY')).toBe('TEXT_ONLY')
  })

  it('requires and persists one attendee choice for a choice survey', () => {
    expect(resolveAttemptResponseMode('VOICE_AND_TEXT', 'VOICE_ONLY')).toBe('VOICE_ONLY')
    expect(resolveAttemptResponseMode('VOICE_AND_TEXT', 'TEXT_ONLY')).toBe('TEXT_ONLY')
    expect(() => resolveAttemptResponseMode('VOICE_AND_TEXT')).toThrow(ResponseModeSelectionError)
  })

  it('rejects an attendee method that conflicts with the organizer setting', () => {
    expect(() => resolveAttemptResponseMode('VOICE_ONLY', 'TEXT_ONLY')).toThrow(ResponseModeSelectionError)
  })
})
