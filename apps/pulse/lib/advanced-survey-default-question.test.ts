import { describe, expect, it } from 'vitest'
import {
  advancedSurveyQuestionTypeLabel,
  advancedSurveyQuestionTypeOptions,
  defaultAdvancedSurveyQuestion,
  entityAwareRatingQuestionType,
  readAdvancedSurveyContext,
  readAdvancedSpeakerFeedbackMode,
  resolveAdvancedQuestionMergeFields,
  withAdvancedSurveyContext,
  withAdvancedSpeakerFeedbackMode,
} from './advanced-survey-default-question'

describe('defaultAdvancedSurveyQuestion', () => {
  it.each([
    ['EVENT', 'Event rating', 'One 1–5 rating for the event.'],
    ['SESSIONS', 'Session rating', 'One 1–5 rating per session.'],
    ['SPEAKERS', 'Speaker rating', 'One 1–5 rating per speaker.'],
    ['EVENT_AREAS', 'Event area rating', 'One 1–5 rating per event area.'],
    ['CUSTOM', 'Custom rating', 'One 1–5 rating per custom touchpoint.'],
  ] as const)('uses one entity-aware rating type for %s', (context, label, hint) => {
    expect(entityAwareRatingQuestionType(context)).toEqual({ type: 'RATING_1_TO_5', label, hint, stores: 'Stores: 1–5 value' })
    expect(advancedSurveyQuestionTypeLabel(context, 'RATING_1_TO_5')).toBe(label)
  })

  it('keeps session speaker feedback distinct from the generic entity rating', () => {
    const sessionOptions = advancedSurveyQuestionTypeOptions('SESSIONS')
    const speakerOptions = advancedSurveyQuestionTypeOptions('SPEAKERS')

    expect(sessionOptions).toEqual(expect.arrayContaining([
      { type: 'RATING_1_TO_5', label: 'Session rating', hint: 'One 1–5 rating per session.', stores: 'Stores: 1–5 value' },
      { type: 'SPEAKER_FEEDBACK', label: 'Speaker feedback', hint: 'One 1–5 rating per session speaker.', stores: 'Stores: 1–5 value' },
    ]))
    expect(speakerOptions.find((option) => option.type === 'SPEAKER_FEEDBACK')).toBeUndefined()
  })

  it('creates strong editable event defaults', () => {
    expect(defaultAdvancedSurveyQuestion({ context: 'EVENT', type: 'RATING_1_TO_5', eventName: 'Summit 2026' }))
      .toBe('How would you rate your overall experience at Summit 2026?')
    expect(defaultAdvancedSurveyQuestion({ context: 'EVENT', type: 'OPEN_RESPONSE', eventName: 'Summit 2026' }))
      .toBe('What stood out most about your experience at Summit 2026?')
    expect(defaultAdvancedSurveyQuestion({ context: 'EVENT', type: 'YES_NO', eventName: 'Summit 2026' }))
      .toBe('Would you recommend Summit 2026 to a colleague?')
    expect(defaultAdvancedSurveyQuestion({ context: 'EVENT', type: 'RECOMMENDATION_0_TO_10', eventName: 'Summit 2026' }))
      .toBe('How likely are you to recommend Summit 2026?')
  })

  it('uses live entity merge fields for contextual defaults', () => {
    expect(defaultAdvancedSurveyQuestion({ context: 'SESSIONS', type: 'RATING_1_TO_5', eventName: 'Summit' }))
      .toBe('How would you rate {session_name}?')
    expect(defaultAdvancedSurveyQuestion({ context: 'SESSIONS', type: 'OPEN_RESPONSE', eventName: 'Summit' }))
      .toBe('What stood out most about {session_name}?')
    expect(defaultAdvancedSurveyQuestion({ context: 'SESSIONS', type: 'YES_NO', eventName: 'Summit' }))
      .toBe('Did {session_name} meet your expectations?')
    expect(defaultAdvancedSurveyQuestion({ context: 'SESSIONS', type: 'RECOMMENDATION_0_TO_10', eventName: 'Summit' }))
      .toBe('How likely are you to recommend {session_name}?')
    expect(defaultAdvancedSurveyQuestion({ context: 'SPEAKERS', type: 'RATING_1_TO_5', eventName: 'Summit' }))
      .toBe('How would you rate {speaker_name}?')
    expect(defaultAdvancedSurveyQuestion({ context: 'SPEAKERS', type: 'OPEN_RESPONSE', eventName: 'Summit' }))
      .toBe('What feedback would you give {speaker_name}?')
    expect(defaultAdvancedSurveyQuestion({ context: 'SPEAKERS', type: 'YES_NO', eventName: 'Summit' }))
      .toBe('Did {speaker_name} deliver valuable content?')
    expect(defaultAdvancedSurveyQuestion({ context: 'EVENT_AREAS', type: 'RATING_1_TO_5', eventName: 'Summit' }))
      .toBe('How would you rate your experience at {area_name}?')
  })

  it('provides sensible generic defaults when context is unknown or custom', () => {
    expect(defaultAdvancedSurveyQuestion({ context: 'NOT_SURE', type: 'OPEN_RESPONSE', eventName: 'Summit' }))
      .toBe('What stood out most about your experience?')
    expect(defaultAdvancedSurveyQuestion({ context: 'CUSTOM', type: 'YES_NO', eventName: 'Summit' }))
      .toBe('Would you recommend this experience to a colleague?')
  })

  it('round-trips context through settings without dropping existing settings', () => {
    const settings = withAdvancedSurveyContext({ anotherSetting: true }, 'SESSIONS')
    expect(settings).toEqual({ anotherSetting: true, advancedSurveyContext: 'SESSIONS' })
    expect(readAdvancedSurveyContext(settings)).toBe('SESSIONS')
    expect(readAdvancedSurveyContext({ anotherSetting: true }, 'EVENT')).toBe('EVENT')
  })

  it('defaults speaker feedback to each speaker and preserves the selected group mode', () => {
    expect(readAdvancedSpeakerFeedbackMode({})).toBe('EACH_SPEAKER')
    const settings = withAdvancedSpeakerFeedbackMode({ advancedSurveyContext: 'SESSIONS' }, 'SPEAKERS_AS_GROUP')
    expect(settings).toEqual({ advancedSurveyContext: 'SESSIONS', advancedSpeakerFeedbackMode: 'SPEAKERS_AS_GROUP' })
    expect(readAdvancedSpeakerFeedbackMode(settings)).toBe('SPEAKERS_AS_GROUP')
  })

  it('resolves attendee-facing fields from launch context', () => {
    expect(resolveAdvancedQuestionMergeFields(
      'How was {session_name} in {area_name}?',
      { sessionName: 'Opening Keynote', areaName: 'Main Stage' },
    )).toBe('How was Opening Keynote in Main Stage?')
  })
})
