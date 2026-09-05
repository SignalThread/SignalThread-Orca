import { describe, expect, it } from 'vitest'
import {
  CURATED_TTS_VOICE_OPTIONS,
  DEFAULT_TTS_GENDER,
  DEFAULT_TTS_VOICE_LITERAL,
  deriveGenderFromVoice,
  deriveLocaleFromVoice,
  getCuratedVoiceOptionsForGender,
  getVoiceSelectOptions,
  normalizeCuratedTtsVoice,
  TTS_VOICE_PROFILE_OPTIONS,
} from './tts-voices'

describe('tts voice catalog', () => {
  it('does not expose any Standard voices in the shared voice list', () => {
    expect(CURATED_TTS_VOICE_OPTIONS).toHaveLength(12)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.value.includes('Standard'))).toBe(false)
  })

  it('uses business-friendly tone labels without exposing technical terms', () => {
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.label === 'Friendly & Welcoming')).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.label === 'Warm & Conversational')).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.label === 'Warm & Conversational')).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.label === 'Confident Professional')).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.label === 'Calm & Reassuring')).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.label === 'Polished Narrator')).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.label === 'British Friendly')).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.label === 'Australian Friendly')).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => /Neural2|WaveNet|Studio|Standard/.test(voice.label))).toBe(false)
  })

  it('provides customer-facing names and personality descriptions for the grouped picker', () => {
    expect(CURATED_TTS_VOICE_OPTIONS.every((voice) => voice.name.trim() && voice.description.trim())).toBe(true)
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.name === 'Ava')).toBe(true)
  })

  it('removes the weaker female clear professional option and balances male coverage', () => {
    expect(CURATED_TTS_VOICE_OPTIONS.some((voice) => voice.value === 'en-US-Neural2-C')).toBe(false)

    const femaleCount = CURATED_TTS_VOICE_OPTIONS.filter((voice) => voice.gender === 'female').length
    const maleCount = CURATED_TTS_VOICE_OPTIONS.filter((voice) => voice.gender === 'male').length

    expect(femaleCount).toBe(5)
    expect(maleCount).toBe(7)
    expect(maleCount).toBeGreaterThanOrEqual(femaleCount)
  })

  it('maps every curated option to a valid Google voice id', () => {
    expect(
      CURATED_TTS_VOICE_OPTIONS.every((voice) => /^(en-(US|GB|AU))-[A-Za-z0-9-]+$/.test(voice.value)),
    ).toBe(true)
  })

  it('derives locale from the selected voice id', () => {
    expect(deriveLocaleFromVoice('en-US-Neural2-I')).toBe('en-US')
    expect(deriveLocaleFromVoice('en-GB-Studio-C')).toBe('en-GB')
    expect(deriveLocaleFromVoice('en-AU-Neural2-A')).toBe('en-AU')
    expect(deriveLocaleFromVoice('en-US-Studio-Q')).toBe('en-US')
  })

  it('defaults to the female friendly and welcoming voice', () => {
    expect(DEFAULT_TTS_GENDER).toBe('female')
    expect(DEFAULT_TTS_VOICE_LITERAL).toBe('en-US-Neural2-F')
    expect(deriveGenderFromVoice(DEFAULT_TTS_VOICE_LITERAL)).toBe('female')
  })

  it('normalizes unsupported legacy values to the canonical curated default without changing supported choices', () => {
    expect(normalizeCuratedTtsVoice()).toBe('en-US-Neural2-F')
    expect(normalizeCuratedTtsVoice('en-US-Neural2-C')).toBe('en-US-Neural2-F')
    expect(normalizeCuratedTtsVoice('en-US-Studio-O')).toBe('en-US-Studio-O')
  })

  it('filters voice options by gender', () => {
    const femaleOptions = getVoiceSelectOptions('en-US-Neural2-F')
    const maleOptions = getVoiceSelectOptions('en-US-Neural2-J')

    expect(femaleOptions.every((voice) => voice.gender === 'female')).toBe(true)
    expect(maleOptions.every((voice) => voice.gender === 'male')).toBe(true)
    expect(femaleOptions.some((voice) => voice.value === 'en-US-Neural2-F')).toBe(true)
    expect(maleOptions.some((voice) => voice.value === 'en-US-Neural2-J')).toBe(true)
    expect(femaleOptions.some((voice) => voice.label === 'British Friendly')).toBe(true)
    expect(maleOptions.some((voice) => voice.label === 'Warm & Conversational')).toBe(true)
    expect(maleOptions.some((voice) => voice.label === 'Confident Professional')).toBe(true)
    expect(maleOptions.some((voice) => voice.label === 'Polished Narrator')).toBe(true)
  })

  it('maps organizer-facing voice profiles and delivery styles to curated provider voices', () => {
    expect(TTS_VOICE_PROFILE_OPTIONS).toEqual([
      { value: 'female', label: 'Feminine voice' },
      { value: 'male', label: 'Masculine voice' },
    ])
    expect(getCuratedVoiceOptionsForGender('female').every((voice) => voice.gender === 'female')).toBe(true)
    expect(getCuratedVoiceOptionsForGender('male').every((voice) => voice.gender === 'male')).toBe(true)
    expect(getCuratedVoiceOptionsForGender('male').some((voice) => voice.label === 'Calm & Reassuring')).toBe(true)
  })
})
