/**
 * Single source of truth for theme key normalization and display.
 * Used by signals and Key Insights to ensure deterministic deduplication.
 */

/**
 * Normalize theme key for grouping (lowercase, trim, collapse whitespace, strip punctuation).
 * This is the ONLY key used for deduplication.
 */
export function normalizeThemeKey(theme: string): string {
  return (
    theme
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s-]/g, '')
  )
}

/**
 * Derive canonical display name from normalized key (title-case).
 * Never use raw theme strings for display once merged.
 */
export function toDisplayName(normalizedKey: string): string {
  if (!normalizedKey.trim()) return ''
  return normalizedKey
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
