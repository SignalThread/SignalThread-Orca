import type { FetchedData } from '@/lib/analytics/signals'
import { normalizeThemeKey } from '@/lib/insights/theme-keys'

const NEUTRAL_SENTIMENT_LOW = -0.3
const NEUTRAL_SENTIMENT_HIGH = 0.3

export function sentimentBucket(score: number | null): 'positive' | 'negative' | 'neutral' {
  if (score === null || score === undefined) return 'neutral'
  if (score > NEUTRAL_SENTIMENT_HIGH) return 'positive'
  if (score < NEUTRAL_SENTIMENT_LOW) return 'negative'
  return 'neutral'
}

const STRONG_SENTIMENT_ABS = 0.38

/** Readable label for UI (no numeric score): Positive / Negative / Mixed / … Strong signal */
export function representativeQuoteSentimentLabel(
  bucket: 'positive' | 'negative' | 'neutral',
  sentimentScore: number | null,
): string {
  const mixed = bucket === 'neutral'
  const base = mixed ? 'Mixed' : bucket === 'positive' ? 'Positive' : 'Negative'
  const s = sentimentScore != null ? Math.abs(sentimentScore) : 0
  if (s >= STRONG_SENTIMENT_ABS) {
    return mixed ? 'Mixed · Strong signal' : `${base} · Strong signal`
  }
  return base
}

/**
 * Answers in the window whose analysis themes include this normalized key.
 */
export function collectAnswerIdsForThemeKey(
  responses: FetchedData['responses'],
  themeKey: string
): string[] {
  const ids: string[] = []
  for (const r of responses) {
    if (r.status !== 'COMPLETED') continue
    for (const answer of r.answers) {
      const themes = answer.answerAnalysis?.themesJson?.themes
      if (!Array.isArray(themes)) continue
      const hit = themes.some((t) => typeof t === 'string' && normalizeThemeKey(t) === themeKey)
      if (hit) ids.push(answer.id)
    }
  }
  return ids
}

/**
 * Answers whose structured action items match the opportunity (raw text from signals).
 */
export function collectAnswerIdsForActionOpportunity(
  responses: FetchedData['responses'],
  rawOpportunityText: string
): string[] {
  const key = normalizeThemeKey(rawOpportunityText)
  const lower = rawOpportunityText.toLowerCase().trim()
  const ids: string[] = []
  for (const r of responses) {
    if (r.status !== 'COMPLETED') continue
    for (const answer of r.answers) {
      const actions = answer.answerAnalysis?.actionsJson?.actionItems
      if (!Array.isArray(actions)) continue
      const hit = actions.some((action) => {
        const text = typeof action === 'string' ? action : action?.text
        if (!text || typeof text !== 'string') return false
        return normalizeThemeKey(text) === key || text.toLowerCase().trim() === lower
      })
      if (hit) ids.push(answer.id)
    }
  }
  return ids
}
