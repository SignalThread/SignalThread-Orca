import { describe, expect, it } from 'vitest'
import { parseStructuredVoiceAnswer } from './structured-voice-answer'

describe('parseStructuredVoiceAnswer', () => {
  it('maps spoken ratings to canonical numeric values', () => {
    expect(parseStructuredVoiceAnswer({ type: 'RATING_1_TO_5', transcript: 'Four.' })).toMatchObject({ ok: true, numericValue: 4 })
    expect(parseStructuredVoiceAnswer({ type: 'RECOMMENDATION_0_TO_10', transcript: 'I would say eight' })).toMatchObject({ ok: true, numericValue: 8 })
  })

  it('maps yes/no to a canonical binary value', () => {
    expect(parseStructuredVoiceAnswer({ type: 'YES_NO', transcript: 'Yes, definitely.' })).toEqual({ ok: true, numericValue: 1, label: 'Yes' })
    expect(parseStructuredVoiceAnswer({ type: 'YES_NO', transcript: 'Nope.' })).toEqual({ ok: true, numericValue: 0, label: 'No' })
  })

  it('maps only a configured single-choice option', () => {
    const options = ['Content', 'Networking', 'Venue']
    expect(parseStructuredVoiceAnswer({ type: 'SINGLE_CHOICE', transcript: 'Networking, please.', options })).toEqual({ ok: true, numericValue: 1, label: 'Networking' })
    expect(parseStructuredVoiceAnswer({ type: 'SINGLE_CHOICE', transcript: 'The food', options })).toMatchObject({ ok: false, reason: 'INVALID' })
  })

  it('never guesses ambiguous structured speech', () => {
    expect(parseStructuredVoiceAnswer({ type: 'RATING_1_TO_5', transcript: 'Four, maybe five.' })).toMatchObject({ ok: false, reason: 'AMBIGUOUS' })
    expect(parseStructuredVoiceAnswer({ type: 'RATING_1_TO_5', transcript: 'Eleven or four.' })).toMatchObject({ ok: false, reason: 'AMBIGUOUS' })
    expect(parseStructuredVoiceAnswer({ type: 'YES_NO', transcript: 'Yes and no.' })).toMatchObject({ ok: false, reason: 'AMBIGUOUS' })
    expect(parseStructuredVoiceAnswer({ type: 'SINGLE_CHOICE', transcript: 'Content or networking', options: ['Content', 'Networking'] })).toMatchObject({ ok: false, reason: 'AMBIGUOUS' })
    expect(parseStructuredVoiceAnswer({ type: 'SINGLE_CHOICE', transcript: 'Not networking', options: ['Content', 'Networking'] })).toMatchObject({ ok: false, reason: 'INVALID' })
  })
})
