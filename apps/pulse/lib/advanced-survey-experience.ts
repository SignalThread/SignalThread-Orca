export type AdvancedSurveyPresentationMode = 'SCREEN' | 'READ_ALOUD' | 'ATTENDEE_CHOOSES'
export type AdvancedSurveyResponseMode = 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
export type AdvancedSurveyExperiencePreset = 'VOICE_FIRST' | 'TEXT_FIRST' | 'CUSTOM'

export type AdvancedSurveyExperienceSettings = {
  presentationMode: AdvancedSurveyPresentationMode
  responseMode: AdvancedSurveyResponseMode
}

export const advancedSurveyExperiencePresets: Record<Exclude<AdvancedSurveyExperiencePreset, 'CUSTOM'>, AdvancedSurveyExperienceSettings> = {
  VOICE_FIRST: { presentationMode: 'READ_ALOUD', responseMode: 'VOICE_ONLY' },
  TEXT_FIRST: { presentationMode: 'SCREEN', responseMode: 'TEXT_ONLY' },
}

/** Canonical experience persisted for every brand-new Event survey. */
export const defaultNewEventSurveyExperience = {
  presentationMode: 'READ_ALOUD',
  responseMode: 'VOICE_ONLY',
} as const satisfies AdvancedSurveyExperienceSettings

/**
 * Response mode is the organizer-facing experience choice. Presentation is a
 * persisted runtime detail derived from it so previews and kiosks cannot drift
 * into a conflicting configuration.
 */
export function presentationModeForResponseMode(responseMode: AdvancedSurveyResponseMode): AdvancedSurveyPresentationMode {
  if (responseMode === 'TEXT_ONLY') return 'SCREEN'
  if (responseMode === 'VOICE_AND_TEXT') return 'ATTENDEE_CHOOSES'
  return 'READ_ALOUD'
}

export const ADVANCED_SURVEY_EXPERIENCE_PRESET_SETTING = 'advancedSurveyExperiencePreset'

function isExperiencePreset(value: unknown): value is AdvancedSurveyExperiencePreset {
  return value === 'VOICE_FIRST' || value === 'TEXT_FIRST' || value === 'CUSTOM'
}

/** Keeps the organizer's selected run mode independent from attendee delegation settings. */
export function readAdvancedSurveyExperiencePreset(
  settingsJson: unknown,
  settings: AdvancedSurveyExperienceSettings,
): AdvancedSurveyExperiencePreset {
  const savedPreset = settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
    ? (settingsJson as Record<string, unknown>)[ADVANCED_SURVEY_EXPERIENCE_PRESET_SETTING]
    : null
  return isExperiencePreset(savedPreset) ? savedPreset : resolveAdvancedSurveyExperiencePreset(settings)
}

export function withAdvancedSurveyExperiencePreset(
  settingsJson: unknown,
  preset: AdvancedSurveyExperiencePreset,
): Record<string, unknown> {
  const existing = settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
    ? settingsJson as Record<string, unknown>
    : {}
  return { ...existing, [ADVANCED_SURVEY_EXPERIENCE_PRESET_SETTING]: preset }
}

/** Detailed controls belong exclusively to Custom mode, never to delegation. */
export function shouldShowAdvancedSurveyExperienceDetails(preset: AdvancedSurveyExperiencePreset): boolean {
  return preset === 'CUSTOM'
}

export function resolveAdvancedSurveyExperiencePreset(settings: AdvancedSurveyExperienceSettings): AdvancedSurveyExperiencePreset {
  if (settings.presentationMode === 'READ_ALOUD' && settings.responseMode === 'VOICE_ONLY') return 'VOICE_FIRST'
  if (settings.presentationMode === 'SCREEN' && settings.responseMode === 'TEXT_ONLY') return 'TEXT_FIRST'
  return 'CUSTOM'
}

export function attendeeChoiceSummary(settings: AdvancedSurveyExperienceSettings) {
  const attendeeChoosesPresentation = settings.presentationMode === 'ATTENDEE_CHOOSES'
  const attendeeChoosesResponse = settings.responseMode === 'VOICE_AND_TEXT'

  if (attendeeChoosesPresentation && attendeeChoosesResponse) {
    return 'Attendees choose question presentation before the survey, then can switch between voice and text or tap inside each question.'
  }
  if (attendeeChoosesPresentation) {
    return 'Attendees choose whether questions are read aloud or read on screen before the survey begins.'
  }
  if (attendeeChoosesResponse) {
    return 'Attendees can switch between voice and text or tap inside each question.'
  }
  return 'The organizer sets how questions are presented and how open responses are collected.'
}

export function hasAttendeeExperienceChoice(settings: AdvancedSurveyExperienceSettings) {
  return settings.presentationMode === 'ATTENDEE_CHOOSES'
}

export function resolveOrganizerExperience(settings: AdvancedSurveyExperienceSettings): AdvancedSurveyExperienceSettings {
  return {
    presentationMode: settings.presentationMode === 'ATTENDEE_CHOOSES' ? 'READ_ALOUD' : settings.presentationMode,
    responseMode: settings.responseMode,
  }
}

export function resolveFullSurveyPreviewStart(settings: AdvancedSurveyExperienceSettings) {
  return hasAttendeeExperienceChoice(settings) ? 'ATTENDEE_START' as const : 'QUESTION' as const
}
