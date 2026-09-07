/**
 * Key Insights theme deduplication and classification.
 * Ensures each theme appears in exactly one section (What's Working or Opportunities to Improve).
 * Uses normalized key as ONLY grouping key; displayName derived from key only.
 */

import type { ThemeSentimentItem, OpportunityItem } from '@/lib/analytics/signals'
import { normalizeThemeKey, toDisplayName } from './theme-keys'
import { retailFormatAction } from './retail-format'

export interface WorkingThemeCard {
  key: string
  displayName: string
  positiveMentions: number
}

export interface OpportunityThemeCard {
  key: string
  displayName: string
  text: string
  impactScore: 1 | 2 | 3
  priority: 'High' | 'Medium' | 'Low'
  negativeMentions: number
  isAction: boolean
}

export interface ClassifiedInsights {
  working: WorkingThemeCard[]
  opportunities: OpportunityThemeCard[]
}

/**
 * Classify themes into working (green) vs opportunities (yellow).
 * Each theme appears in exactly one section.
 */
export function classifyKeyInsights(
  themeSentimentBreakdown: ThemeSentimentItem[],
  opportunities: OpportunityItem[],
  humanizeAction: (text: string) => string
): ClassifiedInsights {
  const themeByKey = new Map<string, ThemeSentimentItem>()
  for (const t of themeSentimentBreakdown) {
    themeByKey.set(t.key, t)
  }

  const working: WorkingThemeCard[] = []
  const opportunitiesOut: OpportunityThemeCard[] = []
  const seenKeys = new Set<string>()

  // 1. Classify each theme from sentiment breakdown (one per key - iterate map to guarantee)
  for (const [key, t] of themeByKey.entries()) {
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    const displayName = toDisplayName(key)
    const { positiveMentions, negativeMentions } = t

    // negative > positive => OPPORTUNITIES (only if recommendation is specific, not generic)
    if (negativeMentions > positiveMentions) {
      const text = buildOpportunityRecommendation(key)
      if (!isGenericOpportunityText(text)) {
        opportunitiesOut.push({
          key,
          displayName,
          text,
          impactScore: 2,
          priority: 'Medium',
          negativeMentions,
          isAction: false,
        })
      }
      continue
    }

    // positive > negative => WHAT'S WORKING
    if (positiveMentions > negativeMentions) {
      working.push({
        key,
        displayName,
        positiveMentions,
      })
      continue
    }

    // Tie or no pos/neg: default to yellow if any negatives (only if specific), otherwise green
    if (negativeMentions > 0) {
      const text = buildOpportunityRecommendation(key)
      if (!isGenericOpportunityText(text)) {
        opportunitiesOut.push({
          key,
          displayName,
          text,
          impactScore: 2,
          priority: 'Medium',
          negativeMentions,
          isAction: false,
        })
      }
    } else {
      working.push({
        key,
        displayName,
        positiveMentions: positiveMentions || t.totalMentions,
      })
    }
  }

  // 2. Add opportunity items that are actions (not themes) or themes not in breakdown
  for (const opp of opportunities) {
    const key = normalizeThemeKey(opp.text)
    if (seenKeys.has(key)) continue

    const themeItem = themeByKey.get(key)
    if (themeItem) {
      continue
    }

    seenKeys.add(key)
    const displayName = toDisplayName(key)
    const rawText = humanizeAction(opp.text) || displayName
    const displayText = retailFormatAction(rawText) || rawText
    opportunitiesOut.push({
      key,
      displayName: displayText,
      text: displayText,
      impactScore: opp.impactScore,
      priority: opp.priority,
      negativeMentions: 0,
      isAction: true,
    })
  }

  // 3. Stable sort
  working.sort((a, b) => b.positiveMentions - a.positiveMentions)
  opportunitiesOut.sort((a, b) => {
    const negDiff = b.negativeMentions - a.negativeMentions
    if (negDiff !== 0) return negDiff
    return (b.impactScore ?? 0) - (a.impactScore ?? 0)
  })

  const result = { working, opportunities: opportunitiesOut }
  assertNoDuplicates(result)
  return result
}

/** Generic/meta opportunity phrases—silence is better than filler. Case-insensitive. */
const GENERIC_OPPORTUNITY_PATTERNS = [
  'identify the top',
  'assign an owner',
  'complaint drivers',
  'focused action items',
  'review and update',
  'introduce a feedback system',
  'conduct regular staff meetings',
  'reinforce service standards',
]

/**
 * Returns true if the text is generic "meta" advice (process/assign owner) rather than a concrete fix.
 * Used to filter theme-based opportunities—only show when we have a specific recommendation.
 */
export function isGenericOpportunityText(text: string): boolean {
  if (!text || typeof text !== 'string') return true
  const lower = text.toLowerCase().trim()
  return GENERIC_OPPORTUNITY_PATTERNS.some((pattern) => lower.includes(pattern))
}

/**
 * Deterministic global rules engine for opportunity recommendation text.
 * Matches keywords in priority order; returns tight, operational sentences.
 */
export function buildOpportunityRecommendation(themeKey: string): string {
  const normalized = normalizeThemeKey(themeKey)
  if (!normalized) return 'Create action items and assign an owner.'

  const rules: { keywords: string[]; recommendation: string }[] = [
    { keywords: ['wait', 'line', 'slow', 'speed', 'delay'], recommendation: 'Reduce wait times by adjusting staffing during peak periods.' },
    { keywords: ['staff', 'employee', 'rude', 'friendliness', 'attitude', 'service'], recommendation: 'Reinforce service standards and coach shifts with repeated issues.' },
    { keywords: ['quality', 'product', 'food', 'drink', 'consistency', 'incorrect'], recommendation: 'Tighten quality checks and review recurring defects weekly.' },
    { keywords: ['cleanliness', 'dirty', 'bathroom', 'mess'], recommendation: 'Improve cleaning cadence and add spot checks during busy hours.' },
    { keywords: ['price', 'expensive', 'cost', 'value'], recommendation: 'Review pricing perception and test value messaging or bundles.' },
    { keywords: ['accuracy', 'wrong', 'mistake', 'order'], recommendation: 'Reduce errors by adding an order accuracy step at handoff.' },
    { keywords: ['communication', 'unclear', 'confusion'], recommendation: 'Clarify customer communication and standardize what staff says.' },
    { keywords: ['satisfaction', 'unhappy', 'disappointed', 'dissatisfaction'], recommendation: 'Identify the top complaint drivers and assign an owner to fix them.' },
  ]

  for (const { keywords, recommendation } of rules) {
    if (keywords.some((kw) => normalized.includes(kw))) {
      return recommendation
    }
  }

  const displayName = toDisplayName(normalized)
  return `Improve ${displayName} with focused action items.`
}

/**
 * @internal Dev/test validation for deterministic recommendation output.
 * Intentionally opt-in so it never crashes normal app rendering.
 */
export function runOpportunityRecommendationTests(): void {
  const shouldRun =
    process.env.NODE_ENV === 'test' ||
    (process.env.NODE_ENV === 'development' && process.env.RUN_INSIGHTS_RUNTIME_TESTS === 'true')
  if (!shouldRun) return
  if (typeof window !== 'undefined') return

  const cases: [string, string][] = [
    ['wait time', 'Reduce wait times by adjusting staffing during peak periods.'],
    ['long line', 'Reduce wait times by adjusting staffing during peak periods.'],
    ['slow service', 'Reduce wait times by adjusting staffing during peak periods.'],
    ['staff friendliness', 'Reinforce service standards and coach shifts with repeated issues.'],
    ['rude employee', 'Reinforce service standards and coach shifts with repeated issues.'],
    ['food quality', 'Tighten quality checks and review recurring defects weekly.'],
    ['dirty bathroom', 'Improve cleaning cadence and add spot checks during busy hours.'],
    ['expensive', 'Review pricing perception and test value messaging or bundles.'],
    ['order accuracy', 'Reduce errors by adding an order accuracy step at handoff.'],
    ['customer satisfaction', 'Identify the top complaint drivers and assign an owner to fix them.'],
    ['unclear communication', 'Clarify customer communication and standardize what staff says.'],
    ['unknown theme xyz', 'Improve Unknown Theme Xyz with focused action items.'],
  ]

  for (const [input, expected] of cases) {
    const got = buildOpportunityRecommendation(input)
    if (got !== expected) {
      throw new Error(`[OpportunityRecommendation] For "${input}": expected "${expected}" but got "${got}"`)
    }
  }
}

// Intentionally safe by default: executes only when explicitly enabled.
runOpportunityRecommendationTests()

/**
 * Dev assertion: no theme in both sections, no duplicates within section.
 * Throws if duplicates exist after normalization.
 */
export function assertNoDuplicates(insights: ClassifiedInsights): void {
  if (process.env.NODE_ENV !== 'development') return

  const workingKeys = new Set<string>()
  for (const w of insights.working) {
    if (workingKeys.has(w.key)) {
      throw new Error(`[Key Insights] Duplicate in working section: ${w.key}`)
    }
    workingKeys.add(w.key)
  }

  const oppKeys = new Set<string>()
  for (const o of insights.opportunities) {
    if (oppKeys.has(o.key)) {
      throw new Error(`[Key Insights] Duplicate in opportunities section: ${o.key}`)
    }
    oppKeys.add(o.key)
  }

  for (const k of workingKeys) {
    if (oppKeys.has(k)) {
      throw new Error(`[Key Insights] Theme in both sections: ${k}`)
    }
  }
}
