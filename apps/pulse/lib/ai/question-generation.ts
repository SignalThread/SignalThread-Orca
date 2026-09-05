/**
 * Prompt construction for AI question generation.
 *
 * Kept out of the Next.js `route.ts` (which may only export route handlers) so
 * the mode-aware logic is unit-testable. Events mode produces event-operator
 * native prompts; retail mode preserves the original SMB behavior exactly.
 */

const RETAIL_GOALS = ['reviews', 'NPS', 'feedback', 'complaints'] as const
const TONES = ['friendly', 'direct', 'premium'] as const

/**
 * Event-native generation goals. These describe live-event operator concerns —
 * not reviews/NPS/business framing. `feedback` is kept as a generic default so
 * the existing Event survey builder goal options resolve cleanly.
 */
export const EVENT_GOAL_FRAMING: Record<string, string> = {
  feedback: 'live attendee feedback during the event',
  live_event_feedback: 'live attendee feedback during the event',
  attendee_satisfaction: 'overall attendee satisfaction',
  session_quality: 'session content and speaker quality',
  event_operations: 'event operations and logistics',
  wayfinding_and_check_in: 'wayfinding, signage, and check-in experience',
  sponsor_activation_value: 'sponsor and exhibitor activation value',
  networking_quality: 'networking and connection quality',
  food_and_beverage: 'food and beverage experience',
  accessibility_and_comfort: 'accessibility and attendee comfort',
}

export const EVENT_GOALS = Object.keys(EVENT_GOAL_FRAMING)

export type QuestionGenerationMode = 'events' | 'retail'

export interface QuestionPromptParams {
  mode: QuestionGenerationMode
  surveyName: string
  description: string
  /** Retail: business type. Events: area/session/touchpoint context. */
  context: string
  goal: string
  tone: string
  count: number
}

export type NormalizedQuestionRequest = QuestionPromptParams

export type GeneratedQuestionType = 'VOICE' | 'RATING_1_TO_5' | 'RECOMMENDATION_0_TO_10'

export interface GeneratedQuestion {
  text: string
  type: GeneratedQuestionType
}

const GENERATED_QUESTION_TYPES: GeneratedQuestionType[] = [
  'VOICE',
  'RATING_1_TO_5',
  'RECOMMENDATION_0_TO_10',
]

/**
 * Accept the canonical Events object payload while retaining the legacy string
 * payload used by SMB. Unknown types deliberately fall back to VOICE.
 */
export function normalizeGeneratedQuestions(value: unknown): GeneratedQuestion[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (typeof item === 'string') {
      const text = item.trim()
      return text ? [{ text, type: 'VOICE' as const }] : []
    }
    if (!item || typeof item !== 'object') return []

    const candidate = item as { text?: unknown; prompt?: unknown; type?: unknown }
    const text = typeof candidate.text === 'string'
      ? candidate.text.trim()
      : typeof candidate.prompt === 'string'
        ? candidate.prompt.trim()
        : ''
    if (!text) return []

    return [{
      text,
      type: typeof candidate.type === 'string' && GENERATED_QUESTION_TYPES.includes(candidate.type as GeneratedQuestionType)
        ? candidate.type as GeneratedQuestionType
        : 'VOICE',
    }]
  })
}

function normalizeMode(value: unknown, goal: unknown): QuestionGenerationMode {
  if (value === 'events' || value === 'retail') return value
  // Fall back to inferring Events mode from an unambiguous event-only goal.
  if (typeof goal === 'string' && goal !== 'feedback' && goal in EVENT_GOAL_FRAMING) {
    return 'events'
  }
  return 'retail'
}

/**
 * Normalize and validate the incoming request into a mode-scoped shape. Retail
 * behavior is preserved exactly; Events mode uses event-native goals.
 */
export function normalizeQuestionRequest(body: {
  surveyName?: string
  description?: string
  businessType?: string
  eventContext?: string
  goal?: string
  tone?: string
  count?: number
  mode?: string
}): NormalizedQuestionRequest {
  const mode = normalizeMode(body.mode, body.goal)
  const goal = body.goal ?? ''
  const validGoal =
    mode === 'events'
      ? goal in EVENT_GOAL_FRAMING
        ? goal
        : 'live_event_feedback'
      : RETAIL_GOALS.includes(goal as (typeof RETAIL_GOALS)[number])
        ? goal
        : 'feedback'
  const validTone = TONES.includes(body.tone as (typeof TONES)[number]) ? body.tone! : 'friendly'
  const validCount = Math.min(8, Math.max(3, Math.round(Number(body.count) || 5)))

  return {
    mode,
    surveyName: (body.surveyName ?? '').trim(),
    description: (body.description ?? '').trim(),
    context: (body.eventContext ?? body.businessType ?? '').trim(),
    goal: validGoal,
    tone: validTone,
    count: validCount,
  }
}

/**
 * Build the user prompt. Events mode is event-operator native (no "business",
 * store, reviews, or NPS framing); retail mode keeps its original prompt.
 */
export function buildQuestionPrompt(params: QuestionPromptParams): string {
  const { mode, surveyName, description, context, goal, tone, count } = params

  const preamble = `${surveyName ? `Survey: ${surveyName}. ` : ''}${description ? `Context: ${description}. ` : ''}`

  if (mode === 'events') {
    const focus = EVENT_GOAL_FRAMING[goal] ?? EVENT_GOAL_FRAMING.live_event_feedback
    const where = context ? ` at ${context}` : ''
    return (
      `${preamble}Generate ${count} short survey questions an event team can ask attendees${where} while a live event is happening. ` +
      `Focus on ${focus}. Ask about the attendee's on-site experience, sessions, locations, sponsor activations, and event operations where relevant. ` +
      `Choose types intentionally: use VOICE for open-ended attendee feedback; use RATING_1_TO_5 for satisfaction, quality, clarity, ease, or experience scoring; use RECOMMENDATION_0_TO_10 only when the question explicitly asks likelihood to recommend. ` +
      `Do not use RECOMMENDATION_0_TO_10 for generic satisfaction. For sets of three or more, include at least one VOICE question and at least one appropriate structured question, without duplicate rating or recommendation questions. Do not force a recommendation question when recommendation is not relevant. ` +
      `Keep each question under 14 words and phrased for the in-person event moment. ` +
      `Return a JSON array of objects with exactly "text" and "type" keys, no other text. ` +
      `Example: [{"text":"How is the session going so far?","type":"VOICE"},{"text":"How would you rate the session quality?","type":"RATING_1_TO_5"}]`
    )
  }

  return (
    `${preamble}Generate ${count} short, high-conversion voice survey questions for a ${context || 'business'} business. ` +
    `Goal: ${goal}. Tone: ${tone}. Keep each question under 12 words. Optimize for spoken responses. ` +
    `Return a JSON array of strings only, no other text. Example: ["How was your experience today?", "What did we do well?"]`
  )
}
