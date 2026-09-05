import { createHash } from 'node:crypto'
import { z } from 'zod'
import { EVENT_COMMAND_CENTER_MODEL } from '@/lib/event-intelligence/extraction'
import {
  EVENT_INTELLIGENCE_EDITORIAL_PROMPT_VERSION,
  eventEditorialWritingRules,
  hasMechanicalEditorialLanguage,
  synthesizeEventEditorial,
} from '@/lib/event-intelligence/editorial-engine'
import { downloadObjectText, uploadObject } from '@/lib/objectStorage'

export const EVENT_CLOSING_BRIEF_EDITORIAL_PROMPT_VERSION = EVENT_INTELLIGENCE_EDITORIAL_PROMPT_VERSION
export const EVENT_CLOSING_BRIEF_EDITORIAL_MODEL = process.env.EVENT_CLOSING_BRIEF_MODEL?.trim()
  || EVENT_COMMAND_CENTER_MODEL

const findingNarrativeSchema = z.object({
  findingId: z.string().trim().min(1).max(500),
  narrative: z.string().trim().min(20).max(520),
}).strict()

function proseSentenceCount(value: string): number {
  return (value.trim().match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .length
}

const editorialCopySchema = z.object({
  headline: z.string().trim().min(12).max(180),
  executiveSummary: z.string().trim().min(20).max(700),
  keyTakeaway: z.string().trim().min(20).max(600),
  whatWorkedNarrative: z.string().trim().max(600),
  frictionNarrative: z.string().trim().max(600),
  nextEventNarrative: z.string().trim().max(600),
  coverageNarrative: z.string().trim().min(10).max(400),
  findingNarratives: z.array(findingNarrativeSchema).max(12),
}).strict().superRefine((copy, context) => {
  const entries = [
    ['headline', copy.headline],
    ['executiveSummary', copy.executiveSummary],
    ['keyTakeaway', copy.keyTakeaway],
    ['whatWorkedNarrative', copy.whatWorkedNarrative],
    ['frictionNarrative', copy.frictionNarrative],
    ['nextEventNarrative', copy.nextEventNarrative],
    ['coverageNarrative', copy.coverageNarrative],
    ...copy.findingNarratives.map((item, index) => [`findingNarratives.${index}.narrative`, item.narrative]),
  ] as const
  for (const [path, value] of entries) {
    if (/[<>]|[“”"]/.test(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: path.split('.'),
        message: 'Editorial prose must not contain HTML or invented quotations.',
      })
    }
  }

  const repeatedLead = [
    copy.headline,
    copy.executiveSummary,
    copy.keyTakeaway,
    copy.whatWorkedNarrative,
    copy.frictionNarrative,
    copy.nextEventNarrative,
    copy.coverageNarrative,
  ].join(' ').match(/attendees consistently reported/gi)?.length ?? 0
  if (repeatedLead > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Editorial prose repeats a mechanical finding lead.',
    })
  }

  const synopsisSentenceCount = proseSentenceCount(copy.executiveSummary)
  if (synopsisSentenceCount < 3 || synopsisSentenceCount > 5) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['executiveSummary'],
      message: 'The Event Overview synopsis must contain three to five concise sentences.',
    })
  }
  if (proseSentenceCount(copy.headline) !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['headline'],
      message: 'The Event Overview headline must be one sentence.',
    })
  }

})

const editorialCacheRecordSchema = z.object({
  source: z.literal('openai'),
  provider: z.literal('openai'),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().datetime(),
  copy: editorialCopySchema,
}).strict()

export type EventClosingBriefEditorialCopy = z.infer<typeof editorialCopySchema>

export interface EventClosingBriefEditorialInput {
  event: {
    id: string
    name: string
    lifecycle: 'POST_EVENT'
  }
  metrics: {
    responseCount: number
    answerCount: number
    sentiment: string
    averageSentiment: number | null
    listeningPointCount: number
    representedListeningPointCount: number
    representedPercent: number
  }
  findings: {
    keyFindings: EditorialFinding[]
    whatWorked: EditorialFinding[]
    friction: EditorialFinding[]
    nextEvent: EditorialFinding[]
  }
  followThrough: Array<{
    title: string
    status: string
    priority: string
    owner: string
    dueAt: string | null
  }>
  representativeEvidence: Array<{
    id: string
    excerpt: string
    question: string
    source: string
    confidence: number | null
  }>
  limitations: {
    unrepresentedListeningPointCount: number
    evidenceExcerptCount: number
  }
}

export interface EditorialFinding {
  id: string
  title: string
  statement: string | null
  kind: string
  classification: string
  evidenceTier: string
  confidence: number | null
  mentionCount: number
  responseCount: number | null
  sentiment: string | null
  target: { id: string; name: string | null; kind: string | null }
  evidenceModalities: string[]
  evidenceText: string[]
  representativeEvidence: Array<{
    id: string
    excerpt: string
    question: string
    source: string
  }>
}

export interface EventClosingBriefEditorial {
  source: 'openai' | 'fallback'
  provider: 'openai' | null
  model: string | null
  promptVersion: string
  inputHash: string
  generatedAt: string
  cacheHit: boolean
  copy: EventClosingBriefEditorialCopy
}

export interface EventClosingBriefEditorialCache {
  get(key: string): Promise<unknown | null>
  set(key: string, record: unknown): Promise<void>
}

export type EventClosingBriefEditorialWriter = (
  input: EventClosingBriefEditorialInput,
  context: { model: string; promptVersion: string; validationFeedback?: string },
) => Promise<unknown>

interface SynthesizeOptions {
  cache?: EventClosingBriefEditorialCache
  writer?: EventClosingBriefEditorialWriter
  forceRefresh?: boolean
  now?: Date
}

const memoryCache = new Map<string, EventClosingBriefEditorial>()
const pendingEditorial = new Map<string, Promise<EventClosingBriefEditorial>>()

function stableInputHash(input: EventClosingBriefEditorialInput): string {
  return createHash('sha256')
    .update(JSON.stringify({
      promptVersion: EVENT_CLOSING_BRIEF_EDITORIAL_PROMPT_VERSION,
      model: EVENT_CLOSING_BRIEF_EDITORIAL_MODEL,
      input,
    }))
    .digest('hex')
}

function cacheKey(input: EventClosingBriefEditorialInput, inputHash: string): string {
  const eventKey = input.event.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `event-closing-brief-editorial/${eventKey}/${EVENT_CLOSING_BRIEF_EDITORIAL_PROMPT_VERSION}/${inputHash}.json`
}

function objectStorageCache(): EventClosingBriefEditorialCache | null {
  const bucket = process.env.S3_BUCKET_NAME?.trim()
  if (!bucket || !process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    return null
  }
  return {
    async get(key) {
      try {
        return JSON.parse(await downloadObjectText(bucket, key))
      } catch (error) {
        const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        const name = (error as { name?: string }).name
        if (statusCode !== 404 && name !== 'NoSuchKey' && name !== 'NotFound') {
          console.warn('[EventClosingBriefEditorial] Persistent cache read failed:', error)
        }
        return null
      }
    },
    async set(key, record) {
      try {
        await uploadObject({
          bucket,
          key,
          body: JSON.stringify(record),
          contentType: 'application/json',
          cacheControl: 'private, max-age=31536000, immutable',
        })
      } catch (error) {
        console.warn('[EventClosingBriefEditorial] Persistent cache write failed:', error)
      }
    },
  }
}

function naturalList(values: string[]): string {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function lowerLead(value: string): string {
  if (!value || /^[A-Z]{2}/.test(value)) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function numericTokens(value: string): string[] {
  return value.match(/\d+(?:\.\d+)?/g) ?? []
}

function assertGroundedNumbers(copy: EventClosingBriefEditorialCopy, input: EventClosingBriefEditorialInput) {
  const allowed = new Set(numericTokens(JSON.stringify(input)))
  const unsupported = numericTokens(JSON.stringify(copy)).filter((value) => !allowed.has(value))
  if (unsupported.length > 0) {
    throw new Error(`Editorial prose introduced unsupported numeric facts: ${Array.from(new Set(unsupported)).join(', ')}`)
  }
}

function normalizeGuardrailText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const EDITORIAL_MATCH_STOP_WORDS = new Set([
  'about', 'after', 'attendee', 'attendees', 'event', 'feedback', 'finding', 'from', 'into', 'more', 'most', 'that', 'their', 'there', 'these', 'they', 'this', 'with',
])

function majorClusterCoverage(value: string, input: EventClosingBriefEditorialInput): number {
  const normalizedValue = normalizeGuardrailText(value)
  const valueTokens = new Set(normalizedValue.split(' '))
  const seenTitles = new Set<string>()
  return closingBriefEditorialFacts(input)
    .filter((fact) => fact.evidenceTier.toUpperCase() !== 'ISOLATED')
    .filter((fact) => {
      const title = normalizeGuardrailText(fact.title)
      if (!title || seenTitles.has(title)) return false
      seenTitles.add(title)
      return true
    })
    .filter((fact) => {
      const title = normalizeGuardrailText(fact.title)
      if (normalizedValue.includes(title)) return true
      const factTokens = normalizeGuardrailText(`${fact.title} ${fact.statement ?? ''}`)
        .split(' ')
        .filter((token) => token.length >= 5 && !EDITORIAL_MATCH_STOP_WORDS.has(token))
      const matchedTokens = factTokens.filter((token) => valueTokens.has(token))
      return matchedTokens.length >= Math.min(2, new Set(factTokens).size)
    })
    .length
}

function hasMetricDumpOpening(value: string): boolean {
  return /^(?:(?:across|among|from|with)\s+)?\d+\b|^(?:responses?|answers?|sentiment|coverage|response rate)\b/i.test(value.trim())
}

function firstSentence(value: string): string {
  const sentence = value.trim().match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()
  return sentence || value.trim()
}

function closingBriefEditorialFacts(input: EventClosingBriefEditorialInput) {
  return [
    ...input.findings.keyFindings,
    ...input.findings.whatWorked,
    ...input.findings.friction,
    ...input.findings.nextEvent,
  ].map((finding) => ({
    title: finding.title,
    statement: finding.statement,
    kind: finding.kind === 'positive'
      ? 'positive' as const
      : finding.kind === 'risk' || finding.kind === 'friction'
        ? 'risk' as const
        : finding.kind === 'signal'
          ? 'signal' as const
          : finding.kind === 'opportunity'
            ? 'opportunity' as const
            : 'theme' as const,
    evidenceTier: finding.evidenceTier,
    mentionCount: finding.mentionCount,
    sentimentLabel: finding.sentiment,
    scope: finding.target.kind,
  }))
}

function groundedOverview(input: EventClosingBriefEditorialInput) {
  return synthesizeEventEditorial({
    lifecycle: 'POST_EVENT',
    eventName: input.event.name,
    facts: closingBriefEditorialFacts(input),
  })
}

function groundedHeadline(input: EventClosingBriefEditorialInput): string {
  return groundedOverview(input).headline
}

function groundedCoverageNarrative(input: EventClosingBriefEditorialInput): string {
  if (input.metrics.listeningPointCount === 0) {
    return 'No configured listening-point coverage was available for this brief.'
  }
  if (input.limitations.unrepresentedListeningPointCount > 0) {
    return `This brief represents ${input.metrics.representedListeningPointCount} of ${input.metrics.listeningPointCount} configured listening points; uncovered areas remain a limitation.`
  }
  return `This brief represents all ${input.metrics.listeningPointCount} configured listening points.`
}

function normalizedSentence(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function fallbackFindingNarrative(finding: EditorialFinding): string {
  const groundedStatement = finding.statement?.trim()
  if (groundedStatement && normalizedSentence(groundedStatement) !== normalizedSentence(finding.title)) {
    if (finding.evidenceTier === 'EMERGING' && !/\b(early|emerging|some|a few|initial|limited|directional|suggests?|indicates?|points? to)\b/i.test(groundedStatement)) {
      return `Early evidence suggests ${lowerLead(groundedStatement)}`
    }
    return groundedStatement
  }

  const evidence = finding.evidenceText[0] || finding.representativeEvidence[0]?.excerpt
  if (evidence) {
    return finding.evidenceTier === 'EMERGING'
      ? `Early feedback points to ${lowerLead(firstSentence(evidence))}`
      : `Supporting feedback repeatedly centered on ${lowerLead(firstSentence(evidence))}`
  }

  return finding.evidenceTier === 'EMERGING'
    ? `${finding.title} surfaced as an early signal, but the available evidence remains directional.`
    : `${finding.title} emerged as a recurring pattern in the supporting attendee evidence.`
}

function removeMechanicalFindingLead(value: string): string {
  return value.replace(
    /(^|[.!?]\s+)attendees consistently reported that\s+([a-z])/gi,
    (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`,
  )
}

function sectionFallbackNarrative(findings: EditorialFinding[], section: 'worked' | 'friction' | 'next'): string {
  const titles = findings.map((finding) => lowerLead(finding.title)).slice(0, 3)
  if (titles.length === 0) return ''
  if (section === 'worked') return `Positive feedback converged on ${naturalList(titles)} as the clearest strengths to preserve.`
  if (section === 'friction') return `The clearest friction centered on ${naturalList(titles)}.`
  return `The recorded next-event priorities center on ${naturalList(titles)}.`
}

function cleanStandaloneNarrative(value: string): string {
  return value
    .replace(/^(additionally|also|however|moreover|furthermore|in addition),?\s+/i, '')
    .replace(/^([a-z])/, (letter) => letter.toUpperCase())
}

function uniqueSentences(value: string, seen: Set<string>): string {
  const sentences = value.match(/[^.!?]+[.!?]?/g) ?? []
  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      const normalized = normalizedSentence(sentence)
      if (!normalized || normalized.split(' ').length < 7) return Boolean(normalized)
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    .join(' ')
}

const UNSUPPORTED_PREDICTIVE_IMPACT = /\b(?:will|would|could|may|is likely to|will likely)\b[^.!?]{0,48}\b(?:improve|enhance|increase|reduce|ensure|lead to|help|elevate|boost|maintain)\b/i

function removeUnsupportedPredictions(value: string): string {
  return (value.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !UNSUPPORTED_PREDICTIVE_IMPACT.test(sentence))
    .join(' ')
}

function removeFindingRecommendations(value: string): string {
  return (value.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !/\b(?:this suggests a need|organizers? should|we recommend|recommendation is|calls for)\b/i.test(sentence))
    .join(' ')
}

function deduplicateEditorialSentences(
  copy: EventClosingBriefEditorialCopy,
  input: EventClosingBriefEditorialInput,
): EventClosingBriefEditorialCopy {
  const seen = new Set<string>()
  const grounded = groundedOverview(input)
  const headline = uniqueSentences(copy.headline, seen) || groundedHeadline(input)
  const executiveSummary = uniqueSentences(copy.executiveSummary, seen)
    || uniqueSentences(grounded.synopsis, seen)
  const keyTakeaway = uniqueSentences(copy.keyTakeaway, seen)
    || grounded.keyTakeaway
  const whatWorkedNarrative = cleanStandaloneNarrative(uniqueSentences(copy.whatWorkedNarrative, seen))
    || sectionFallbackNarrative(input.findings.whatWorked, 'worked')
  const frictionNarrative = cleanStandaloneNarrative(uniqueSentences(copy.frictionNarrative, seen))
    || sectionFallbackNarrative(input.findings.friction, 'friction')
  const nextEventNarrative = cleanStandaloneNarrative(uniqueSentences(copy.nextEventNarrative, seen))
    || sectionFallbackNarrative(input.findings.nextEvent, 'next')
  const suppliedNarratives = new Map(copy.findingNarratives.map((item) => [item.findingId, item.narrative]))
  const findingNarratives = input.findings.keyFindings.map((finding) => {
    const supplied = removeMechanicalFindingLead(suppliedNarratives.get(finding.id) ?? '')
    const narrative = uniqueSentences(supplied, seen)
      || uniqueSentences(removeMechanicalFindingLead(fallbackFindingNarrative(finding)), seen)
      || (finding.evidenceTier === 'EMERGING'
        ? `${finding.title} remains an early, directional finding in the available evidence.`
        : `${finding.title} is supported by a recurring pattern in the event evidence.`)
    return { findingId: finding.id, narrative }
  })
  return editorialCopySchema.parse({
    headline,
    executiveSummary,
    keyTakeaway,
    whatWorkedNarrative,
    frictionNarrative,
    nextEventNarrative,
    coverageNarrative: uniqueSentences(copy.coverageNarrative, seen)
      || groundedCoverageNarrative(input),
    findingNarratives,
  })
}

function applyEditorialGuardrails(copy: EventClosingBriefEditorialCopy, input: EventClosingBriefEditorialInput): EventClosingBriefEditorialCopy {
  const grounded = groundedOverview(input)
  const normalizedHeadline = normalizeGuardrailText(copy.headline)
  const normalizedEventName = normalizeGuardrailText(input.event.name)
  const normalizedOpening = normalizeGuardrailText(copy.executiveSummary.split(/[.!?]/)[0] ?? '')
  const eventTokens = normalizedEventName.split(' ').filter((token) => token.length >= 3 || /^\d+$/.test(token))
  const repeatsEventIdentity = (value: string) => {
    if (normalizedEventName && value.includes(normalizedEventName)) return true
    if (eventTokens.length < 3) return false
    const valueTokens = new Set(value.split(' '))
    return eventTokens.filter((token) => valueTokens.has(token)).length >= Math.max(3, Math.ceil(eventTokens.length * 0.75))
  }
  const genericHeadline = /^(key )?(insights|opportunities|findings|lessons|event report|closing brief)\b/i.test(copy.headline.trim())
  const headline = repeatsEventIdentity(normalizedHeadline) || genericHeadline || hasMechanicalEditorialLanguage(copy.headline) || hasMetricDumpOpening(copy.headline)
    ? groundedHeadline(input)
    : copy.headline
  const supportedClusterCount = new Set(closingBriefEditorialFacts(input)
    .filter((fact) => fact.evidenceTier.toUpperCase() !== 'ISOLATED')
    .map((fact) => normalizeGuardrailText(fact.title)))
    .size
  const needsMultipleClusters = supportedClusterCount >= 2
  const executiveSummary = repeatsEventIdentity(normalizedOpening)
    || hasMechanicalEditorialLanguage(copy.executiveSummary)
    || hasMetricDumpOpening(copy.executiveSummary)
    || (needsMultipleClusters && majorClusterCoverage(copy.executiveSummary, input) < 2)
    ? grounded.synopsis
    : copy.executiveSummary
  const canonicalStatements = [
    ...input.findings.keyFindings,
    ...input.findings.whatWorked,
    ...input.findings.friction,
    ...input.findings.nextEvent,
  ].map((finding) => finding.statement ?? '').join(' ')
  const unsupportedPromotion = /\b(successfully|highly successful|resounding|exceptional|outstanding|remarkable|transformative|well-attended)\b/i
  const unsupportedSuccess = !/\bsuccess\b/i.test(canonicalStatements)
  const removeUnsupportedClaims = (value: string) => (value.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence
      && !unsupportedPromotion.test(sentence)
      && !(unsupportedSuccess && /\bsuccess\b/i.test(sentence)))
    .join(' ')
  const sanitizedHeadline = unsupportedPromotion.test(headline)
    || (unsupportedSuccess && /\bsuccess\b/i.test(headline))
    ? groundedHeadline(input)
    : headline
  const sanitizeNarrative = (value: string, fallback: string) => {
    const sanitized = removeUnsupportedClaims(removeUnsupportedPredictions(value))
    return sanitized.length >= 20 ? sanitized : fallback
  }
  const guardedCopy = {
    ...copy,
    headline: removeUnsupportedPredictions(sanitizedHeadline) || groundedHeadline(input),
    executiveSummary: sanitizeNarrative(
      executiveSummary,
      grounded.synopsis,
    ),
    keyTakeaway: sanitizeNarrative(
      copy.keyTakeaway,
      grounded.keyTakeaway,
    ),
    whatWorkedNarrative: sanitizeNarrative(copy.whatWorkedNarrative, sectionFallbackNarrative(input.findings.whatWorked, 'worked')),
    frictionNarrative: sanitizeNarrative(copy.frictionNarrative, sectionFallbackNarrative(input.findings.friction, 'friction')),
    nextEventNarrative: sanitizeNarrative(copy.nextEventNarrative, sectionFallbackNarrative(input.findings.nextEvent, 'next')),
    coverageNarrative: groundedCoverageNarrative(input),
    findingNarratives: copy.findingNarratives.map((item) => ({
      ...item,
      narrative: removeFindingRecommendations(removeUnsupportedClaims(removeUnsupportedPredictions(item.narrative))),
    })),
  }
  const engagementTitles = input.findings.keyFindings
    .map((finding) => finding.title)
    .filter((title) => /\bengagement\b/i.test(title))
  if (/\bengagement\b/i.test(copy.headline) && engagementTitles.length > 0 && engagementTitles.every((title) => /\bspeaker\b/i.test(title))) {
    guardedCopy.headline = groundedHeadline(input)
  }
  if (!input.metrics.sentiment.toLowerCase().includes('strong') && /\bstrong positive\b/i.test(JSON.stringify(guardedCopy))) {
    const canonicalSentiment = input.metrics.sentiment.toLowerCase()
    guardedCopy.headline = guardedCopy.headline.replace(/strong positive/gi, canonicalSentiment)
    guardedCopy.executiveSummary = guardedCopy.executiveSummary.replace(/strong positive/gi, canonicalSentiment)
    guardedCopy.keyTakeaway = guardedCopy.keyTakeaway.replace(/strong positive/gi, canonicalSentiment)
    guardedCopy.whatWorkedNarrative = guardedCopy.whatWorkedNarrative.replace(/strong positive/gi, canonicalSentiment)
    guardedCopy.frictionNarrative = guardedCopy.frictionNarrative.replace(/strong positive/gi, canonicalSentiment)
    guardedCopy.nextEventNarrative = guardedCopy.nextEventNarrative.replace(/strong positive/gi, canonicalSentiment)
    guardedCopy.findingNarratives = guardedCopy.findingNarratives.map((item) => ({
      ...item,
      narrative: item.narrative.replace(/strong positive/gi, canonicalSentiment),
    }))
  }
  return deduplicateEditorialSentences(editorialCopySchema.parse(guardedCopy), input)
}

export function buildEventClosingBriefEditorialFallback(
  input: EventClosingBriefEditorialInput,
  now = new Date(),
): EventClosingBriefEditorial {
  const inputHash = stableInputHash(input)
  const worked = input.findings.whatWorked.map((finding) => finding.title).slice(0, 2)
  const friction = input.findings.friction.map((finding) => finding.title).slice(0, 2)
  const next = input.findings.nextEvent.map((finding) => finding.title).slice(0, 2)
  const coreEditorial = synthesizeEventEditorial({
    lifecycle: 'POST_EVENT',
    eventName: input.event.name,
    facts: closingBriefEditorialFacts(input),
  })
  const whatWorkedNarrative = worked.length
    ? `The strongest positive feedback centered on ${naturalList(worked.map(lowerLead))}.`
    : 'No clear strength pattern has emerged from the current evidence.'
  const frictionNarrative = friction.length
    ? `The clearest friction involved ${naturalList(friction.map(lowerLead))}.`
    : 'No recurring source of friction was established in the current evidence.'
  const nextEventNarrative = next.length
    ? `Next-event planning should revisit ${naturalList(next.map(lowerLead))}.`
    : 'No evidence-backed next-event priority has emerged yet.'
  const coverageNarrative = groundedCoverageNarrative(input)

  return {
    source: 'fallback',
    provider: null,
    model: null,
    promptVersion: EVENT_CLOSING_BRIEF_EDITORIAL_PROMPT_VERSION,
    inputHash,
    generatedAt: now.toISOString(),
    cacheHit: false,
    copy: {
      headline: coreEditorial.headline,
      executiveSummary: coreEditorial.synopsis,
      keyTakeaway: coreEditorial.keyTakeaway,
      whatWorkedNarrative,
      frictionNarrative,
      nextEventNarrative,
      coverageNarrative,
      findingNarratives: input.findings.keyFindings.map((finding) => ({
        findingId: finding.id,
        narrative: removeMechanicalFindingLead(fallbackFindingNarrative(finding)),
      })),
    },
  }
}

function promptFor(input: EventClosingBriefEditorialInput, validationFeedback?: string): string {
  return `Write the post-event JSON payload for SignalThread's canonical Event Intelligence editorial engine.

Return ONLY this JSON object:
{
  "headline": "one executive headline",
  "executiveSummary": "three to five sentence whole-event executive synopsis",
  "keyTakeaway": "one concise leadership takeaway",
  "whatWorkedNarrative": "one concise paragraph or empty string",
  "frictionNarrative": "one concise paragraph or empty string",
  "nextEventNarrative": "one concise paragraph or empty string",
  "coverageNarrative": "one concise limitation sentence",
  "findingNarratives": [{ "findingId": "the exact canonical finding ID", "narrative": "one or two grounded sentences" }]
}

${eventEditorialWritingRules('POST_EVENT')}

Closing-brief requirements:
- Use the headline, executiveSummary, and keyTakeaway to tell one coherent leadership story. Do not turn the brief into a findings dump.
- Build executiveSummary from multiple major evidence clusters when they are available; it must not collapse to the first key finding and first risk.
- Reflect the supplied balance of strengths and friction. Do not call the event successful unless a canonical finding says so.
- Return one findingNarratives entry for every supplied key finding, using its exact ID. Keep each narrative within that finding's supplied statement and evidence; no invented causes, quotes, or action plans.
- Treat EMERGING findings as early or directional. Empty groups remain empty or say that no recurring pattern was established.
- Keep coverageNarrative factual and brief; metrics are shown elsewhere.

Structured canonical intelligence:
${JSON.stringify(input)}${validationFeedback ? `

The previous draft was rejected by grounding validation for this reason:
${validationFeedback}
Return a corrected draft that follows every rule.` : ''}`
}

async function writeWithOpenAI(
  input: EventClosingBriefEditorialInput,
  context: { model: string; promptVersion: string; validationFeedback?: string },
): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })
  const response = await client.chat.completions.create({
    model: context.model,
    messages: [
      {
        role: 'system',
        content: 'You are an evidence-disciplined event strategist and executive editor. Return valid JSON only.',
      },
      { role: 'user', content: promptFor(input, context.validationFeedback) },
    ],
    ...(context.model === 'gpt-5.6-sol' ? {} : { temperature: 0.35 }),
    max_completion_tokens: 2200,
    response_format: { type: 'json_object' },
  })
  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Closing Brief editorial response was empty')
  return JSON.parse(content)
}

function validateEditorialCopy(raw: unknown, input: EventClosingBriefEditorialInput): EventClosingBriefEditorialCopy {
  const copy = editorialCopySchema.parse(raw)
  const expectedIds = input.findings.keyFindings.map((finding) => finding.id)
  const actualIds = copy.findingNarratives.map((finding) => finding.findingId)
  if (new Set(actualIds).size !== actualIds.length) {
    throw new Error('Editorial prose returned duplicate finding narrative IDs.')
  }
  const unknownIds = actualIds.filter((id) => !expectedIds.includes(id))
  if (unknownIds.length > 0) {
    throw new Error(`Editorial prose introduced unknown finding IDs: ${unknownIds.join(', ')}`)
  }
  const inputById = new Map(input.findings.keyFindings.map((finding) => [finding.id, finding]))
  const completedCopy = {
    ...copy,
    findingNarratives: [
      ...copy.findingNarratives,
      ...input.findings.keyFindings
        .filter((finding) => !actualIds.includes(finding.id))
        .map((finding) => ({ findingId: finding.id, narrative: removeMechanicalFindingLead(fallbackFindingNarrative(finding)) })),
    ],
  }
  for (const item of completedCopy.findingNarratives) {
    const finding = inputById.get(item.findingId)
    if (finding?.evidenceTier === 'EMERGING' && !/\b(early|emerging|some|a few|initial|limited|directional|suggests?|indicates?|points? to|may|could)\b/i.test(item.narrative)) {
      item.narrative = removeMechanicalFindingLead(fallbackFindingNarrative(finding))
    }
  }
  assertGroundedNumbers(completedCopy, input)
  return applyEditorialGuardrails(completedCopy, input)
}

async function readCachedEditorial(
  cache: EventClosingBriefEditorialCache | null,
  key: string,
  inputHash: string,
): Promise<EventClosingBriefEditorial | null> {
  const memory = memoryCache.get(key)
  if (memory?.inputHash === inputHash) return { ...memory, cacheHit: true }
  if (!cache) return null
  const parsed = editorialCacheRecordSchema.safeParse(await cache.get(key))
  if (!parsed.success || parsed.data.inputHash !== inputHash) return null
  const editorial: EventClosingBriefEditorial = { ...parsed.data, cacheHit: true }
  memoryCache.set(key, editorial)
  return editorial
}

export async function synthesizeEventClosingBriefEditorial(
  input: EventClosingBriefEditorialInput,
  options: SynthesizeOptions = {},
): Promise<EventClosingBriefEditorial> {
  const now = options.now ?? new Date()
  const fallback = buildEventClosingBriefEditorialFallback(input, now)
  const key = cacheKey(input, fallback.inputHash)
  const cache = options.cache === undefined ? objectStorageCache() : options.cache

  if (!options.forceRefresh) {
    const cached = await readCachedEditorial(cache ?? null, key, fallback.inputHash)
    if (cached) return cached
    const pending = pendingEditorial.get(key)
    if (pending) return pending
  }

  const writer = options.writer ?? writeWithOpenAI
  const externalProvidersDisabled = process.env.EVENTS_TEST_DISABLE_EXTERNAL_PROVIDERS === '1'
  if ((!process.env.OPENAI_API_KEY?.trim() || externalProvidersDisabled) && !options.writer) {
    return fallback
  }

  const generation = (async () => {
    try {
      const context = {
        model: EVENT_CLOSING_BRIEF_EDITORIAL_MODEL,
        promptVersion: EVENT_CLOSING_BRIEF_EDITORIAL_PROMPT_VERSION,
      }
      const raw = await writer(input, context)
      let copy: EventClosingBriefEditorialCopy
      try {
        copy = validateEditorialCopy(raw, input)
      } catch (validationError) {
        if (options.writer) throw validationError
        const corrected = await writer(input, {
          ...context,
          validationFeedback: validationError instanceof Error ? validationError.message : String(validationError),
        })
        copy = validateEditorialCopy(corrected, input)
      }
      const editorial: EventClosingBriefEditorial = {
        source: 'openai',
        provider: 'openai',
        model: EVENT_CLOSING_BRIEF_EDITORIAL_MODEL,
        promptVersion: EVENT_CLOSING_BRIEF_EDITORIAL_PROMPT_VERSION,
        inputHash: fallback.inputHash,
        generatedAt: now.toISOString(),
        cacheHit: false,
        copy,
      }
      memoryCache.set(key, editorial)
      await cache?.set(key, {
        source: editorial.source,
        provider: editorial.provider,
        model: editorial.model,
        promptVersion: editorial.promptVersion,
        inputHash: editorial.inputHash,
        generatedAt: editorial.generatedAt,
        copy: editorial.copy,
      })
      return editorial
    } catch (error) {
      console.warn(
        '[EventClosingBriefEditorial] Falling back to deterministic editorial copy:',
        error instanceof Error ? error.message : String(error),
      )
      return fallback
    } finally {
      pendingEditorial.delete(key)
    }
  })()

  if (!options.forceRefresh) pendingEditorial.set(key, generation)
  return generation
}

export function clearEventClosingBriefEditorialMemoryCacheForTests() {
  memoryCache.clear()
  pendingEditorial.clear()
}
