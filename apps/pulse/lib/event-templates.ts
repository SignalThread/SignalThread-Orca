/**
 * Event starting-point templates (PURE data + helpers).
 *
 * This module must stay free of Prisma / `@prisma/client` imports so it can be
 * safely consumed by the client Create Event UI as well as server code. The
 * actual structure seeding lives in `lib/event-template-seed.ts` (server-only).
 *
 * Templates describe real Event structure and optional draft Survey
 * recommendations. Recommendations are authoring starting points only: they do
 * not imply responses, analytics, sponsor value, or fabricated activity data.
 * Seeded structure and recommended Surveys are fully editable after creation.
 */

// Mirror of EventStructureItemKind values, kept as a string union so this stays
// client-safe (no @prisma/client import).
export type EventStructureKind =
  | 'EVENT'
  | 'SESSION'
  | 'AREA'
  | 'SPONSOR_ACTIVATION'
  | 'CUSTOM_TOUCHPOINT'

export interface EventTemplateStructureItem {
  kind: EventStructureKind
  name: string
}

export type EventTemplateQuestionType =
  | 'VOICE'
  | 'RATING_1_TO_5'
  | 'RECOMMENDATION_0_TO_10'

export interface EventTemplateSurveyQuestion {
  prompt: string
  type: EventTemplateQuestionType
  required: boolean
}

export interface EventTemplateSurveyRecommendation {
  /** Stable provenance key used to make retries safely skippable. */
  key: string
  name: string
  description: string
  /** Existing seeded Event Area to attach to, when applicable. */
  eventStructureItem?: EventTemplateStructureItem
  /** Canonical target created with the Survey for event-wide recommendations. */
  target: {
    category: 'EVENT' | 'SESSION' | 'LOCATION' | 'CUSTOM'
    name: string
  }
  questions: EventTemplateSurveyQuestion[]
}

export interface EventTemplate {
  key: string
  label: string
  description: string
  /** Ordered starter structure items this template seeds. Empty for "blank". */
  items: EventTemplateStructureItem[]
  /** Optional draft mixed-question Surveys an organizer may select at launch. */
  recommendedSurveys: EventTemplateSurveyRecommendation[]
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    key: 'conference',
    label: 'Conference',
    description: 'Multi-track conference with keynotes, sessions, and an expo floor.',
    items: [
      { kind: 'EVENT', name: 'Registration' },
      { kind: 'SESSION', name: 'Keynotes' },
      { kind: 'SESSION', name: 'Sessions' },
      { kind: 'AREA', name: 'Expo Floor' },
      { kind: 'AREA', name: 'Networking' },
    ],
    recommendedSurveys: [
      {
        key: 'overall-event-experience',
        name: 'Overall Event Experience',
        description: 'Measure overall event quality and capture the reasons behind the score.',
        target: { category: 'EVENT', name: 'Overall Event Experience' },
        questions: [
          { prompt: 'How would you rate your overall event experience?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What most influenced your rating?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'keynote-feedback',
        name: 'Keynote Feedback',
        description: 'Understand keynote relevance and capture attendee takeaways.',
        eventStructureItem: { kind: 'SESSION', name: 'Keynotes' },
        target: { category: 'SESSION', name: 'Keynotes' },
        questions: [
          { prompt: 'How valuable was the keynote?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What was your most useful takeaway?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'session-feedback',
        name: 'Session Feedback',
        description: 'Measure session quality and identify improvements while the event is live.',
        eventStructureItem: { kind: 'SESSION', name: 'Sessions' },
        target: { category: 'SESSION', name: 'Sessions' },
        questions: [
          { prompt: 'How would you rate this session?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What should we improve for the next session?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'registration-arrival',
        name: 'Registration & Arrival',
        description: 'Spot arrival friction before it affects the attendee experience.',
        eventStructureItem: { kind: 'EVENT', name: 'Registration' },
        target: { category: 'EVENT', name: 'Registration' },
        questions: [
          { prompt: 'How smooth was your arrival and registration experience?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What could make arrival easier?', type: 'VOICE', required: false },
        ],
      },
    ],
  },
  {
    key: 'expo',
    label: 'Expo / Trade Show',
    description: 'Exhibitor-driven show floor with booths and sponsor activations.',
    items: [
      { kind: 'AREA', name: 'Expo Floor' },
      { kind: 'AREA', name: 'Exhibitor Booths' },
      { kind: 'SPONSOR_ACTIVATION', name: 'Sponsor Activations' },
      { kind: 'EVENT', name: 'Registration' },
    ],
    recommendedSurveys: [
      {
        key: 'overall-event-experience',
        name: 'Overall Event Experience',
        description: 'Measure overall show quality and capture the reasons behind the score.',
        target: { category: 'EVENT', name: 'Overall Event Experience' },
        questions: [
          { prompt: 'How would you rate your overall event experience?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What most influenced your rating?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'expo-floor-feedback',
        name: 'Expo Floor Feedback',
        description: 'Understand floor experience, navigation, and exhibitor discovery.',
        eventStructureItem: { kind: 'AREA', name: 'Expo Floor' },
        target: { category: 'LOCATION', name: 'Expo Floor' },
        questions: [
          { prompt: 'How would you rate the expo floor experience?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What would improve your time on the show floor?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'exhibitor-feedback',
        name: 'Exhibitor Booth Feedback',
        description: 'Measure booth value and capture attendee context.',
        eventStructureItem: { kind: 'AREA', name: 'Exhibitor Booths' },
        target: { category: 'LOCATION', name: 'Exhibitor Booths' },
        questions: [
          { prompt: 'How valuable were the exhibitor conversations?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'Which booth experience stood out, and why?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'sponsor-activation-feedback',
        name: 'Sponsor Activation Feedback',
        description: 'Measure activation impact without inventing sponsor outcomes.',
        eventStructureItem: { kind: 'SPONSOR_ACTIVATION', name: 'Sponsor Activations' },
        target: { category: 'CUSTOM', name: 'Sponsor Activations' },
        questions: [
          { prompt: 'How likely are you to recommend this activation?', type: 'RECOMMENDATION_0_TO_10', required: true },
          { prompt: 'What made the activation memorable or forgettable?', type: 'VOICE', required: false },
        ],
      },
    ],
  },
  {
    key: 'workshop',
    label: 'Workshop',
    description: 'Hands-on workshop with breakout rooms and an overall experience point.',
    items: [
      { kind: 'SESSION', name: 'Sessions' },
      { kind: 'AREA', name: 'Breakout Rooms' },
      { kind: 'EVENT', name: 'Overall Experience' },
    ],
    recommendedSurveys: [
      {
        key: 'overall-workshop-experience',
        name: 'Overall Workshop Experience',
        description: 'Measure the workshop as a whole and capture practical improvements.',
        eventStructureItem: { kind: 'EVENT', name: 'Overall Experience' },
        target: { category: 'EVENT', name: 'Overall Experience' },
        questions: [
          { prompt: 'How would you rate the workshop overall?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What would make this workshop more useful?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'session-facilitator-feedback',
        name: 'Session & Facilitator Feedback',
        description: 'Measure session clarity and facilitator effectiveness.',
        eventStructureItem: { kind: 'SESSION', name: 'Sessions' },
        target: { category: 'SESSION', name: 'Sessions' },
        questions: [
          { prompt: 'How effective was the facilitator?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What helped or limited your learning?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'breakout-room-feedback',
        name: 'Breakout Room Feedback',
        description: 'Capture small-group usefulness and operational friction.',
        eventStructureItem: { kind: 'AREA', name: 'Breakout Rooms' },
        target: { category: 'LOCATION', name: 'Breakout Rooms' },
        questions: [
          { prompt: 'How useful was your breakout session?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What should change about the breakout experience?', type: 'VOICE', required: false },
        ],
      },
    ],
  },
  {
    key: 'brand-activation',
    label: 'Brand Activation',
    description: 'Experiential brand event with sponsor zones and custom touchpoints.',
    items: [
      { kind: 'SPONSOR_ACTIVATION', name: 'Sponsor Zones' },
      { kind: 'AREA', name: 'Brand Experiences' },
      { kind: 'CUSTOM_TOUCHPOINT', name: 'Custom Touchpoints' },
    ],
    recommendedSurveys: [
      {
        key: 'overall-activation-experience',
        name: 'Overall Activation Experience',
        description: 'Measure the activation experience and understand what drove it.',
        eventStructureItem: { kind: 'AREA', name: 'Brand Experiences' },
        target: { category: 'LOCATION', name: 'Brand Experiences' },
        questions: [
          { prompt: 'How would you rate the overall brand experience?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What part of the experience stayed with you?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'touchpoint-feedback',
        name: 'Touchpoint Feedback',
        description: 'Measure individual experience touchpoints and capture context.',
        eventStructureItem: { kind: 'CUSTOM_TOUCHPOINT', name: 'Custom Touchpoints' },
        target: { category: 'CUSTOM', name: 'Custom Touchpoints' },
        questions: [
          { prompt: 'How would you rate this experience?', type: 'RATING_1_TO_5', required: true },
          { prompt: 'What would make this experience better?', type: 'VOICE', required: false },
        ],
      },
      {
        key: 'sponsor-zone-feedback',
        name: 'Sponsor Zone Feedback',
        description: 'Measure recommendation intent and capture the reason behind it.',
        eventStructureItem: { kind: 'SPONSOR_ACTIVATION', name: 'Sponsor Zones' },
        target: { category: 'CUSTOM', name: 'Sponsor Zones' },
        questions: [
          { prompt: 'How likely are you to recommend this experience?', type: 'RECOMMENDATION_0_TO_10', required: true },
          { prompt: 'Why did you choose that score?', type: 'VOICE', required: false },
        ],
      },
    ],
  },
  {
    key: 'blank',
    label: 'Blank Event',
    description: "No areas yet — you'll add your own.",
    items: [],
    recommendedSurveys: [],
  },
]

export const EVENT_TEMPLATE_KEYS = EVENT_TEMPLATES.map((template) => template.key)

export function isEventTemplateKey(value: unknown): value is string {
  return typeof value === 'string' && EVENT_TEMPLATE_KEYS.includes(value)
}

export function getEventTemplate(key: string): EventTemplate | null {
  return EVENT_TEMPLATES.find((template) => template.key === key) ?? null
}

/** Human-readable preview of what an event starts with for a template. */
export function eventTemplatePreview(template: EventTemplate): string {
  if (template.items.length === 0) return "No areas yet — you'll add your own"
  return template.items.map((item) => item.name).join(' · ')
}
