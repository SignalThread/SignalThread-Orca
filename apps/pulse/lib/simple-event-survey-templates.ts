import { QuestionType } from '@prisma/client'

export const SIMPLE_EVENT_SURVEY_TEMPLATE_IDS = [
  'event-feedback',
  'attendee-experience',
  'sponsor-exhibitor-feedback',
  'post-event-wrap-up',
] as const

export type SimpleEventSurveyTemplateId = typeof SIMPLE_EVENT_SURVEY_TEMPLATE_IDS[number]

export type SimpleEventSurveyTemplateQuestion = {
  id: string
  text: string
  type: 'RATING_1_TO_5' | 'OPEN_RESPONSE'
  required: boolean
}

export type SimpleEventSurveyTemplate = {
  id: SimpleEventSurveyTemplateId
  label: string
  description: string
  recommended?: boolean
  questions: SimpleEventSurveyTemplateQuestion[]
}

function questions(templateId: SimpleEventSurveyTemplateId, entries: Array<['RATING_1_TO_5' | 'OPEN_RESPONSE', string]>): SimpleEventSurveyTemplateQuestion[] {
  return entries.map(([type, text], index) => ({
    id: `${templateId}-${index + 1}`,
    type,
    text,
    required: true,
  }))
}

/** Canonical, stable starting points for ordinary Simple Event surveys. */
export const SIMPLE_EVENT_SURVEY_TEMPLATES: readonly SimpleEventSurveyTemplate[] = [
  {
    id: 'event-feedback',
    label: 'Event Feedback',
    description: 'Capture overall feedback from across the event.',
    recommended: true,
    questions: questions('event-feedback', [
      [QuestionType.RATING_1_TO_5, 'Overall, how would you rate your experience at this event?'],
      [QuestionType.OPEN_RESPONSE, 'What was the most valuable part of the event?'],
      [QuestionType.OPEN_RESPONSE, 'What could we improve?'],
      [QuestionType.RATING_1_TO_5, 'How would you rate the venue and event logistics?'],
      [QuestionType.OPEN_RESPONSE, 'Is there anything else you’d like us to know?'],
    ]),
  },
  {
    id: 'attendee-experience',
    label: 'Attendee Experience',
    description: 'Learn what attendees experienced across the event journey.',
    questions: questions('attendee-experience', [
      [QuestionType.RATING_1_TO_5, 'How would you rate your arrival and check-in experience?'],
      [QuestionType.RATING_1_TO_5, 'How would you rate the venue and onsite experience?'],
      [QuestionType.RATING_1_TO_5, 'How valuable were the networking and connection opportunities?'],
      [QuestionType.OPEN_RESPONSE, 'What worked especially well for you?'],
      [QuestionType.OPEN_RESPONSE, 'What created friction or could have been better?'],
    ]),
  },
  {
    id: 'sponsor-exhibitor-feedback',
    label: 'Sponsor & Exhibitor Feedback',
    description: 'Understand the experience of your event partners.',
    questions: questions('sponsor-exhibitor-feedback', [
      [QuestionType.RATING_1_TO_5, 'Overall, how would you rate your experience as a sponsor or exhibitor?'],
      [QuestionType.RATING_1_TO_5, 'How would you rate attendee engagement?'],
      [QuestionType.RATING_1_TO_5, 'How well did the event deliver the audience and opportunities you expected?'],
      [QuestionType.OPEN_RESPONSE, 'What worked best for you?'],
      [QuestionType.OPEN_RESPONSE, 'What would make the experience more valuable next time?'],
    ]),
  },
  {
    id: 'post-event-wrap-up',
    label: 'Post-Event Wrap-Up',
    description: 'Collect a final perspective after the event is complete.',
    questions: questions('post-event-wrap-up', [
      [QuestionType.RATING_1_TO_5, 'Overall, how would you rate the event?'],
      [QuestionType.RATING_1_TO_5, 'How well did the event meet your expectations?'],
      [QuestionType.OPEN_RESPONSE, 'What was the most valuable part?'],
      [QuestionType.OPEN_RESPONSE, 'What should we change or improve next time?'],
      [QuestionType.OPEN_RESPONSE, 'What would you like to see at a future event?'],
      [QuestionType.OPEN_RESPONSE, 'Anything else you’d like to share?'],
    ]),
  },
]

export function getSimpleEventSurveyTemplate(value: string | null | undefined): SimpleEventSurveyTemplate | null {
  return SIMPLE_EVENT_SURVEY_TEMPLATES.find((template) => template.id === value) ?? null
}
