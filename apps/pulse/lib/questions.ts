import type { PrismaClient } from '@prisma/client'

type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export interface EventQuestionWriteInput {
  key?: unknown
  id?: unknown
  label?: unknown
  text?: unknown
  order?: unknown
  required?: unknown
  ttsText?: unknown
}

export interface NormalizedEventQuestion {
  key: string
  label: string
  ttsText: string | null
  order: number
  required: boolean
}

const ORDER_OFFSET = 1_000_000

export function normalizeEventQuestions(
  questions: EventQuestionWriteInput[],
): NormalizedEventQuestion[] {
  const normalized = questions.map((question, index) => {
    const keySource = typeof question.key === 'string' ? question.key : question.id
    const key = typeof keySource === 'string' ? keySource.trim() : ''
    const labelSource = typeof question.label === 'string' ? question.label : question.text
    const label = typeof labelSource === 'string' ? labelSource.trim() : ''
    const ttsText =
      typeof question.ttsText === 'string' && question.ttsText.trim().length > 0
        ? question.ttsText.trim()
        : null
    const order =
      typeof question.order === 'number' && Number.isInteger(question.order)
        ? question.order
        : index

    if (!key) {
      throw new Error(`Question at index ${index} is missing a stable key`)
    }

    if (!label) {
      throw new Error(`Question "${key}" is missing a label`)
    }

    return {
      key,
      label,
      ttsText,
      order,
      required: typeof question.required === 'boolean' ? question.required : true,
    }
  })

  const seenKeys = new Set<string>()
  const seenOrders = new Set<number>()

  for (const question of normalized) {
    if (seenKeys.has(question.key)) {
      throw new Error(`Duplicate question key "${question.key}" in event payload`)
    }
    if (seenOrders.has(question.order)) {
      throw new Error(`Duplicate question order "${question.order}" in event payload`)
    }
    seenKeys.add(question.key)
    seenOrders.add(question.order)
  }

  return normalized
}

export async function syncEventQuestions(
  db: Pick<PrismaTx, 'question'>,
  eventId: string,
  questions: EventQuestionWriteInput[],
): Promise<void> {
  const normalized = normalizeEventQuestions(questions)

  const existing = await db.question.findMany({
    where: { eventId, surveyId: null },
    select: { key: true },
  })

  if (existing.length > 0) {
    // Shift existing orders out of the way so reorders can be applied safely under
    // the event-scoped unique(order) constraint without depending on update order.
    await db.question.updateMany({
      where: { eventId, surveyId: null },
      data: {
        order: {
          increment: ORDER_OFFSET,
        },
      },
    })
  }

  for (const question of normalized) {
    await db.question.upsert({
      where: {
        eventId_key: {
          eventId,
          key: question.key,
        },
      },
      update: {
        label: question.label,
        ttsText: question.ttsText,
        order: question.order,
        required: question.required,
      },
      create: {
        eventId,
        surveyId: null,
        key: question.key,
        label: question.label,
        ttsText: question.ttsText,
        order: question.order,
        required: question.required,
      },
    })
  }

  await db.question.deleteMany({
    where: normalized.length === 0
      ? { eventId, surveyId: null }
      : {
          eventId,
          surveyId: null,
          key: {
            notIn: normalized.map((question) => question.key),
          },
        },
  })
}
