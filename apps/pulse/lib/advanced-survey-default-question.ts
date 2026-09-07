import type { AdvancedQuestionType } from './advanced-temporary-ai-suggestions'

export type AdvancedSurveyContext = 'NOT_SURE' | 'EVENT' | 'SESSIONS' | 'SPEAKERS' | 'EVENT_AREAS' | 'CUSTOM'

export const ADVANCED_SURVEY_CONTEXT_SETTING = 'advancedSurveyContext'
export const ADVANCED_SPEAKER_FEEDBACK_MODE_SETTING = 'advancedSpeakerFeedbackMode'
export const SESSION_NAME_TOKEN = '{session_name}'
export const SPEAKER_NAME_TOKEN = '{speaker_name}'
export const EVENT_AREA_NAME_TOKEN = '{area_name}'

export type AdvancedQuestionTypePickerOption = {
  type: AdvancedQuestionType
  label: string
  hint: string
  stores: string
}

const CONTEXTS = new Set<AdvancedSurveyContext>([
  'NOT_SURE',
  'EVENT',
  'SESSIONS',
  'SPEAKERS',
  'EVENT_AREAS',
  'CUSTOM',
])

export function readAdvancedSurveyContext(
  settingsJson: unknown,
  fallback: AdvancedSurveyContext = 'NOT_SURE',
): AdvancedSurveyContext {
  if (!settingsJson || typeof settingsJson !== 'object' || Array.isArray(settingsJson)) return fallback
  const value = (settingsJson as Record<string, unknown>)[ADVANCED_SURVEY_CONTEXT_SETTING]
  return typeof value === 'string' && CONTEXTS.has(value as AdvancedSurveyContext)
    ? value as AdvancedSurveyContext
    : fallback
}

export function withAdvancedSurveyContext(settingsJson: unknown, context: AdvancedSurveyContext): Record<string, unknown> {
  const current = settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
    ? settingsJson as Record<string, unknown>
    : {}
  return { ...current, [ADVANCED_SURVEY_CONTEXT_SETTING]: context }
}

export type AdvancedSpeakerFeedbackMode = 'EACH_SPEAKER' | 'SPEAKERS_AS_GROUP'

export function readAdvancedSpeakerFeedbackMode(settingsJson: unknown): AdvancedSpeakerFeedbackMode {
  if (!settingsJson || typeof settingsJson !== 'object' || Array.isArray(settingsJson)) return 'EACH_SPEAKER'
  return (settingsJson as Record<string, unknown>)[ADVANCED_SPEAKER_FEEDBACK_MODE_SETTING] === 'SPEAKERS_AS_GROUP'
    ? 'SPEAKERS_AS_GROUP'
    : 'EACH_SPEAKER'
}

export function withAdvancedSpeakerFeedbackMode(
  settingsJson: unknown,
  mode: AdvancedSpeakerFeedbackMode,
): Record<string, unknown> {
  const current = settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
    ? settingsJson as Record<string, unknown>
    : {}
  return { ...current, [ADVANCED_SPEAKER_FEEDBACK_MODE_SETTING]: mode }
}

function genericDefault(type: AdvancedQuestionType): string {
  switch (type) {
    case 'RATING_1_TO_5': return 'How would you rate your overall experience?'
    case 'OPEN_RESPONSE': return 'What stood out most about your experience?'
    case 'YES_NO': return 'Would you recommend this experience to a colleague?'
    case 'RECOMMENDATION_0_TO_10': return 'How likely are you to recommend this experience?'
    case 'SINGLE_CHOICE': return 'Which part of the experience mattered most to you?'
    case 'SPEAKER_FEEDBACK': return `How would you rate ${SPEAKER_NAME_TOKEN}?`
  }
}

/**
 * A single stored 1–5 rating type whose organizer-facing language follows the
 * survey context. The context changes copy only; analytics and attendee
 * controls always receive the same canonical structured rating type.
 */
export function entityAwareRatingQuestionType(context: AdvancedSurveyContext): AdvancedQuestionTypePickerOption {
  switch (context) {
    case 'EVENT': return { type: 'RATING_1_TO_5', label: 'Event rating', hint: 'One 1–5 rating for the event.', stores: 'Stores: 1–5 value' }
    case 'SESSIONS': return { type: 'RATING_1_TO_5', label: 'Session rating', hint: 'One 1–5 rating per session.', stores: 'Stores: 1–5 value' }
    case 'SPEAKERS': return { type: 'RATING_1_TO_5', label: 'Speaker rating', hint: 'One 1–5 rating per speaker.', stores: 'Stores: 1–5 value' }
    case 'EVENT_AREAS': return { type: 'RATING_1_TO_5', label: 'Event area rating', hint: 'One 1–5 rating per event area.', stores: 'Stores: 1–5 value' }
    case 'CUSTOM': return { type: 'RATING_1_TO_5', label: 'Custom rating', hint: 'One 1–5 rating per custom touchpoint.', stores: 'Stores: 1–5 value' }
    case 'NOT_SURE': return { type: 'RATING_1_TO_5', label: '1–5 rating', hint: 'A fixed five-point scale.', stores: 'Stores: 1–5 value' }
  }
}

/**
 * The canonical question picker catalog. Session speaker feedback remains a
 * separate live-roster question, while every entity rating uses RATING_1_TO_5.
 */
export function advancedSurveyQuestionTypeOptions(context: AdvancedSurveyContext): AdvancedQuestionTypePickerOption[] {
  return [
    entityAwareRatingQuestionType(context),
    ...(context === 'SESSIONS'
      ? [{ type: 'SPEAKER_FEEDBACK' as const, label: 'Speaker feedback', hint: 'One 1–5 rating per session speaker.', stores: 'Stores: 1–5 value' }]
      : []),
    { type: 'OPEN_RESPONSE', label: 'Open response', hint: 'Attendee answers in their own words.', stores: 'Stores: text' },
    { type: 'RECOMMENDATION_0_TO_10', label: '0–10 recommendation', hint: 'An eleven-point recommendation scale.', stores: 'Stores: 0–10 score' },
    { type: 'YES_NO', label: 'Yes / No', hint: 'A clean binary choice.', stores: 'Stores: Yes / No' },
    { type: 'SINGLE_CHOICE', label: 'Single choice', hint: 'Attendee selects one supplied option.', stores: 'Stores: one option' },
  ]
}

export function advancedSurveyQuestionTypeLabel(context: AdvancedSurveyContext, type: AdvancedQuestionType) {
  return advancedSurveyQuestionTypeOptions(context).find((option) => option.type === type)?.label
    ?? (type === 'SPEAKER_FEEDBACK' ? 'Speaker feedback' : type)
}

/**
 * The one canonical source for normal, editable question text created by the
 * Advanced Event builder. Context tokens remain live until attendee delivery.
 */
export function defaultAdvancedSurveyQuestion(input: {
  context: AdvancedSurveyContext
  type: AdvancedQuestionType
  eventName: string
}): string {
  const eventName = input.eventName.trim() || 'this event'
  const { context, type } = input

  if (type === 'SPEAKER_FEEDBACK') return `How would you rate ${SPEAKER_NAME_TOKEN}?`

  if (context === 'EVENT') {
    switch (type) {
      case 'RATING_1_TO_5': return `How would you rate your overall experience at ${eventName}?`
      case 'OPEN_RESPONSE': return `What stood out most about your experience at ${eventName}?`
      case 'YES_NO': return `Would you recommend ${eventName} to a colleague?`
      case 'RECOMMENDATION_0_TO_10': return `How likely are you to recommend ${eventName}?`
      case 'SINGLE_CHOICE': return `Which part of ${eventName} mattered most to you?`
    }
  }

  if (context === 'SESSIONS') {
    switch (type) {
      case 'RATING_1_TO_5': return `How would you rate ${SESSION_NAME_TOKEN}?`
      case 'OPEN_RESPONSE': return `What stood out most about ${SESSION_NAME_TOKEN}?`
      case 'YES_NO': return `Did ${SESSION_NAME_TOKEN} meet your expectations?`
      case 'RECOMMENDATION_0_TO_10': return `How likely are you to recommend ${SESSION_NAME_TOKEN}?`
      case 'SINGLE_CHOICE': return `Which part of ${SESSION_NAME_TOKEN} was most valuable?`
    }
  }

  if (context === 'SPEAKERS') {
    switch (type) {
      case 'RATING_1_TO_5': return `How would you rate ${SPEAKER_NAME_TOKEN}?`
      case 'OPEN_RESPONSE': return `What feedback would you give ${SPEAKER_NAME_TOKEN}?`
      case 'YES_NO': return `Did ${SPEAKER_NAME_TOKEN} deliver valuable content?`
      case 'RECOMMENDATION_0_TO_10': return `How likely are you to recommend a session led by ${SPEAKER_NAME_TOKEN}?`
      case 'SINGLE_CHOICE': return `What was ${SPEAKER_NAME_TOKEN}'s greatest strength?`
    }
  }

  if (context === 'EVENT_AREAS') {
    switch (type) {
      case 'RATING_1_TO_5': return `How would you rate your experience at ${EVENT_AREA_NAME_TOKEN}?`
      case 'OPEN_RESPONSE': return `What stood out most about ${EVENT_AREA_NAME_TOKEN}?`
      case 'YES_NO': return `Did ${EVENT_AREA_NAME_TOKEN} meet your expectations?`
      case 'RECOMMENDATION_0_TO_10': return `How likely are you to recommend ${EVENT_AREA_NAME_TOKEN}?`
      case 'SINGLE_CHOICE': return `What mattered most about your experience at ${EVENT_AREA_NAME_TOKEN}?`
    }
  }

  return genericDefault(type)
}

export function inferAdvancedSurveyContextFromTargets(
  targets: Array<{ category?: string }> | null | undefined,
  fallback: AdvancedSurveyContext = 'NOT_SURE',
): AdvancedSurveyContext {
  const categories = new Set((targets ?? []).map((target) => target.category))
  if (categories.has('SESSION')) return 'SESSIONS'
  if (categories.has('SPEAKER')) return 'SPEAKERS'
  if (categories.has('LOCATION')) return 'EVENT_AREAS'
  if (categories.has('EVENT')) return 'EVENT'
  if (categories.has('CUSTOM')) return 'CUSTOM'
  return fallback
}

export function resolveAdvancedQuestionMergeFields(
  text: string,
  context: {
    eventName?: string | null
    sessionName?: string | null
    speakerName?: string | null
    areaName?: string | null
  },
): string {
  return text
    .replaceAll('{event_name}', context.eventName?.trim() || 'this event')
    .replaceAll(SESSION_NAME_TOKEN, context.sessionName?.trim() || 'this session')
    .replaceAll(SPEAKER_NAME_TOKEN, context.speakerName?.trim() || 'this speaker')
    .replaceAll(EVENT_AREA_NAME_TOKEN, context.areaName?.trim() || 'this event area')
}
