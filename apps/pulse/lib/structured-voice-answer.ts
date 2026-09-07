import { QuestionType } from '@prisma/client'

export type StructuredVoiceParseResult =
  | { ok: true; numericValue: number; label: string }
  | { ok: false; reason: 'AMBIGUOUS' | 'INVALID'; message: string }

export function isStructuredVoiceQuestionType(type: QuestionType | string): boolean {
  return type === QuestionType.RATING_1_TO_5
    || type === QuestionType.RECOMMENDATION_0_TO_10
    || type === QuestionType.YES_NO
    || type === QuestionType.SINGLE_CHOICE
    || type === QuestionType.SPEAKER_FEEDBACK
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function numericCandidates(transcript: string): number[] {
  const tokens = normalize(transcript).split(' ').filter(Boolean)
  const values = tokens.flatMap((token) => {
    if (token in NUMBER_WORDS) return [NUMBER_WORDS[token]]
    if (/^\d{1,2}$/.test(token)) return [Number(token)]
    return []
  })
  return [...new Set(values)]
}

function invalid(message: string): StructuredVoiceParseResult {
  return { ok: false, reason: 'INVALID', message }
}

/**
 * Deterministic structured parsing only. This deliberately has no model or
 * free-text analysis fallback: zero or multiple valid values means retry.
 */
export function parseStructuredVoiceAnswer(input: {
  type: QuestionType | string
  transcript: string
  options?: string[]
}): StructuredVoiceParseResult {
  const transcript = normalize(input.transcript)
  if (!transcript) return invalid('We did not hear an answer. Please answer again.')

  if (input.type === QuestionType.YES_NO) {
    const affirmative = new Set(['yes', 'yeah', 'yep', 'yup', 'affirmative'])
    const negative = new Set(['no', 'nope', 'nah', 'negative'])
    const tokens = transcript.split(' ')
    const hasYes = tokens.some((token) => affirmative.has(token))
    const hasNo = tokens.some((token) => negative.has(token))
    if (hasYes === hasNo) {
      return {
        ok: false,
        reason: hasYes ? 'AMBIGUOUS' : 'INVALID',
        message: 'Please answer clearly with yes or no.',
      }
    }
    return hasYes
      ? { ok: true, numericValue: 1, label: 'Yes' }
      : { ok: true, numericValue: 0, label: 'No' }
  }

  if (input.type === QuestionType.SINGLE_CHOICE) {
    if (transcript.split(' ').includes('not')) {
      return invalid('Please say one of the available option names.')
    }
    const options = (input.options ?? []).map((option, index) => ({ index, label: option, normalized: normalize(option) }))
    const matches = options.filter((option) => option.normalized && (
      transcript === option.normalized
      || ` ${transcript} `.includes(` ${option.normalized} `)
    ))
    if (matches.length !== 1) {
      return {
        ok: false,
        reason: matches.length > 1 ? 'AMBIGUOUS' : 'INVALID',
        message: 'Please say one of the available option names.',
      }
    }
    return { ok: true, numericValue: matches[0].index, label: matches[0].label }
  }

  const bounds = input.type === QuestionType.RECOMMENDATION_0_TO_10
    ? { min: 0, max: 10, label: '0–10' }
    : input.type === QuestionType.RATING_1_TO_5 || input.type === QuestionType.SPEAKER_FEEDBACK
      ? { min: 1, max: 5, label: '1–5' }
      : null
  if (!bounds) return invalid('This question does not accept a structured voice answer.')

  const candidates = numericCandidates(transcript)
  const candidate = candidates[0]
  if (candidates.length !== 1 || candidate < bounds.min || candidate > bounds.max) {
    return {
      ok: false,
      reason: candidates.length > 1 ? 'AMBIGUOUS' : 'INVALID',
      message: `Please say one number from ${bounds.min} to ${bounds.max}.`,
    }
  }
  const numericValue = candidate
  return { ok: true, numericValue, label: `${numericValue} / ${bounds.max}` }
}
