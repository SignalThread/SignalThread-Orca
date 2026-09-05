import OpenAI from 'openai'
import type { AnalysisResult } from '@/lib/analysis'
import { ANALYSIS_MODEL, REVIEW_SYNOPSIS_MODEL } from '@/lib/analysis-model'
import type { EventLifecyclePhase } from '@/lib/events-home-groups'

export { ANALYSIS_MODEL, REVIEW_SYNOPSIS_MODEL } from '@/lib/analysis-model'

export type AnswerAnalysisMode = 'RETAIL_GOOGLE_REVIEW' | 'EVENTS_INTELLIGENCE'
export type AnalysisEvidenceState = 'SUBSTANTIVE' | 'INSUFFICIENT_EVIDENCE'

export type ContextualAnalysisResult = AnalysisResult & {
  evidenceState: AnalysisEvidenceState
}

export const RETAIL_REVIEW_PROMPT_VERSION = 'review-synopsis-fast-v1'
export const EVENTS_ANALYSIS_PROMPT_VERSION = 'events-analysis-v2.1'

const INSUFFICIENT_PHRASES = new Set([
  'yes', 'no', 'um', 'uh', 'hmm', 'okay', 'ok', 'n/a', 'na', 'none',
  'no comment', 'nothing to add', 'skip',
])

const EVIDENCE_WORDS = /\b(?:love|loved|like|liked|dislike|disliked|hate|hated|great|good|excellent|amazing|helpful|useful|valuable|enjoy|enjoyed|bad|poor|awful|slow|fast|long|short|cold|hot|loud|quiet|confusing|clear|easy|hard|difficult|friendly|rude|crowded|organized|disorganized|worked|failed|broken|improve|better|worse|recommend|wish|want|need|because|but|too)\b/i

/** Deterministic guard before any model call. */
export function classifyEventTranscriptEvidence(transcript: string): AnalysisEvidenceState {
  const normalized = transcript.trim().replace(/\s+/g, ' ')
  const lower = normalized.toLowerCase().replace(/[.!?]+$/g, '').trim()
  if (!lower || INSUFFICIENT_PHRASES.has(lower)) return 'INSUFFICIENT_EVIDENCE'
  if (EVIDENCE_WORDS.test(lower)) return 'SUBSTANTIVE'
  if (/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(normalized)) return 'INSUFFICIENT_EVIDENCE'
  if (/^(?:booth|room|hall|table)\s*[#-]?\s*[a-z0-9-]+$/i.test(normalized)) return 'INSUFFICIENT_EVIDENCE'
  if (/^\d+(?:[./-]\d+){0,2}$/.test(normalized)) return 'INSUFFICIENT_EVIDENCE'
  if (/^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)?\s+[A-Z]{2}$/.test(normalized)) return 'INSUFFICIENT_EVIDENCE'
  if (/^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}$/.test(normalized)) return 'INSUFFICIENT_EVIDENCE'
  const tokens = lower.match(/[a-z0-9]+/g) ?? []
  return tokens.length >= 4 ? 'SUBSTANTIVE' : 'INSUFFICIENT_EVIDENCE'
}

export function insufficientEventAnalysis(): ContextualAnalysisResult {
  return {
    evidenceState: 'INSUFFICIENT_EVIDENCE',
    summary: '',
    sentiment: 'NEUTRAL',
    sentimentScore: 0,
    themes: [],
    actionItems: [],
    keyQuote: '',
  }
}

function testProviderResult(transcript: string, mode: AnswerAnalysisMode): ContextualAnalysisResult {
  if (mode === 'EVENTS_INTELLIGENCE' && classifyEventTranscriptEvidence(transcript) === 'INSUFFICIENT_EVIDENCE') {
    return insufficientEventAnalysis()
  }
  return {
    evidenceState: 'SUBSTANTIVE',
    summary: transcript.trim().slice(0, 600) || 'Thank you for sharing your feedback.',
    sentiment: 'NEUTRAL',
    sentimentScore: 0,
    themes: [],
    actionItems: [],
    keyQuote: '',
  }
}

function retailReviewPrompt(transcript: string): string {
  return `You will receive a short customer voice transcript. Produce ONLY valid JSON with these keys:
- "summary": 2-3 sentences, first person, suitable to paste as a Google review (no meta language like "the customer").
- "sentiment": one of POSITIVE, NEGATIVE, NEUTRAL, MIXED
- "sentimentScore": number from -1.0 to 1.0
- "themes": array of 0-3 short strings (optional, can be empty [])
- "actionItems": [] (empty array — not needed for this task)
- "keyQuote": one short phrase from the transcript or ""

Transcript:
"""
${transcript}
"""`
}

function eventsIntelligencePrompt(transcript: string, lifecycle: EventLifecyclePhase | null | undefined): string {
  const lifecycleInstructions = lifecycle === 'PRE_EVENT'
    ? 'This answer was captured before doors open. Treat it as planning/readiness evidence: what attendees want covered, speaker questions, session or format preferences, networking goals, agenda priorities, and concerns organizers can resolve before the event. Never invent an onsite experience, a queue, wayfinding failure, or live operational urgency.'
    : lifecycle === 'POST_EVENT'
      ? 'This answer was captured after the event. Treat it as cumulative outcomes and learning for follow-up or the next event; never frame a recommendation as an onsite action.'
      : lifecycle === 'IN_EVENT'
        ? 'This answer was captured during the live event. It may describe current attendee experience and actionable onsite friction when the transcript supports it.'
        : 'The capture lifecycle is unavailable. Do not infer an onsite experience unless the transcript explicitly describes one.'

  return `Analyze one Event attendee answer using the Events analysis contract v2.1.

Lifecycle context:
${lifecycleInstructions}

Return ONLY valid compact JSON:
{
  "evidenceState": "SUBSTANTIVE" or "INSUFFICIENT_EVIDENCE",
  "summary": evidence-grounded third-person summary or "",
  "sentiment": "POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED", or null,
  "sentimentScore": number from -1 to 1 or null,
  "themes": array of evidence-backed short themes,
  "actionItems": array of { "text": string, "priority": "High" | "Medium" | "Low" },
  "keyQuote": short exact quote or ""
}

Grounding rules:
- Report only experiences, opinions, qualities, problems, praise, requests, or recommendations explicitly supported by the transcript.
- A bare name, place, date, number, yes/no, filler, booth/room identifier, or "no comment" is INSUFFICIENT_EVIDENCE.
- For INSUFFICIENT_EVIDENCE return summary "", sentiment null, sentimentScore null, themes [], actionItems [], and keyQuote "".
- Never convert a named place or entity into praise, attractions, charm, quality, sentiment, or a recommendation.
- For SUBSTANTIVE evidence, keep recommendations concrete and directly traceable to the attendee's words.
- Do not add generic positive feedback or any taxonomy theme that is not evidenced.

Transcript:
"""
${transcript}
"""`
}

function normalizedSubstantiveResult(parsed: Record<string, unknown>): ContextualAnalysisResult {
  const validSentiments = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED']
  const sentiment = typeof parsed.sentiment === 'string' && validSentiments.includes(parsed.sentiment)
    ? parsed.sentiment
    : 'NEUTRAL'
  const sentimentScore = typeof parsed.sentimentScore === 'number' && parsed.sentimentScore >= -1 && parsed.sentimentScore <= 1
    ? parsed.sentimentScore
    : 0
  const themes = Array.isArray(parsed.themes)
    ? parsed.themes.filter((theme): theme is string => typeof theme === 'string' && Boolean(theme.trim())).slice(0, 5)
    : []
  const actionItems = Array.isArray(parsed.actionItems)
    ? parsed.actionItems.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const record = item as Record<string, unknown>
        if (typeof record.text !== 'string' || !record.text.trim()) return []
        const priority: 'High' | 'Medium' | 'Low' = record.priority === 'High' || record.priority === 'Low' ? record.priority : 'Medium'
        return [{ text: record.text.trim(), priority }]
      }).slice(0, 10)
    : []

  return {
    evidenceState: 'SUBSTANTIVE',
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    sentiment,
    sentimentScore,
    themes,
    actionItems,
    keyQuote: typeof parsed.keyQuote === 'string' ? parsed.keyQuote.trim() : '',
  }
}

/** Canonical fast analysis with an explicit authoritative product mode. */
export async function generateReviewSynopsisFast(
  transcript: string,
  context: { mode: AnswerAnalysisMode; lifecycle?: EventLifecyclePhase | null },
): Promise<ContextualAnalysisResult> {
  if (context.mode === 'EVENTS_INTELLIGENCE' && classifyEventTranscriptEvidence(transcript) === 'INSUFFICIENT_EVIDENCE') {
    return insufficientEventAnalysis()
  }
  if (process.env.EVENTS_TEST_DISABLE_EXTERNAL_PROVIDERS === '1') {
    return testProviderResult(transcript, context.mode)
  }

  const maxChars = Math.min(transcript.length, 12000)
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await openai.chat.completions.create({
    model: REVIEW_SYNOPSIS_MODEL,
    messages: [
      {
        role: 'system',
        content: context.mode === 'RETAIL_GOOGLE_REVIEW'
          ? 'You output only compact JSON. No markdown.'
          : 'You extract evidence-grounded event intelligence. Output compact JSON only and never infer missing facts.',
      },
      {
        role: 'user',
        content: context.mode === 'RETAIL_GOOGLE_REVIEW'
          ? retailReviewPrompt(transcript.slice(0, maxChars))
          : eventsIntelligencePrompt(transcript.slice(0, maxChars), context.lifecycle),
      },
    ],
    ...(context.mode === 'RETAIL_GOOGLE_REVIEW'
      ? { temperature: 0.35, max_tokens: 500 }
      : {
          ...(REVIEW_SYNOPSIS_MODEL === 'gpt-5.6-sol' ? {} : { temperature: 0.1 }),
          max_completion_tokens: 800,
        }),
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No content in answer analysis response')
  const parsed = JSON.parse(content) as Record<string, unknown>
  if (context.mode === 'EVENTS_INTELLIGENCE' && parsed.evidenceState === 'INSUFFICIENT_EVIDENCE') {
    return insufficientEventAnalysis()
  }

  const result = normalizedSubstantiveResult(parsed)
  if (!result.summary) throw new Error('Answer analysis missing summary')
  console.info('[AnswerAnalysis] OpenAI call complete', {
    model: REVIEW_SYNOPSIS_MODEL,
    mode: context.mode,
    transcriptChars: transcript.length,
  })
  return result
}
