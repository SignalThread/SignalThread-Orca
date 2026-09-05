export const DEFAULT_TTS_PROVIDER = 'google'
export const DEFAULT_TTS_VOICE_LITERAL = 'en-US-Neural2-F'
export const DEFAULT_TTS_LOCALE_LITERAL = 'en-US'
export const DEFAULT_TTS_GENDER = 'female' as const

export const QUESTION_AUDIO_PREVIEW_TEXT =
  "Thanks for being here. We'd love to hear about your experience."

export type CuratedTtsVoiceOption = {
  /** Customer-facing name shown in the Events voice picker. */
  name: string
  /** Customer-facing personality detail; provider identifiers remain internal. */
  description: string
  label: string
  value: string
  locale: string
  provider: 'google'
  gender: TtsVoiceGender
}

export type TtsVoiceGender = 'female' | 'male'

export const TTS_GENDER_OPTIONS: Array<{ value: TtsVoiceGender; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
]

/**
 * Organizer-facing names for the two curated voice families.  The provider
 * still receives the resolved Google voice id, never either display label.
 */
export const TTS_VOICE_PROFILE_OPTIONS: Array<{ value: TtsVoiceGender; label: string }> = [
  { value: 'female', label: 'Feminine voice' },
  { value: 'male', label: 'Masculine voice' },
]

export const CURATED_TTS_VOICE_OPTIONS: CuratedTtsVoiceOption[] = [
  { name: 'Ava', description: 'Friendly and welcoming', label: 'Friendly & Welcoming', value: 'en-US-Neural2-F', locale: 'en-US', provider: 'google', gender: 'female' },
  { name: 'Maya', description: 'Warm and conversational', label: 'Warm & Conversational', value: 'en-US-Neural2-H', locale: 'en-US', provider: 'google', gender: 'female' },
  { name: 'Iris', description: 'Polished narrator', label: 'Polished Narrator', value: 'en-US-Studio-O', locale: 'en-US', provider: 'google', gender: 'female' },
  { name: 'Grace', description: 'British and friendly', label: 'British Friendly', value: 'en-GB-Studio-C', locale: 'en-GB', provider: 'google', gender: 'female' },
  { name: 'Harper', description: 'Australian and friendly', label: 'Australian Friendly', value: 'en-AU-Neural2-A', locale: 'en-AU', provider: 'google', gender: 'female' },
  { name: 'Leo', description: 'Friendly and welcoming', label: 'Friendly & Welcoming', value: 'en-US-Neural2-J', locale: 'en-US', provider: 'google', gender: 'male' },
  { name: 'Theo', description: 'Warm and conversational', label: 'Warm & Conversational', value: 'en-US-Wavenet-B', locale: 'en-US', provider: 'google', gender: 'male' },
  { name: 'Miles', description: 'Calm and reassuring', label: 'Calm & Reassuring', value: 'en-US-Neural2-I', locale: 'en-US', provider: 'google', gender: 'male' },
  { name: 'Owen', description: 'Confident and professional', label: 'Confident Professional', value: 'en-US-Neural2-D', locale: 'en-US', provider: 'google', gender: 'male' },
  { name: 'Henry', description: 'Polished narrator', label: 'Polished Narrator', value: 'en-US-Studio-Q', locale: 'en-US', provider: 'google', gender: 'male' },
  { name: 'Arthur', description: 'British and friendly', label: 'British Friendly', value: 'en-GB-Wavenet-O', locale: 'en-GB', provider: 'google', gender: 'male' },
  { name: 'Noah', description: 'Australian and friendly', label: 'Australian Friendly', value: 'en-AU-Wavenet-B', locale: 'en-AU', provider: 'google', gender: 'male' },
]
export const TTS_LOCALE_LABELS: Record<string, string> = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'en-AU': 'English (Australia)',
}

export function getCuratedVoiceOption(voice: string) {
  return CURATED_TTS_VOICE_OPTIONS.find((option) => option.value === voice)
}

/**
 * Resolves an Events builder value to a currently supported curated voice.
 * This is deliberately a state-boundary helper: callers can display the
 * canonical value without writing anything back to an existing survey until
 * its normal save flow runs.
 */
export function normalizeCuratedTtsVoice(voice?: string | null) {
  const normalized = voice?.trim()
  return normalized && getCuratedVoiceOption(normalized)
    ? normalized
    : DEFAULT_TTS_VOICE_LITERAL
}

export function deriveGenderFromVoice(voice?: string | null, fallbackGender: TtsVoiceGender = DEFAULT_TTS_GENDER) {
  const option = voice ? getCuratedVoiceOption(voice) : undefined
  return option?.gender || fallbackGender
}

export function getCuratedVoiceOptionsForLocale(locale: string) {
  return CURATED_TTS_VOICE_OPTIONS.filter((option) => option.locale === locale)
}

export function getCuratedVoiceOptionsForGender(gender: TtsVoiceGender) {
  return CURATED_TTS_VOICE_OPTIONS.filter((option) => option.gender === gender)
}

export function getPreferredVoiceForLocale(locale: string) {
  return getCuratedVoiceOptionsForLocale(locale)[0]?.value || DEFAULT_TTS_VOICE_LITERAL
}

export function getPreferredVoiceForGender(gender: TtsVoiceGender) {
  return CURATED_TTS_VOICE_OPTIONS.find((option) => option.gender === gender)?.value || DEFAULT_TTS_VOICE_LITERAL
}

export function deriveLocaleFromVoice(voice?: string | null, fallbackLocale = DEFAULT_TTS_LOCALE_LITERAL) {
  const trimmed = voice?.trim()
  if (!trimmed) return fallbackLocale
  if (trimmed.startsWith('en-US-')) return 'en-US'
  if (trimmed.startsWith('en-GB-')) return 'en-GB'
  if (trimmed.startsWith('en-AU-')) return 'en-AU'
  return fallbackLocale
}

export function getLocaleLabel(locale: string) {
  return TTS_LOCALE_LABELS[locale] || locale
}

export function getVoiceSelectOptions(selectedVoice?: string) {
  const gender = deriveGenderFromVoice(selectedVoice)
  const filteredOptions = getCuratedVoiceOptionsForGender(gender)

  if (!selectedVoice || filteredOptions.some((option) => option.value === selectedVoice)) {
    return filteredOptions
  }

  return [
    {
      name: 'Current Pulse voice',
      description: 'Selected for this event',
      label: `Current (Legacy): ${selectedVoice}`,
      value: selectedVoice,
      locale: deriveLocaleFromVoice(selectedVoice),
      provider: 'google' as const,
      gender,
    },
    ...filteredOptions,
  ]
}
