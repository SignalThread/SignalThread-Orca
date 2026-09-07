import { describe, expect, it } from 'vitest'
import {
  advancedSurveyExperiencePresets,
  attendeeChoiceSummary,
  ADVANCED_SURVEY_EXPERIENCE_PRESET_SETTING,
  defaultNewEventSurveyExperience,
  hasAttendeeExperienceChoice,
  presentationModeForResponseMode,
  resolveAdvancedSurveyExperiencePreset,
  resolveFullSurveyPreviewStart,
  resolveOrganizerExperience,
  readAdvancedSurveyExperiencePreset,
  shouldShowAdvancedSurveyExperienceDetails,
  withAdvancedSurveyExperiencePreset,
} from './advanced-survey-experience'

describe('Advanced survey Experience settings', () => {
  it('maps the Voice-first and Text-first shortcuts to persisted settings', () => {
    expect(advancedSurveyExperiencePresets.VOICE_FIRST).toEqual({ presentationMode: 'READ_ALOUD', responseMode: 'VOICE_ONLY' })
    expect(advancedSurveyExperiencePresets.TEXT_FIRST).toEqual({ presentationMode: 'SCREEN', responseMode: 'TEXT_ONLY' })
  })

  it('uses Voice-first as the canonical new Event survey default and opens its preview at the first question', () => {
    expect(defaultNewEventSurveyExperience).toEqual({ presentationMode: 'READ_ALOUD', responseMode: 'VOICE_ONLY' })
    expect(resolveAdvancedSurveyExperiencePreset(defaultNewEventSurveyExperience)).toBe('VOICE_FIRST')
    expect(resolveFullSurveyPreviewStart(defaultNewEventSurveyExperience)).toBe('QUESTION')
  })

  it('derives runtime presentation from the canonical response mode', () => {
    expect(presentationModeForResponseMode('VOICE_ONLY')).toBe('READ_ALOUD')
    expect(presentationModeForResponseMode('TEXT_ONLY')).toBe('SCREEN')
    expect(presentationModeForResponseMode('VOICE_AND_TEXT')).toBe('ATTENDEE_CHOOSES')
  })

  it('keeps all non-preset settings visibly custom', () => {
    expect(resolveAdvancedSurveyExperiencePreset({ presentationMode: 'READ_ALOUD', responseMode: 'VOICE_AND_TEXT' })).toBe('CUSTOM')
    expect(resolveAdvancedSurveyExperiencePreset({ presentationMode: 'ATTENDEE_CHOOSES', responseMode: 'TEXT_ONLY' })).toBe('CUSTOM')
  })

  it('summarizes only the choices delegated to attendees', () => {
    expect(attendeeChoiceSummary({ presentationMode: 'READ_ALOUD', responseMode: 'VOICE_AND_TEXT' })).toContain('inside each question')
    expect(attendeeChoiceSummary({ presentationMode: 'ATTENDEE_CHOOSES', responseMode: 'VOICE_AND_TEXT' })).toContain('presentation before the survey')
    expect(hasAttendeeExperienceChoice({ presentationMode: 'SCREEN', responseMode: 'TEXT_ONLY' })).toBe(false)
    expect(hasAttendeeExperienceChoice({ presentationMode: 'SCREEN', responseMode: 'VOICE_AND_TEXT' })).toBe(false)
  })

  it('opens the full preview at the attendee start only when a choice is delegated', () => {
    expect(resolveFullSurveyPreviewStart({ presentationMode: 'READ_ALOUD', responseMode: 'VOICE_ONLY' })).toBe('QUESTION')
    expect(hasAttendeeExperienceChoice({ presentationMode: 'READ_ALOUD', responseMode: 'VOICE_ONLY' })).toBe(false)
    expect(resolveFullSurveyPreviewStart({ presentationMode: 'ATTENDEE_CHOOSES', responseMode: 'VOICE_ONLY' })).toBe('ATTENDEE_START')
  })

  it('lets Organizer retain configured non-delegated values while resolving delegated defaults', () => {
    expect(resolveOrganizerExperience({ presentationMode: 'SCREEN', responseMode: 'VOICE_AND_TEXT' })).toEqual({ presentationMode: 'SCREEN', responseMode: 'VOICE_AND_TEXT' })
    expect(resolveOrganizerExperience({ presentationMode: 'ATTENDEE_CHOOSES', responseMode: 'TEXT_ONLY' })).toEqual({ presentationMode: 'READ_ALOUD', responseMode: 'TEXT_ONLY' })
  })

  it('shows detailed controls only for Custom, regardless of repeated Organizer or Attendee selection', () => {
    for (const preset of ['VOICE_FIRST', 'TEXT_FIRST'] as const) {
      expect(shouldShowAdvancedSurveyExperienceDetails(preset)).toBe(false)
      expect(shouldShowAdvancedSurveyExperienceDetails(preset)).toBe(false)
    }
    expect(shouldShowAdvancedSurveyExperienceDetails('CUSTOM')).toBe(true)
  })

  it('retains each preset’s settings when delegation returns to Organizer', () => {
    expect(advancedSurveyExperiencePresets.VOICE_FIRST).toEqual({ presentationMode: 'READ_ALOUD', responseMode: 'VOICE_ONLY' })
    expect(advancedSurveyExperiencePresets.TEXT_FIRST).toEqual({ presentationMode: 'SCREEN', responseMode: 'TEXT_ONLY' })
  })

  it('persists the selected run mode separately from delegation and restores it on reload', () => {
    const settingsJson = withAdvancedSurveyExperiencePreset({ existingSetting: true }, 'TEXT_FIRST')

    expect(settingsJson).toEqual({ existingSetting: true, [ADVANCED_SURVEY_EXPERIENCE_PRESET_SETTING]: 'TEXT_FIRST' })
    expect(readAdvancedSurveyExperiencePreset(settingsJson, { presentationMode: 'ATTENDEE_CHOOSES', responseMode: 'VOICE_AND_TEXT' })).toBe('TEXT_FIRST')
  })
})
