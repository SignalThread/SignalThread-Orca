import type { AnalysisResult } from '@/lib/analysis'
import { isEventsAccount } from '@/lib/account-product-mode'
import {
  classifyEventOperationsTaxonomy,
  deriveActionWindowForPriority,
  deriveEventPriorityLevel,
  getEventTaxonomyLabel,
  isEventPriorityLevel,
  normalizeEventTaxonomyKey,
  priorityLevelToActionPriority,
  type EventCommandCenterExtraction,
  type EventMentionSet,
  type EventPriorityLevel,
} from '@/lib/event-intelligence/contract'
import { prisma } from '@/lib/prisma'
import { EVENT_INTELLIGENCE_MODEL } from '@/lib/analysis-model'
import type { EventLifecyclePhase } from '@/lib/events-home-groups'

type PrismaLike = typeof prisma

export const EVENT_COMMAND_CENTER_PROMPT_VERSION = 'event-command-center-v2'
export const EVENT_COMMAND_CENTER_MODEL = EVENT_INTELLIGENCE_MODEL

interface EventExtractionInput {
  transcriptText: string
  analysis: AnalysisResult
  /** The phase in which this answer was captured, not today's event phase. */
  lifecycle?: EventLifecyclePhase | null
}

interface EventEligibilityAnswer {
  response?: {
    surveyId: string | null
    surveyTargetId: string | null
    publicSurveyLinkId: string | null
    event?: {
      location?: {
        account?: {
          accountType: string | null
        } | null
      } | null
    } | null
  } | null
}

const EMPTY_MENTIONS: EventMentionSet = {
  sponsors: [],
  exhibitors: [],
  sessions: [],
  locations: [],
}

const PRIORITY_IMPACT_SCORE: Record<EventPriorityLevel, number> = {
  Immediate: 0.95,
  Soon: 0.75,
  Watch: 0.45,
  Informational: 0.15,
}

const PRIORITY_TIME_SCORE: Record<EventPriorityLevel, number> = {
  Immediate: 0.95,
  Soon: 0.7,
  Watch: 0.35,
  Informational: 0.1,
}

const OPERATIONAL_NEXT_STEPS: Record<string, string> = {
  access_checkin: 'Add check-in staff and open another badge pickup lane',
  session_content_speakers: 'Review session feedback with the programming lead',
  room_environment_av: 'Send AV staff to verify room setup and sound levels',
  wayfinding: 'Add directional signage at the reported location',
  food_beverage: 'Alert catering to restock and adjust service flow',
  networking_expo: 'Have event staff improve expo and networking flow',
  staff_process: 'Brief staff on the reported process gap',
  safety_accessibility: 'Escalate the accessibility or safety issue to onsite operations',
  sponsor_exhibitor_experience: 'Ask sponsor operations to check the affected booth area',
}

const ENTITY_KEYWORDS: Array<{ type: keyof EventMentionSet; pattern: RegExp }> = [
  { type: 'sponsors', pattern: /\bsponsor(?:s|ed)?\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,3})/g },
  { type: 'exhibitors', pattern: /\bexhibitor\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,3})/g },
  { type: 'sessions', pattern: /\b(?:session|keynote|panel|workshop)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,5})/g },
  { type: 'locations', pattern: /\b(?:room|hall|lobby|booth)\s+([A-Z0-9][\w&.-]*(?:\s+[A-Z0-9][\w&.-]*){0,3})/g },
]

function clampScore(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(1, value))
}

function normalizeOptionalText(value: unknown, maxLength = 220): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized
}

function normalizeTextArray(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') continue
    const label = item.trim().replace(/\s+/g, ' ')
    const key = label.toLowerCase()
    if (!label || seen.has(key)) continue
    seen.add(key)
    normalized.push(label)
    if (normalized.length >= maxItems) break
  }

  return normalized
}

function buildRepresentativeSnippet(transcriptText: string, fallback: string | null): string {
  const normalizedFallback = normalizeOptionalText(fallback, 320)
  if (normalizedFallback) return normalizedFallback

  const normalizedTranscript = transcriptText.trim().replace(/\s+/g, ' ')
  if (!normalizedTranscript) return ''
  if (normalizedTranscript.length <= 320) return normalizedTranscript
  return `${normalizedTranscript.slice(0, 319).trim()}…`
}

function inferMentions(transcriptText: string): EventMentionSet {
  const mentions: EventMentionSet = { ...EMPTY_MENTIONS }

  for (const { type, pattern } of ENTITY_KEYWORDS) {
    const matches = Array.from(transcriptText.matchAll(pattern))
      .map((match) => normalizeOptionalText(match[1], 80))
      .filter((value): value is string => Boolean(value))
    mentions[type] = Array.from(new Set(matches)).slice(0, 5)
  }

  return mentions
}

function normalizeMentions(value: unknown, transcriptText: string): EventMentionSet {
  const inferred = inferMentions(transcriptText)
  if (!value || typeof value !== 'object') return inferred
  const record = value as Record<string, unknown>

  return {
    sponsors: normalizeTextArray(record.sponsors, 5).concat(inferred.sponsors).slice(0, 5),
    exhibitors: normalizeTextArray(record.exhibitors, 5).concat(inferred.exhibitors).slice(0, 5),
    sessions: normalizeTextArray(record.sessions, 5).concat(inferred.sessions).slice(0, 5),
    locations: normalizeTextArray(record.locations, 5).concat(inferred.locations).slice(0, 5),
  }
}

function recommendedStepForTaxonomy(taxonomyKey: string, priorityLevel: EventPriorityLevel, transcriptText: string): string | null {
  if (priorityLevel === 'Informational') return null
  if (taxonomyKey === 'general_positive' || taxonomyKey === 'general_other') return null
  const explicit = OPERATIONAL_NEXT_STEPS[taxonomyKey]
  if (explicit) return explicit

  const normalized = transcriptText.toLowerCase()
  if (normalized.includes('line') || normalized.includes('queue')) {
    return 'Add onsite staff to reduce the reported queue'
  }
  return 'Assign onsite operations to review the reported issue'
}

function recommendedPreEventStep(taxonomyKey: string, priorityLevel: EventPriorityLevel): string | null {
  if (taxonomyKey === 'general_positive' && priorityLevel === 'Informational') return null
  if (taxonomyKey === 'session_content_speakers') return 'Confirm agenda topics and speaker briefs address the requested practical questions'
  if (taxonomyKey === 'networking_expo') return 'Plan a clear networking format and attendee connection opportunities'
  if (taxonomyKey === 'safety_accessibility') return 'Address the stated accessibility or confidence concern before doors open'
  return 'Use this feedback to refine the pre-event plan before doors open'
}

function isPreEvent(input: EventExtractionInput) {
  return input.lifecycle === 'PRE_EVENT'
}

function preEventActionWindow(value: string | null, hasAction: boolean): string | null {
  if (!hasAction) return null
  const normalized = value?.trim().toUpperCase()
  if (normalized === 'WATCH' || normalized === 'LATER' || normalized === 'THIS_WEEK') return normalized
  return 'THIS_WEEK'
}

function normalizeExtractionPayload(
  payload: unknown,
  input: EventExtractionInput,
): EventCommandCenterExtraction {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const taxonomyKey = normalizeEventTaxonomyKey(record.taxonomyKey)
  const taxonomyLabel = getEventTaxonomyLabel(taxonomyKey)
  const hasRecommendedStep = Boolean(normalizeOptionalText(record.recommendedNextStep))
  const requestedActionWindow = normalizeOptionalText(record.actionWindow)
  const derivedPriority = deriveEventPriorityLevel({
    sentimentScore: input.analysis.sentimentScore,
    actionPriority: hasRecommendedStep ? 'Medium' : null,
    actionWindow: isPreEvent(input)
      ? preEventActionWindow(requestedActionWindow, hasRecommendedStep)
      : requestedActionWindow,
    evidenceCount: input.transcriptText.trim().length >= 20 ? 1 : 0,
    frictionCategory: taxonomyKey,
    hasAction: hasRecommendedStep,
  })
  const priorityLevel = isPreEvent(input) && record.priorityLevel === 'Immediate'
    ? 'Soon'
    : isEventPriorityLevel(record.priorityLevel) ? record.priorityLevel : derivedPriority
  const recommendedNextStep = normalizeOptionalText(record.recommendedNextStep)
    ?? (isPreEvent(input)
      ? recommendedPreEventStep(taxonomyKey, priorityLevel)
      : recommendedStepForTaxonomy(taxonomyKey, priorityLevel, input.transcriptText))
  const actionWindow = isPreEvent(input)
    ? preEventActionWindow(requestedActionWindow, Boolean(recommendedNextStep))
    : requestedActionWindow ?? deriveActionWindowForPriority(priorityLevel, Boolean(recommendedNextStep))
  const representativeSnippet = buildRepresentativeSnippet(input.transcriptText, normalizeOptionalText(record.representativeSnippet, 320))
  const mentions = normalizeMentions(record.mentions, input.transcriptText)
  const entities = normalizeTextArray(record.entities, 12)
    .concat(mentions.sponsors, mentions.exhibitors, mentions.sessions, mentions.locations)
    .filter((value, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 12)

  return {
    taxonomyKey,
    taxonomyLabel,
    priorityLevel,
    impactScore: clampScore(record.impactScore, PRIORITY_IMPACT_SCORE[priorityLevel]),
    timeSensitivityScore: clampScore(record.timeSensitivityScore, PRIORITY_TIME_SCORE[priorityLevel]),
    recommendedNextStep,
    actionWindow,
    representativeSnippet,
    confidence: clampScore(record.confidence, input.transcriptText.trim().length >= 20 ? 0.72 : 0.5),
    entities,
    mentions,
  }
}

function buildHeuristicExtraction(input: EventExtractionInput): EventCommandCenterExtraction {
  const action = input.analysis.actionItems[0]
  const taxonomyKey = classifyEventOperationsTaxonomy({
    themes: input.analysis.themes,
    actions: input.analysis.actionItems.map((item) => ({
      title: item.text,
      priority: item.priority,
    })),
    transcriptText: input.transcriptText,
    sentimentScore: input.analysis.sentimentScore,
  })
  const hasAction = Boolean(action?.text?.trim())
  const priorityLevel = deriveEventPriorityLevel({
    sentimentScore: input.analysis.sentimentScore,
    actionPriority: action?.priority ?? null,
    evidenceCount: input.transcriptText.trim().length >= 20 ? 1 : 0,
    frictionCategory: taxonomyKey,
    hasAction,
  })

  return normalizeExtractionPayload({
    taxonomyKey,
    priorityLevel,
    recommendedNextStep: action?.text ?? (isPreEvent(input)
      ? recommendedPreEventStep(taxonomyKey, priorityLevel)
      : recommendedStepForTaxonomy(taxonomyKey, priorityLevel, input.transcriptText)),
    actionWindow: isPreEvent(input)
      ? preEventActionWindow(null, hasAction || taxonomyKey !== 'general_positive')
      : deriveActionWindowForPriority(priorityLevel, hasAction || taxonomyKey !== 'general_positive'),
    representativeSnippet: buildRepresentativeSnippet(input.transcriptText, input.analysis.keyQuote),
    confidence: input.transcriptText.trim().length >= 20 ? 0.72 : 0.5,
    mentions: inferMentions(input.transcriptText),
  }, input)
}

function buildEventExtractionPrompt(input: EventExtractionInput): string {
  const lifecycleInstructions = input.lifecycle === 'PRE_EVENT'
    ? `This answer was captured before doors open. Classify it as planning and readiness intelligence: agenda priorities, speaker questions, session/format preferences, networking expectations, or concerns organizers can address before the event. Never describe it as an onsite incident, live friction, or an act-now operational failure. Any recommendation must prepare the upcoming event, and actionWindow must be THIS_WEEK, WATCH, LATER, or null.`
    : input.lifecycle === 'POST_EVENT'
      ? `This answer was captured after the event. Classify it as cumulative outcome and learning intelligence. Recommendations must be post-event follow-up or next-event learning, never an onsite instruction.`
      : `This answer was captured during the live event. Classify it as live-event intelligence and use onsite operational framing only when the attendee describes an active event experience.`

  return `Analyze one event attendee answer using the lifecycle context below.

${lifecycleInstructions}

Return ONLY compact JSON with:
{
  "taxonomyKey": one of "access_checkin", "session_content_speakers", "room_environment_av", "wayfinding", "food_beverage", "networking_expo", "staff_process", "safety_accessibility", "sponsor_exhibitor_experience", "general_positive", "general_other",
  "priorityLevel": one of "Immediate", "Soon", "Watch", "Informational",
  "impactScore": number 0-1,
  "timeSensitivityScore": number 0-1,
  "recommendedNextStep": concrete lifecycle-appropriate next step or null,
  "actionWindow": "IMMEDIATE", "NEXT_24_HOURS", "THIS_WEEK", "WATCH", "LATER", or null,
  "representativeSnippet": short exact or near-exact attendee evidence snippet,
  "confidence": number 0-1,
  "entities": array of named sponsors, exhibitors, sessions, rooms, locations, or people,
  "mentions": { "sponsors": [], "exhibitors": [], "sessions": [], "locations": [] }
}

Rules:
- Use the controlled taxonomy exactly.
- Do not make negative sentiment alone Immediate.
- Immediate is only for active onsite issues during the live event with time sensitivity, safety/accessibility, access/check-in blockage, or AV/environment problems needing staff now.
- Positive praise should usually be Informational with no recommendedNextStep unless there is a concrete follow-up.
- Recommended steps should be lifecycle-appropriate, specific, and evidence-backed.

Existing synopsis:
${JSON.stringify(input.analysis)}

Transcript:
"""
${input.transcriptText.slice(0, 12000)}
"""`
}

export async function isAnswerEligibleForEventExtraction(
  answerId: string,
  db: PrismaLike = prisma,
): Promise<boolean> {
  const answer = await db.answer.findUnique({
    where: { id: answerId },
    select: {
      response: {
        select: {
          surveyId: true,
          surveyTargetId: true,
          publicSurveyLinkId: true,
          event: {
            select: {
              location: {
                select: {
                  account: {
                    select: {
                      accountType: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }) as EventEligibilityAnswer | null

  if (!isEventsAccount(answer?.response?.event?.location?.account?.accountType)) {
    return false
  }

  return Boolean(
    answer?.response?.surveyId
      || answer?.response?.surveyTargetId
      || answer?.response?.publicSurveyLinkId,
  )
}

export async function extractEventCommandCenterIntelligence(
  input: EventExtractionInput,
): Promise<EventCommandCenterExtraction> {
  if (process.env.EVENTS_TEST_DISABLE_EXTERNAL_PROVIDERS === '1') {
    return buildHeuristicExtraction(input)
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return buildHeuristicExtraction(input)
  }

  try {
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })
    const response = await openai.chat.completions.create({
      model: EVENT_COMMAND_CENTER_MODEL,
      messages: [
        {
          role: 'system',
          content: input.lifecycle === 'PRE_EVENT'
            ? 'You extract pre-event planning and readiness intelligence. Output valid JSON only.'
            : input.lifecycle === 'POST_EVENT'
              ? 'You extract post-event outcomes and next-event learning. Output valid JSON only.'
              : 'You extract live event operations intelligence. Output valid JSON only.',
        },
        {
          role: 'user',
          content: buildEventExtractionPrompt(input),
        },
      ],
      ...(EVENT_COMMAND_CENTER_MODEL === 'gpt-5.6-sol' ? {} : { temperature: 0.2 }),
      max_completion_tokens: 700,
      response_format: { type: 'json_object' },
    })
    const content = response.choices[0]?.message?.content
    if (!content) return buildHeuristicExtraction(input)
    return normalizeExtractionPayload(JSON.parse(content), input)
  } catch (error) {
    console.error('[EventIntelligenceExtraction] Falling back to heuristic extraction:', error)
    return buildHeuristicExtraction(input)
  }
}

export function mergeEventExtractionIntoAnalysis(
  analysis: AnalysisResult,
  extraction: EventCommandCenterExtraction,
): AnalysisResult {
  const themes = [
    extraction.taxonomyLabel,
    ...analysis.themes,
  ].filter((theme, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === theme.toLowerCase()) === index)

  const recommendedNextStep = extraction.recommendedNextStep?.trim()
  const actionItems = recommendedNextStep
    ? [
        {
          text: recommendedNextStep,
          priority: priorityLevelToActionPriority(extraction.priorityLevel),
        },
        ...analysis.actionItems.filter((item) => item.text.trim().toLowerCase() !== recommendedNextStep.toLowerCase()),
      ]
    : analysis.actionItems

  return {
    ...analysis,
    themes,
    actionItems,
    keyQuote: extraction.representativeSnippet || analysis.keyQuote,
  }
}
