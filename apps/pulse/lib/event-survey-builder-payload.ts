import { deriveLocaleFromVoice } from './tts-voices'
import type { SupportedQuestionType } from './mixed-survey-contract'

export type EventSurveyBuilderTargetCategory = 'EVENT' | 'SESSION' | 'LOCATION' | 'CUSTOM' | 'SPEAKER'

export interface EventSurveyBuilderQuestionInput {
  text: string
  type?: SupportedQuestionType
  required?: boolean
  responseTarget?: 'GENERAL' | 'SESSION' | 'SPEAKERS'
}

export interface BuildEventVoiceSurveyCreatePayloadInput {
  selectedSurveyStructureItemId: string
  targetCategory: EventSurveyBuilderTargetCategory
  targetName: string
  targetDescription: string
  surveyName: string
  surveyDescription: string
  ttsProvider: string
  ttsVoice: string
  defaultTtsLocale: string
  responseMode?: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  questions: EventSurveyBuilderQuestionInput[]
}

export function buildEventVoiceSurveyCreatePayload(input: BuildEventVoiceSurveyCreatePayloadInput) {
  const hasStructureItem = input.selectedSurveyStructureItemId.trim().length > 0

  return {
    eventStructureItemId: hasStructureItem ? input.selectedSurveyStructureItemId : undefined,
    targetCategory: hasStructureItem ? undefined : input.targetCategory,
    targetName: hasStructureItem ? undefined : input.targetName.trim(),
    targetDescription: hasStructureItem ? undefined : input.targetDescription.trim() || null,
    surveyName: input.surveyName.trim(),
    surveyDescription: input.surveyDescription.trim() || null,
    ttsProvider: input.ttsProvider,
    ttsVoice: input.ttsVoice,
    ttsLocale: deriveLocaleFromVoice(input.ttsVoice, input.defaultTtsLocale),
    responseMode: input.responseMode ?? 'VOICE_ONLY',
    questions: input.questions
      .map((question, index) => ({
        prompt: question.text.trim(),
        type: question.type ?? 'VOICE',
        ...(question.responseTarget && question.responseTarget !== 'GENERAL'
          ? { responseTarget: question.responseTarget }
          : {}),
        displayOrder: index,
        required: question.required ?? true,
      }))
      .filter((question) => question.prompt.length > 0),
  }
}
