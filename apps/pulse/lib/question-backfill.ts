export interface RawBackfillQuestion {
  key?: unknown
  label?: unknown
  text?: unknown
  order?: unknown
  required?: unknown
}

export interface BackfilledQuestion {
  key: string
  label: string
  ttsText: string | null
  order: number
  required: boolean
}

function normalizeCandidate(raw: RawBackfillQuestion, index: number) {
  const key = typeof raw.key === 'string' ? raw.key.trim() : ''
  const labelCandidate =
    typeof raw.label === 'string' ? raw.label.trim() :
    typeof raw.text === 'string' ? raw.text.trim() :
    ''

  if (!key || !labelCandidate) {
    return null
  }

  const rawOrder =
    typeof raw.order === 'number' && Number.isInteger(raw.order)
      ? raw.order
      : index + 1

  return {
    key,
    label: labelCandidate,
    ttsText: null as string | null,
    rawOrder,
    sourceIndex: index,
    required: typeof raw.required === 'boolean' ? raw.required : true,
  }
}

export function normalizeQuestionsJsonForBackfill(
  rawQuestions: unknown[],
): BackfilledQuestion[] {
  const candidates = rawQuestions
    .map((question, index) => normalizeCandidate((question ?? {}) as RawBackfillQuestion, index))
    .filter((question): question is NonNullable<typeof question> => question !== null)

  const ordered = candidates
    .slice()
    .sort((a, b) => (a.rawOrder - b.rawOrder) || (a.sourceIndex - b.sourceIndex))

  const seenKeys = new Set<string>()

  return ordered.flatMap((question) => {
    if (seenKeys.has(question.key)) {
      return []
    }

    seenKeys.add(question.key)

    return [{
      key: question.key,
      label: question.label,
      ttsText: question.ttsText,
      order: seenKeys.size,
      required: question.required,
    }]
  })
}
