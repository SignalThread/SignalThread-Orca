/**
 * Pull attendee-authored questions from the same analyzed language evidence
 * that powers canonical findings. This deliberately does not manufacture
 * questions from structured scores or dashboard copy.
 */
export function extractAttendeeQuestions(evidenceText: string[], limit = 8): string[] {
  const seen = new Set<string>()
  const questions: string[] = []

  for (const sentence of evidenceText.flatMap((value) => value.match(/[^.!?]*\?/g) ?? [])) {
    const normalized = sentence.trim()
    const key = normalized.toLocaleLowerCase()
    if (!normalized || normalized.length < 12 || normalized.length > 180 || seen.has(key)) continue
    seen.add(key)
    questions.push(normalized)
    if (questions.length === limit) break
  }

  return questions
}
