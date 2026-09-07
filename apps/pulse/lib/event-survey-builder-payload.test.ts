import { describe, expect, it } from 'vitest'
import { buildEventVoiceSurveyCreatePayload } from './event-survey-builder-payload'

describe('buildEventVoiceSurveyCreatePayload', () => {
  it('preserves mixed type, required state, and canonical display order', () => {
    const payload = buildEventVoiceSurveyCreatePayload({
      selectedSurveyStructureItemId: 'area_123',
      targetCategory: 'EVENT',
      targetName: '',
      targetDescription: '',
      surveyName: '  Session pulse  ',
      surveyDescription: '',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      defaultTtsLocale: 'en-US',
      questions: [
        { text: 'Rate the session', type: 'RATING_1_TO_5', required: true },
        { text: 'What should improve?', type: 'VOICE', required: false },
        { text: 'Would you attend again?', type: 'RECOMMENDATION_0_TO_10' },
      ],
    })

    expect(payload.questions).toEqual([
      { prompt: 'Rate the session', type: 'RATING_1_TO_5', displayOrder: 0, required: true },
      { prompt: 'What should improve?', type: 'VOICE', displayOrder: 1, required: false },
      { prompt: 'Would you attend again?', type: 'RECOMMENDATION_0_TO_10', displayOrder: 2, required: true },
    ])
  })

  it('preserves a structured presenter rating target without relying on the prompt text', () => {
    const payload = buildEventVoiceSurveyCreatePayload({
      selectedSurveyStructureItemId: 'session_123', targetCategory: 'SESSION', targetName: 'Ignored', targetDescription: '',
      surveyName: 'Session feedback', surveyDescription: '', ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', defaultTtsLocale: 'en-US',
      questions: [{ text: 'How would you rate the individual presenters?', type: 'RATING_1_TO_5', responseTarget: 'SPEAKERS' }],
    })
    expect(payload.questions).toEqual([{ prompt: 'How would you rate the individual presenters?', type: 'RATING_1_TO_5', responseTarget: 'SPEAKERS', displayOrder: 0, required: true }])
  })

  it('keeps old question objects compatible by defaulting to VOICE and required', () => {
    const payload = buildEventVoiceSurveyCreatePayload({
      selectedSurveyStructureItemId: 'area_123', targetCategory: 'EVENT', targetName: '', targetDescription: '',
      surveyName: 'Legacy', surveyDescription: '', ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F',
      defaultTtsLocale: 'en-US', questions: [{ text: 'Tell us more' }],
    })
    expect(payload.questions[0]).toMatchObject({ type: 'VOICE', required: true })
  })
})
