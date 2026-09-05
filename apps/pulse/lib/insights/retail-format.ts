/**
 * Retail-ready action phrasing: short, imperative, blunt.
 * Transforms verbose GPT/corporate action text into operator commands.
 */

const MAX_CHARS = 120

/** Leading patterns to replace (order matters) */
const LEADING_REPLACEMENTS: [RegExp, string][] = [
  [/^Look into and\s+/i, ''],
  [/^Investigate and\s+/i, ''],
  [/^Improve\s+/i, 'Fix '],
  [/^Reinforce\s+/i, 'Enforce '],
  [/^Optimize\s+/i, 'Streamline '],
]

/** Phrases to remove entirely */
const PHRASE_REMOVALS = [
  { re: /\s+with focused action items/gi, repl: '' },
  { re: /\s+the root cause of\s*/gi, repl: ' ' },
  { re: /\bprocesses\b/gi, repl: '' },
]

/** Trailing clause patterns (strip everything from here to end) */
const TRAILING_PATTERNS = [
  /\s+to\s+ensure\s+.+/i,
  /\s+in\s+order\s+to\s+.+/i,
  /\s+to\s+improve\s+.+/i,
  /\s+so\s+that\s+.+/i,
  /\s+and\s+assign[^.]*/i,
]

/** Phrase rewrites: corporate → retail imperative (order matters: more specific first) */
const PHRASE_REWRITES: [RegExp, string][] = [
  [/identify\s+(?:the\s+)?top\s+complaint\s+drivers\s+and\s+assign\s+an\s+owner\s+to\s+fix\s+them/i, 'Fix top complaint drivers'],
  [/do\s+staff\s+training\s+on\s+customer\s+service\s+excellence/i, 'Retrain staff on friendliness'],
  [/implement\s+a\s+regular\s+cleaning\s+schedule\s+to\s+improve\s+store\s+cleanliness/i, 'Enforce daily cleaning standards'],
  [/implement\s+regular\s+cleaning\s+schedule/i, 'Enforce daily cleaning standards'],
  [/improve\s+cleaning\s+cadence\s+and\s+add\s+spot\s+checks\s+during\s+busy\s+hours/i, 'Add spot checks during busy hours'],
  [/reinforce\s+service\s+standards\s+and\s+coach\s+shifts\s+with\s+repeated\s+issues/i, 'Coach shifts with repeat issues'],
  [/reduce\s+wait\s+times\s+by\s+adjusting\s+staffing\s+during\s+peak\s+periods/i, 'Adjust staffing during peak periods'],
  [/tighten\s+quality\s+checks\s+and\s+review\s+recurring\s+defects\s+weekly/i, 'Review recurring defects weekly'],
  [/review\s+pricing\s+perception\s+and\s+test\s+value\s+messaging\s+or\s+bundles/i, 'Test value messaging or bundles'],
  [/reduce\s+errors\s+by\s+adding\s+an\s+order\s+accuracy\s+step\s+at\s+handoff/i, 'Add order accuracy step at handoff'],
  [/clarify\s+customer\s+communication\s+and\s+standardize\s+what\s+staff\s+says/i, 'Standardize staff communication'],
]

/**
 * Convert verbose GPT action text into short, imperative retail phrasing.
 * Applied to action-based opportunities only (not themes).
 * - No word cap; aggressive leading/trailing cleanup
 * - If result exceeds 120 chars, trim and add "…"
 */
export function retailFormatAction(text: string): string {
  if (!text || typeof text !== 'string') return ''
  let s = text.trim()

  // Remove trailing punctuation and extra whitespace
  s = s.replace(/[.;,]\s*$/, '').trim()
  s = s.replace(/\s+/g, ' ').trim()

  // Check phrase rewrites first (exact or near-match)
  for (const [pattern, replacement] of PHRASE_REWRITES) {
    if (pattern.test(s)) return applyCharTrim(replacement)
  }

  // Apply leading replacements (worst offenders)
  for (const [pattern, replacement] of LEADING_REPLACEMENTS) {
    s = s.replace(pattern, replacement)
  }

  // Remove bad phrases
  for (const { re, repl } of PHRASE_REMOVALS) {
    s = s.replace(re, repl)
  }

  // Strip trailing explanatory clauses
  for (const re of TRAILING_PATTERNS) {
    s = s.replace(re, '').trim()
  }

  // Collapse whitespace again
  s = s.replace(/\s+/g, ' ').trim()

  // Capitalize first letter
  if (s.length > 0) {
    s = s.charAt(0).toUpperCase() + s.slice(1)
  }

  return applyCharTrim(s)
}

function applyCharTrim(s: string): string {
  const trimmed = s.trim()
  if (trimmed.length <= MAX_CHARS) return trimmed
  return trimmed.slice(0, MAX_CHARS).trim() + '…'
}
