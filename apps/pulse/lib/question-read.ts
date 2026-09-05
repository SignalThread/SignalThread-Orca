import { prisma } from './prisma'

export interface ResolvedEventQuestion {
  key: string
  label: string
  ttsText: string | null
  order: number
  required: boolean
}

type QuestionRowLike = {
  surveyId?: string | null
  key: string
  label: string
  ttsText?: string | null
  order: number
  required: boolean
}

type EventQuestionSource = {
  questions?: QuestionRowLike[] | null
  questionsJson?: unknown
}

function normalizeQuestionsJsonFallback(rawQuestions: unknown): ResolvedEventQuestion[] {
  if (!Array.isArray(rawQuestions)) {
    return []
  }

  return rawQuestions
    .map((question, index) => {
      if (question == null || typeof question !== 'object' || Array.isArray(question)) {
        return null
      }

      const candidate = question as Record<string, unknown>
      const keySource = typeof candidate.key === 'string' ? candidate.key : candidate.id
      const labelSource = typeof candidate.label === 'string' ? candidate.label : candidate.text
      const key = typeof keySource === 'string' ? keySource.trim() : ''
      const label = typeof labelSource === 'string' ? labelSource.trim() : ''

      if (!key || !label) {
        return null
      }

      return {
        key,
        label,
        ttsText:
          typeof candidate.ttsText === 'string' && candidate.ttsText.trim().length > 0
            ? candidate.ttsText.trim()
            : null,
        order:
          typeof candidate.order === 'number' && Number.isInteger(candidate.order)
            ? candidate.order
            : index,
        required:
          typeof candidate.required === 'boolean'
            ? candidate.required
            : typeof candidate.isRequired === 'boolean'
              ? candidate.isRequired
              : false,
      }
    })
    .filter((question): question is ResolvedEventQuestion => question !== null)
    .sort((a, b) => a.order - b.order)
}

export function resolveEventQuestionsFromSource(source: EventQuestionSource | null | undefined): ResolvedEventQuestion[] {
  if (!source) {
    return []
  }

  if (Array.isArray(source.questions) && source.questions.length > 0) {
    return source.questions
      .filter((question) => question.surveyId == null)
      .map((question) => ({
        key: question.key,
        label: question.label,
        ttsText: question.ttsText ?? null,
        order: question.order,
        required: question.required,
      }))
      .sort((a, b) => a.order - b.order)
  }

  return normalizeQuestionsJsonFallback(source.questionsJson)
}

export async function getResolvedEventQuestions(
  eventId: string,
  db: typeof prisma = prisma,
): Promise<ResolvedEventQuestion[]> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      questionsJson: true,
      questions: {
        where: { surveyId: null },
        select: {
          key: true,
          label: true,
          ttsText: true,
          order: true,
          required: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  })

  return resolveEventQuestionsFromSource(event)
}

export function toQuestionBuilderQuestions(questions: ResolvedEventQuestion[]) {
  return questions.map((question) => ({
    id: question.key,
    text: question.label,
    order: question.order,
  }))
}
