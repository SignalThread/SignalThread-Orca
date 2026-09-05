import type { EventEvidenceTier } from './evidence-model'

export type EventQuestionIntent = 'strength' | 'friction' | 'improvement' | 'neutral'

export interface EventFindingEvidenceSource {
  answerId: string
  responseId: string
  summary: string | null
  questionLabel: string | null
}

export interface PreEventFindingCopyInput {
  title: string
  statement: string | null
  kind: 'theme' | 'signal' | 'opportunity' | 'positive' | 'risk'
  recommendation: string | null
  evidenceText: string[]
}

export interface PreEventFindingCopy {
  title: string
  description: string
}

const GENERIC_THEME_KEYS = new Set([
  'general_positive_feedback',
  'general_other_feedback',
  'positive_experience',
  'good_event',
  'positive_feedback',
  'general_feedback',
])

export function normalizeFindingKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function isGenericFindingTheme(themeKey: string, label: string): boolean {
  const combined = normalizeFindingKey(`${themeKey} ${label}`)
  return [...GENERIC_THEME_KEYS].some((generic) => combined.includes(generic))
}

export function inferEventQuestionIntent(label: string | null | undefined): EventQuestionIntent {
  const normalized = label?.trim().toLowerCase() ?? ''
  if (!normalized) return 'neutral'
  if (/\b(change|improve|better|more|less|next time|next event|wish|want|missing|should|recommend)\b/.test(normalized)) {
    return 'improvement'
  }
  if (/\b(challenge|friction|problem|difficult|hard|confusing|frustrat|didn.t work|went wrong)\b/.test(normalized)) {
    return 'friction'
  }
  if (/\b(worked|valuable|value|best|enjoy|highlight|successful|liked|love)\b/.test(normalized)) {
    return 'strength'
  }
  return 'neutral'
}

function sentenceCandidates(summary: string): string[] {
  return summary
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function meaningfulThemeTokens(themeKey: string, label: string): string[] {
  if (isGenericFindingTheme(themeKey, label)) return []
  return normalizeFindingKey(label || themeKey)
    .split('_')
    .filter((token) => token.length >= 4 && !['with', 'from', 'that', 'this', 'event', 'feedback'].includes(token))
}

function candidateScore(candidate: string, tokens: string[], questionIntent: EventQuestionIntent): number {
  const normalized = candidate.toLowerCase()
  const tokenMatches = tokens.filter((token) => normalized.includes(token)).length
  const detailWords = candidate.split(/\s+/).filter((word) => word.length >= 6).length
  const improvementSignal = questionIntent === 'improvement' && /\b(more|less|would|should|could|wish|want|improv|change)\b/i.test(candidate)
  const frictionSignal = questionIntent === 'friction' && /\b(hard|difficult|crowd|unclear|slow|fast|problem|frustrat|confus)\b/i.test(candidate)
  return tokenMatches * 100 + Math.min(detailWords, 16) + (improvementSignal ? 20 : 0) + (frictionSignal ? 20 : 0)
}

function subjectForTier(tier: EventEvidenceTier): { subject: string; singular: boolean; consistent: boolean } {
  if (tier === 'ISOLATED') return { subject: 'One attendee', singular: true, consistent: false }
  if (tier === 'EMERGING') return { subject: 'A few attendees', singular: false, consistent: false }
  return { subject: 'Attendees', singular: false, consistent: true }
}

function rewriteEvidenceVoice(value: string, tier: EventEvidenceTier): string {
  const sentence = value.trim().replace(/^["']|["']$/g, '')
  const { subject, singular, consistent } = subjectForTier(tier)
  const adverb = consistent ? ' consistently' : ''
  const replacements: Array<[RegExp, string]> = [
    [/^I am\b/i, `${subject}${adverb} ${singular ? 'is' : 'are'}`],
    [/^I was\b/i, `${subject}${adverb} ${singular ? 'was' : 'were'}`],
    [/^I have\b/i, `${subject}${adverb} ${singular ? 'has' : 'have'}`],
    [/^I think\b/i, `${subject}${adverb} ${singular ? 'said' : 'said'}`],
    [/^I\b/i, `${subject}${adverb}`],
    [/^We are\b/i, `${subject}${adverb} ${singular ? 'is' : 'are'}`],
    [/^We were\b/i, `${subject}${adverb} ${singular ? 'was' : 'were'}`],
    [/^We have\b/i, `${subject}${adverb} ${singular ? 'has' : 'have'}`],
    [/^We\b/i, `${subject}${adverb}`],
    [/^Attendees\b/i, `${subject}${adverb}`],
  ]
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(sentence)) return sentence.replace(pattern, replacement)
  }

  const lower = sentence.charAt(0).toLowerCase() + sentence.slice(1)
  return `${subject}${adverb} reported that ${lower}`
}

function dominantQuestionIntent(sources: EventFindingEvidenceSource[]): EventQuestionIntent {
  const counts = new Map<EventQuestionIntent, number>()
  for (const source of sources) {
    const intent = inferEventQuestionIntent(source.questionLabel)
    counts.set(intent, (counts.get(intent) ?? 0) + 1)
  }
  return (['improvement', 'friction', 'strength', 'neutral'] as EventQuestionIntent[])
    .sort((left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0))[0]
}

export function synthesizeEventFinding(input: {
  themeKey: string
  label: string
  evidenceTier: EventEvidenceTier
  sources: EventFindingEvidenceSource[]
}): {
  statement: string | null
  questionIntent: EventQuestionIntent
  supportingAnswerIds: string[]
} {
  const sources = input.sources.filter((source) => source.answerId && source.responseId)
  const questionIntent = dominantQuestionIntent(sources)
  const tokens = meaningfulThemeTokens(input.themeKey, input.label)
  const candidates = sources.flatMap((source) => (
    source.summary
      ? sentenceCandidates(source.summary).map((sentence) => ({ sentence, source }))
      : []
  ))
  candidates.sort((left, right) => (
    candidateScore(right.sentence, tokens, questionIntent) - candidateScore(left.sentence, tokens, questionIntent)
    || right.sentence.length - left.sentence.length
    || left.source.answerId.localeCompare(right.source.answerId)
  ))

  return {
    statement: candidates[0] ? rewriteEvidenceVoice(candidates[0].sentence, input.evidenceTier) : null,
    questionIntent,
    supportingAnswerIds: [...new Set(sources.map((source) => source.answerId))],
  }
}

function cleanPreEventCopy(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '') ?? ''
}

function sentence(value: string): string {
  const clean = cleanPreEventCopy(value)
  return clean ? `${clean}.` : ''
}

function lowerLead(value: string): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value
}

function upperLead(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value
}

function attendeeVoice(value: string | null | undefined): string {
  return cleanPreEventCopy(value)
    .replace(/^attendees?\s+consistently\s+(?:reported|said|shared|noted)\s+(?:that\s+)?/i, '')
    .replace(/^attendees?\s+consistently\s+/i, 'Attendees ')
    .replace(/^i\s+prefer\b/i, 'Attendees prefer')
    .replace(/^i\s+(?:hope|want)\s+to\b/i, 'Attendees want to')
    .replace(/^i\s+(?:hope|want|need)\b/i, 'Attendees want')
    .replace(/^please\s+send\b/i, 'Attendees are asking for')
    .replace(/\bfor\s+(?:my|their)\s+team\s+because\s+(?:we|attendees)\s+need\b/gi, 'because teams need')
    .replace(/\bmy\s+team\b/gi, 'attendee teams')
    .replace(/\bmy\s+(role|goals?|learning goals?|experience level)\b/gi, 'their $1')
    .replace(/\bwe\s+need\b/gi, 'attendees need')
    .replace(/\bto me\b/gi, 'to attendees')
    .replace(/\bfor me\b/gi, 'for attendees')
}

function contentOverlap(left: string, right: string): number {
  const tokens = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3))
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  if (!leftTokens.size || !rightTokens.size) return 0
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / Math.min(leftTokens.size, rightTokens.size)
}

function detectedQuestionTopics(values: string[]): string[] {
  const text = values.join(' ').toLowerCase()
  const topics: Array<[RegExp, string]> = [
    [/\bgovernance|safeguard|responsible|human judgment\b/, 'governance'],
    [/\bmeasure|measurement|metric|roi|outcome\b/, 'measurement'],
    [/\badopt|rollout|introduc|change management\b/, 'adoption'],
    [/\bdata readiness|data-readiness|data quality\b/, 'data readiness'],
    [/\bcustomer experience|customer decision\b/, 'customer experience'],
  ]
  return topics.filter(([pattern]) => pattern.test(text)).map(([, label]) => label).slice(0, 4)
}

function naturalList(values: string[]): string {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function preEventHeadline(input: PreEventFindingCopyInput): string {
  const rawTitle = cleanPreEventCopy(input.title)
  const action = cleanPreEventCopy(input.recommendation || (input.kind === 'opportunity' ? rawTitle : ''))
  const claim = attendeeVoice(input.statement)
  const evidence = input.evidenceText.map(attendeeVoice).filter(Boolean)
  const grounding = `${rawTitle} ${action} ${claim} ${evidence.join(' ')}`.toLowerCase()
  const questions = input.evidenceText.filter((value) => value.trim().endsWith('?'))

  if (questions.length > 0 && /\bquestion|speaker|answer\b/i.test(grounding)) {
    const practical = /\bimplementation|use case|example|practice|rollout|adoption\b/i.test(grounding)
    const subject = /\bspeakers?\b/i.test(grounding) ? 'speakers' : 'the agenda'
    return sentence(`Attendees want ${subject} to answer ${practical ? 'practical implementation questions' : 'their priority questions'}`)
  }

  const briefMatch = action.match(/^brief\s+(?:the\s+)?speakers?\s+(?:on|about)\s+(.+)$/i)
  if (briefMatch) return sentence(`Speakers need an advance brief on attendees’ ${lowerLead(briefMatch[1])}`)

  const hostedMatch = action.match(/^(?:prepare|create|offer)\s+hosted\s+(.+)$/i)
  if (hostedMatch) return sentence(`Hosted ${lowerLead(hostedMatch[1])} would make attendee connections easier`)

  const guideMatch = action.match(/^(?:publish|create|send|provide)\s+(.+?guide)$/i)
  if (guideMatch) return sentence(`${upperLead(guideMatch[1])} would help attendees choose with confidence`)

  if (/\b(session|agenda)\b[\s\S]*\b(choice|choose|guide|path)\b|\b(choice|choose|guide|path)\b[\s\S]*\b(session|agenda)\b/i.test(grounding)) {
    return 'Attendees need clearer guidance to choose sessions that fit their goals.'
  }

  const valueMatch = claim.match(/^(.+?)\s+would make (?:the )?event (?:most )?(?:useful|valuable)/i)
  if (valueMatch) return sentence(`Attendees want ${lowerLead(valueMatch[1])}`)

  if (/^Attendees\s+(?:want|need|prefer|expect|are asking|prioritize|value)\b/i.test(claim)) {
    return sentence(claim.split(/,\s+(?:especially|particularly|and\s+a\b)/i)[0])
  }

  if (claim && /\b(?:want|need|prefer|expect|priority|valuable|important|help)\b/i.test(claim)) {
    return sentence(claim)
  }

  if (action) return sentence(`Organizers should ${lowerLead(action)}`)
  if (input.kind === 'positive') return sentence(`Attendees are most interested in ${lowerLead(rawTitle)}`)
  if (input.kind === 'risk' || input.kind === 'signal') return sentence(`Attendees need more clarity around ${lowerLead(rawTitle)}`)
  return sentence(`Attendees are prioritizing ${lowerLead(rawTitle)}`)
}

function preEventDescription(input: PreEventFindingCopyInput, headline: string): string {
  const rawTitle = cleanPreEventCopy(input.title)
  const action = cleanPreEventCopy(input.recommendation || (input.kind === 'opportunity' ? rawTitle : ''))
  const claim = attendeeVoice(input.statement)
  const evidence = input.evidenceText.map(attendeeVoice).filter(Boolean)
  const grounding = `${rawTitle} ${action} ${claim} ${evidence.join(' ')}`
  const questions = input.evidenceText.filter((value) => value.trim().endsWith('?'))

  if (questions.length > 0) {
    const topics = detectedQuestionTopics(questions)
    return topics.length > 0
      ? sentence(`Questions focus on ${naturalList(topics)}`)
      : 'Attendees are looking for answers they can apply to real decisions.'
  }

  if (/^brief\s+(?:the\s+)?speakers?\b/i.test(action)) {
    return 'Sharing attendee-authored questions before doors open will help speakers prepare more useful answers.'
  }

  if (/\bhosted\s+(network|networking|connection|match)/i.test(action)) {
    return /\b(first-time|facilitat|introduction|topic table|roundtable)\b/i.test(grounding)
      ? 'People favor facilitated introductions and topic-based groups over unstructured networking.'
      : 'A structured format would make it easier for attendees to find relevant peers.'
  }

  if (/^(?:publish|create|send|provide)\s+.+?guide$/i.test(action)) {
    return 'People want to compare sessions against their role, goals, and experience level before the event.'
  }

  if (/\b(session|agenda)\b[\s\S]*\b(choice|choose|guide|path)\b|\b(choice|choose|guide|path)\b[\s\S]*\b(session|agenda)\b/i.test(grounding)) {
    const dimensions = [
      /\brole\b/i.test(grounding) ? 'role' : null,
      /\bgoal\b/i.test(grounding) ? 'goals' : null,
      /\bexperience|introductory|advanced\b/i.test(grounding) ? 'experience level' : null,
    ].filter((value): value is string => Boolean(value))
    return sentence(`Several attendees are asking for clearer paths based on ${naturalList(dimensions.length ? dimensions : ['their needs'])}`)
  }

  const candidates = [...evidence, claim]
    .filter((value) => value && !value.endsWith('?'))
    .filter((value) => contentOverlap(value, headline) < 0.72)
  const supporting = candidates[0]
  if (supporting) return sentence(supporting)

  if (claim && contentOverlap(claim, headline) < 0.85) return sentence(claim)
  return input.kind === 'opportunity'
    ? 'This would turn a recurring attendee need into a concrete planning decision.'
    : 'The pattern is recurring strongly enough to influence the event plan.'
}

/**
 * Pre-event last-mile copy. Evidence selection and ranking happen upstream;
 * this function only turns an already-supported fact into organizer-ready copy.
 */
export function synthesizePreEventFindingCopy(input: PreEventFindingCopyInput): PreEventFindingCopy {
  const title = preEventHeadline(input)
  return {
    title,
    description: preEventDescription(input, title),
  }
}
