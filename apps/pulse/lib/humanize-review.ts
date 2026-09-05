/**
 * Post-processes an AI-generated analysis summary into natural,
 * first-person review text suitable for Google Reviews.
 *
 * Approach:
 * - NEVER allow meta-analysis language in output ("The customer...", "indicating...", etc).
 * - If meta phrases detected → rewrite to first-person template (rating-based).
 * - If text is clean and natural → preserve with light cleanup only.
 * - Target: 150–350 chars, 2–4 sentences, no invented specifics.
 *
 * @param text   - Raw summary from the analysis pipeline
 * @param rating - Optional 1–5 star rating (derived from sentimentScore if not given)
 *
 * ---
 * Example: Meta language → rewrite to first-person
 *   Input:
 *     "The customer rated their experience as very good, indicating a high level of
 *      satisfaction. No specific areas of improvement mentioned."
 *   Rating: 4
 *   Output:
 *     "I had a very good experience. The service and staff were great, and I left
 *      feeling satisfied. Would recommend to others."
 */
export function humanizeReviewText(text: string | null | undefined, rating?: number): string | null {
  if (!text || !text.trim()) {
    return ratingFallback(rating)
  }

  const trimmed = text.trim()

  // Meta phrases — if ANY present, NEVER preserve. Rewrite to first-person template.
  const metaPhrases = [
    /\bthe\s+customer\b/i,
    /\brated\s+their\s+experience\b/i,
    /\bindicating\b/i,
    /\bsuggesting\b/i,
    /\bno\s+specific\s+areas\s+of\s+improvement\s+mentioned\b/i,
    /\bfeedback\b/i,
    /\bsentiment\b/i,
    /\bsuggests?\b/i,
    /\b(indicates?|implies?)\b/i,
    /\bmoderate\s+level\b/i,
    /\brespondent\b/i,
    /\b(customer|customer'?s?)\s+(expressed|mentioned|stated|conveyed)\b/i,
    /\bthe\s+rating\b/i,
    /\bthe\s+feedback\b/i,
    /\bdetected\b/i,
    /\bobserved\b/i,
  ]
  const hasMeta = metaPhrases.some(p => p.test(trimmed))

  if (hasMeta) {
    return ratingFallback(rating) ?? null
  }

  // Grammatically broken heuristics
  const likelyBroken =
    /\b(\w+)\s+\1\b/i.test(trimmed) ||
    (trimmed.length < 15 && !/[.!?]/.test(trimmed))

  if (likelyBroken) {
    return ratingFallback(rating) ?? null
  }

  // Text is clean — lightly clean and cap
  let result = trimmed
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;!?])/g, '$1')
    .replace(/^\s*[.,;]\s*/, '')
    .trim()

  if (result.length > 500) {
    const truncated = result.slice(0, 500)
    const lastPeriod = truncated.lastIndexOf('.')
    result = lastPeriod > 100 ? truncated.slice(0, lastPeriod + 1) : truncated.trimEnd() + '.'
  }

  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1)
  }

  return result || ratingFallback(rating)
}

/** First-person, Google-ready templates. 150–350 chars, 2–4 sentences. Never meta language. */
function ratingFallback(rating?: number): string | null {
  if (rating == null) return null
  if (rating >= 5)
    return "I had a wonderful experience here. The service and staff were great, and I left feeling satisfied. Would definitely recommend!"
  if (rating >= 4)
    return "I had a very good experience. The service and staff were great, and I left feeling satisfied. Would recommend to others."
  if (rating >= 3)
    return "Overall, it was decent. Some things worked well and there's room to improve. Worth another visit."
  if (rating >= 2)
    return "This wasn't the experience I was hoping for. A few things could be better."
  return "I had a poor experience here. I hope things improve for future visitors."
}

/**
 * Maps a sentimentScore (-1.0 to 1.0) to a 1–5 star rating.
 */
export function sentimentToRating(score: number): number {
  const clamped = Math.max(-1, Math.min(1, score))
  return Math.round(((clamped + 1) / 2) * 4) + 1
}
