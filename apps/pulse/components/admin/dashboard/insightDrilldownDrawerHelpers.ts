import type { InsightDrilldownAnswerRow, InsightDrilldownPayload } from '@/lib/insights/drilldown'

const STOP = new Set(
  `a an the and or but if in on at to for of as is was are were been be have has had it this that these those with from by not no yes so than then too very can could should would about into over after before when what which who how all any each every both few more most other some such only same just also back even only out up down than`.split(
    /\s+/
  )
)

/** Weak / noisy tokens to deprioritize as “drivers” (not full stopwords). */
const JUNK_DRIVERS = new Set(
  `just like really thing things something people because going there here they them that this have been were good bad nice well also much more very some time times said say got get going`.split(
    /\s+/
  )
)

export type ImpactLevel = 'High' | 'Medium' | 'Low'

export function computeImpactBadge(
  total: number,
  breakdown: InsightDrilldownPayload['sentimentBreakdown']
): ImpactLevel {
  const { positive, negative, neutral } = breakdown
  const sum = positive + negative + neutral || 1
  const negRatio = negative / sum
  const posRatio = positive / sum
  if (total >= 14 || negRatio >= 0.42) return 'High'
  if (total >= 6 || negRatio >= 0.22 || (total >= 4 && posRatio >= 0.55)) return 'Medium'
  return 'Low'
}

export function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
}

/** Top words across transcripts (proxy for co-occurring themes), excluding insight title tokens. */
export function topDriverWords(
  rows: InsightDrilldownAnswerRow[],
  excludeTokens: Set<string>,
  limit = 5
): { word: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const t = row.transcriptText
    if (!t) continue
    const seen = new Set<string>()
    for (const w of tokenizeWords(t)) {
      if (w.length < 5 || JUNK_DRIVERS.has(w)) continue
      if (excludeTokens.has(w)) continue
      if (seen.has(w)) continue
      seen.add(w)
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }))
}

export function buildExcludeTokensFromInsight(insight: InsightDrilldownPayload['insight']): Set<string> {
  const s = new Set<string>()
  for (const w of tokenizeWords(`${insight.themeKey} ${insight.title}`)) {
    s.add(w)
  }
  return s
}

/**
 * Representative quotes: strongest signals by absolute sentiment (not “positive-only”).
 * Border color reflects actual bucket.
 */
export function pickRepresentativeQuotes(rows: InsightDrilldownAnswerRow[], limit = 3): InsightDrilldownAnswerRow[] {
  const withText = rows.filter((r) => (r.transcriptText ?? '').trim().length > 8)
  return [...withText]
    .sort((a, b) => {
      const ma = Math.abs(a.sentimentScore ?? 0)
      const mb = Math.abs(b.sentimentScore ?? 0)
      if (mb !== ma) return mb - ma
      return (b.transcriptText?.length ?? 0) - (a.transcriptText?.length ?? 0)
    })
    .slice(0, limit)
}

export function buildHighlightTerms(
  insight: InsightDrilldownPayload['insight'],
  driverWords: { word: string }[],
  extraTerms?: string[]
): string[] {
  const terms = new Set<string>()
  for (const w of tokenizeWords(`${insight.themeKey} ${insight.title}`)) {
    if (w.length >= 3) terms.add(w)
  }
  for (const d of driverWords.slice(0, 4)) {
    if (d.word.length >= 3) terms.add(d.word)
  }
  if (extraTerms) {
    for (const t of extraTerms) {
      if (t.trim().length >= 2) terms.add(t.trim())
    }
  }
  return [...terms].sort((a, b) => b.length - a.length)
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type ActiveFilterSnapshot = {
  sentiment: 'all' | 'positive' | 'negative' | 'neutral'
  questionKey: string
  questionLabel: string | null
  dateFrom: string
  dateTo: string
  /** Single day when from === to (chart + range aligned) */
  selectedDay: string | null
  textContains: string
}

export function buildResultsSummary(total: number, f: ActiveFilterSnapshot): string {
  const head = `Showing ${total} response${total === 1 ? '' : 's'}`
  const bits: string[] = []

  if (f.sentiment !== 'all') {
    const label =
      f.sentiment === 'positive'
        ? 'positive'
        : f.sentiment === 'negative'
          ? 'negative'
          : 'neutral'
    bits.push(`${label} sentiment`)
  }

  if (f.questionKey && f.questionLabel) {
    const short =
      f.questionLabel.length > 42 ? `${f.questionLabel.slice(0, 40)}…` : f.questionLabel
    bits.push(`for “${short}”`)
  }

  if (f.textContains.trim()) {
    bits.push(`mentioning “${f.textContains.trim()}”`)
  }

  if (f.selectedDay) {
    const d = new Date(f.selectedDay + 'T12:00:00')
    const fmt = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    bits.push(`on ${fmt}`)
  } else if (f.dateFrom || f.dateTo) {
    const a = f.dateFrom
      ? new Date(f.dateFrom + 'T12:00:00').toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '…'
    const b = f.dateTo
      ? new Date(f.dateTo + 'T12:00:00').toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '…'
    bits.push(`from ${a} to ${b}`)
  }

  if (bits.length === 0) return head
  return `${head} · ${bits.join(' · ')}`
}

/** Per-day sentiment mix from a sample of rows (max 100 from API). Mix may be incomplete for busy days. */
export function buildDailyMixFromRows(
  rows: InsightDrilldownAnswerRow[]
): Map<string, { positive: number; negative: number; neutral: number }> {
  const map = new Map<string, { positive: number; negative: number; neutral: number }>()
  for (const r of rows) {
    const day = r.responseStartedAt.slice(0, 10)
    const cur = map.get(day) ?? { positive: 0, negative: 0, neutral: 0 }
    cur[r.sentimentBucket]++
    map.set(day, cur)
  }
  return map
}
