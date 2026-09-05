import { EventStatus, EventType, QuestionType, SurveyTargetCategory, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildQuestionPrompt, normalizeQuestionRequest } from '@/lib/ai/question-generation'
import { AdvancedEventSurveyBuilderError, isSharedEventSurveyBuilderEvent } from '@/lib/advanced-event-survey-builder'

type AdvancedAiDb = Pick<PrismaClient, 'event' | 'survey'>
type JsonCompletion = (system: string, prompt: string) => Promise<unknown>

export interface AdvancedAiContextChip { key: string; label: string }
export interface AdvancedAiQuestionSuggestion {
  id: string
  text: string
  type: 'OPEN_RESPONSE' | 'RATING_1_TO_5' | 'RECOMMENDATION_0_TO_10' | 'YES_NO' | 'SINGLE_CHOICE' | 'SPEAKER_FEEDBACK'
  required: boolean
  options?: string[]
}

async function completeJson(system: string, prompt: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new AdvancedEventSurveyBuilderError('AI generation is not configured', 503)
  const { default: OpenAI } = await import('openai')
  const response = await new OpenAI({ apiKey }).chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    max_tokens: 900,
    temperature: 0.65,
    response_format: { type: 'json_object' },
  })
  const text = response.choices[0]?.message?.content?.trim() || '{}'
  return JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
}

async function loadAdvancedAiContext(
  input: { accountId: string; eventId: string; surveyId: string; excludedContextKeys?: string[] },
  db: AdvancedAiDb,
) {
  const event = await db.event.findFirst({
    where: { id: input.eventId, location: { accountId: input.accountId } },
    select: { id: true, name: true, eventType: true },
  })
  if (!event) throw new AdvancedEventSurveyBuilderError('Event not found or access denied', 404)
  if (!isSharedEventSurveyBuilderEvent(event.eventType)) throw new AdvancedEventSurveyBuilderError('AI assistance here is only available for Advanced or Simple Events', 409)
  const survey = await db.survey.findFirst({
    where: { id: input.surveyId, eventId: event.id },
    select: {
      id: true, name: true, description: true, status: true,
      questions: { select: { label: true } },
      surveyTarget: { select: { id: true, category: true, name: true, eventStructureItemId: true, eventStructureItem: { select: { speakerAssignments: { select: { speaker: { select: { id: true, name: true, isArchived: true } } } } } } } },
      publicSurveyLinks: { select: { surveyTarget: { select: { id: true, category: true, name: true, eventStructureItemId: true, eventStructureItem: { select: { speakerAssignments: { select: { speaker: { select: { id: true, name: true, isArchived: true } } } } } } } } } },
    },
  })
  if (!survey) throw new AdvancedEventSurveyBuilderError('Survey draft not found in this event', 404)
  if (survey.status !== EventStatus.DRAFT) throw new AdvancedEventSurveyBuilderError('AI assistance is only available while the survey is a draft', 409)

  const targets = [survey.surveyTarget, ...survey.publicSurveyLinks.map((link) => link.surveyTarget)].filter(Boolean)
  const chips: AdvancedAiContextChip[] = [{ key: `event:${event.id}`, label: `Event: ${event.name}` }]
  for (const target of targets) {
    if (!target || chips.some((chip) => chip.key === `target:${target.id}`)) continue
    chips.push({ key: `target:${target.id}`, label: `${target.category === SurveyTargetCategory.SESSION ? 'Session' : target.category === SurveyTargetCategory.SPEAKER ? 'Speaker' : 'Assignment'}: ${target.name}` })
    for (const assignment of target.eventStructureItem?.speakerAssignments ?? []) {
      if (!assignment.speaker.isArchived && !chips.some((chip) => chip.key === `speaker:${assignment.speaker.id}`)) {
        chips.push({ key: `speaker:${assignment.speaker.id}`, label: `Speaker: ${assignment.speaker.name}` })
      }
    }
  }
  const excluded = new Set(input.excludedContextKeys ?? [])
  return {
    event,
    survey,
    chips: chips.filter((chip) => !excluded.has(chip.key)),
    hasSpecificSession: targets.some((target) => target?.category === SurveyTargetCategory.SESSION && Boolean(target.eventStructureItemId)),
  }
}

export function normalizeAdvancedAiSuggestions(value: unknown, hasSpecificSession: boolean): AdvancedAiQuestionSuggestion[] {
  const source = value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { questions?: unknown }).questions)
    ? (value as { questions: unknown[] }).questions
    : Array.isArray(value) ? value : []
  const supported = new Set<AdvancedAiQuestionSuggestion['type']>([
    QuestionType.OPEN_RESPONSE, QuestionType.RATING_1_TO_5, QuestionType.RECOMMENDATION_0_TO_10,
    QuestionType.YES_NO, QuestionType.SINGLE_CHOICE, ...(hasSpecificSession ? [QuestionType.SPEAKER_FEEDBACK] : []),
  ])
  return source.slice(0, 8).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as { text?: unknown; type?: unknown; options?: unknown }
    const text = typeof item.text === 'string' ? item.text.trim().slice(0, 1000) : ''
    const requestedType = item.type === 'VOICE' ? QuestionType.OPEN_RESPONSE : item.type
    const type = supported.has(requestedType as AdvancedAiQuestionSuggestion['type']) ? requestedType as AdvancedAiQuestionSuggestion['type'] : QuestionType.OPEN_RESPONSE
    if (!text) return []
    const options = type === QuestionType.SINGLE_CHOICE && Array.isArray(item.options)
      ? [...new Set(item.options.filter((option): option is string => typeof option === 'string').map((option) => option.trim()).filter(Boolean))].slice(0, 12)
      : undefined
    return [{ id: `ai-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`, text, type, required: true, ...(options && options.length >= 2 ? { options } : type === QuestionType.SINGLE_CHOICE ? { type: QuestionType.OPEN_RESPONSE } : {}) }]
  })
}

export async function generateAdvancedSurveyQuestions(
  input: { accountId: string; eventId: string; surveyId: string; goal: string; tone: string; count: number; excludedContextKeys?: string[]; avoidQuestions?: string[] },
  db: AdvancedAiDb = prisma,
  complete: JsonCompletion = completeJson,
) {
  const context = await loadAdvancedAiContext(input, db)
  // The general-purpose prompt normalizer retains its legacy 3-question
  // minimum. Advanced survey regeneration is the one scoped exception: it
  // deliberately asks the same canonical generator for exactly one question.
  const requestedCount = Math.min(8, Math.max(1, Math.round(input.count)))
  const normalized = {
    ...normalizeQuestionRequest({
      mode: 'events', surveyName: context.survey.name, description: context.survey.description ?? '',
      eventContext: context.chips.map((chip) => chip.label).join('; '), goal: input.goal, tone: input.tone, count: Math.max(3, requestedCount),
    }),
    count: requestedCount,
  }
  const basePrompt = buildQuestionPrompt(normalized).replaceAll('VOICE', 'OPEN_RESPONSE')
  const avoidedQuestions = [...context.survey.questions.map((question) => question.label), ...(input.avoidQuestions ?? [])]
    .map((question) => question.trim())
    .filter((question, index, all) => Boolean(question) && all.findIndex((item) => item.toLocaleLowerCase() === question.toLocaleLowerCase()) === index)
  const prompt = `${basePrompt}\nUse a ${normalized.tone} tone. Advanced types may also include YES_NO and SINGLE_CHOICE with an options array.${context.hasSpecificSession ? ' SPEAKER_FEEDBACK is allowed and uses the live session roster.' : ' Do not generate SPEAKER_FEEDBACK without a specific session.'}${avoidedQuestions.length > 0 ? ` Do not duplicate or substantially repeat any of these existing or temporary questions: ${avoidedQuestions.map((question) => JSON.stringify(question)).join(', ')}.` : ''}${requestedCount === 1 ? ' Return exactly one replacement question.' : ''} Return an object with a "questions" array.`
  const generated = await complete('Return valid JSON only. Suggestions are temporary and must use only the requested content schema.', prompt)
  const questions = normalizeAdvancedAiSuggestions(generated, context.hasSpecificSession).slice(0, normalized.count)
  if (questions.length === 0) throw new AdvancedEventSurveyBuilderError('AI did not return usable question suggestions', 502)
  return { questions, contextChips: context.chips }
}

export async function rewriteAdvancedSurveyQuestion(
  input: { accountId: string; eventId: string; surveyId: string; text: string; instruction?: string; excludedContextKeys?: string[] },
  db: AdvancedAiDb = prisma,
  complete: JsonCompletion = completeJson,
) {
  const context = await loadAdvancedAiContext(input, db)
  const original = input.text.trim()
  if (!original) throw new AdvancedEventSurveyBuilderError('Add question wording before requesting a rewrite')
  const result = await complete(
    'Return valid JSON only. Rewrite wording only; do not change the question intent, answer shape, scale, required state, speaker behavior, or delivery settings.',
    `Original question: ${JSON.stringify(original)}\nOptional direction: ${input.instruction?.trim() || 'Make it concise and clear.'}\nContext: ${context.chips.map((chip) => chip.label).join('; ') || 'No optional context'}\nReturn {"text":"...","summary":"..."}.`,
  )
  const record = result && typeof result === 'object' && !Array.isArray(result) ? result as { text?: unknown; summary?: unknown } : {}
  const text = typeof record.text === 'string' ? record.text.trim().slice(0, 1000) : ''
  if (!text) throw new AdvancedEventSurveyBuilderError('AI did not return a usable rewrite', 502)
  return { original, text, summary: typeof record.summary === 'string' ? record.summary.trim().slice(0, 240) : 'Wording refined; question settings stay unchanged.' }
}
