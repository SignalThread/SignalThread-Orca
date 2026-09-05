import { QuestionType, type Prisma, type PrismaClient } from '@prisma/client'

type JsonObject = Record<string, unknown>

const STRUCTURED_NUMERIC_TYPES = new Set<QuestionType>([
  QuestionType.RATING_1_TO_5,
  QuestionType.RECOMMENDATION_0_TO_10,
])

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Persists the semantic contract for fixed numeric scales alongside the enum.
 * The enum remains authoritative; this metadata is deliberately redundant so
 * legacy data can only be repaired when its numeric intent is explicit.
 */
export function advancedQuestionConfiguration(
  type: QuestionType,
  options: string[] = [],
): Prisma.InputJsonValue | undefined {
  if (type === QuestionType.RATING_1_TO_5 || type === QuestionType.SPEAKER_FEEDBACK) {
    return { questionType: type, answerFormat: 'NUMERIC', scale: { min: 1, max: 5 } }
  }
  if (type === QuestionType.RECOMMENDATION_0_TO_10) {
    return { questionType: type, answerFormat: 'NUMERIC', scale: { min: 0, max: 10 } }
  }
  if (type === QuestionType.SINGLE_CHOICE) return { options }
  return undefined
}

/** Returns a repair type only when persisted metadata proves numeric intent. */
export function inferStructuredTypeFromConfiguration(configuration: unknown): QuestionType | null {
  if (!isJsonObject(configuration)) return null

  const declaredType = configuration.questionType
  if (typeof declaredType === 'string' && STRUCTURED_NUMERIC_TYPES.has(declaredType as QuestionType)) {
    return declaredType as QuestionType
  }

  const scale = configuration.scale
  if (configuration.answerFormat !== 'NUMERIC' || !isJsonObject(scale)) return null
  if (scale.min === 1 && scale.max === 5) return QuestionType.RATING_1_TO_5
  if (scale.min === 0 && scale.max === 10) return QuestionType.RECOMMENDATION_0_TO_10
  return null
}

type LegacyQuestionRepairDb = Pick<PrismaClient, 'question'>

/**
 * Repairs only Advanced Event rows whose persisted metadata unambiguously
 * contradicts OPEN_RESPONSE. Genuine open responses remain untouched.
 */
export async function reconcileMalformedAdvancedQuestionTypes(
  input: { surveyId?: string; eventId?: string } = {},
  db: LegacyQuestionRepairDb,
): Promise<{ inspected: number; reconciled: number; questionIds: string[] }> {
  const candidates = await db.question.findMany({
    where: {
      type: QuestionType.OPEN_RESPONSE,
      ...(input.surveyId ? { surveyId: input.surveyId } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      survey: { event: { eventType: 'ADVANCED' } },
    },
    select: { id: true, configurationJson: true },
  })
  const repairs = candidates.flatMap((question) => {
    const type = inferStructuredTypeFromConfiguration(question.configurationJson)
    return type ? [{ id: question.id, type }] : []
  })
  await Promise.all(repairs.map((repair) => db.question.update({
    where: { id: repair.id },
    data: { type: repair.type },
  })))
  return { inspected: candidates.length, reconciled: repairs.length, questionIds: repairs.map((repair) => repair.id) }
}
