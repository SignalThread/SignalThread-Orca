import { QuestionResponseTarget, QuestionType, type Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

export const SUPPORTED_QUESTION_TYPES = [
  QuestionType.VOICE,
  QuestionType.OPEN_RESPONSE,
  QuestionType.RATING_1_TO_5,
  QuestionType.RECOMMENDATION_0_TO_10,
  QuestionType.YES_NO,
  QuestionType.SINGLE_CHOICE,
  QuestionType.SPEAKER_FEEDBACK,
] as const

export type SupportedQuestionType = (typeof SUPPORTED_QUESTION_TYPES)[number]

export class MixedSurveyValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
    this.name = 'MixedSurveyValidationError'
  }
}

export interface MixedQuestionInput {
  id?: string
  key?: string
  prompt: string
  type?: QuestionType | string
  required?: boolean
  order?: number
}

export interface NormalizedMixedQuestion {
  id?: string
  key?: string
  prompt: string
  type: QuestionType
  required: boolean
  order: number
}

export function normalizeQuestionType(type: unknown): QuestionType {
  if (type == null || type === '') return QuestionType.VOICE
  if (typeof type === 'string' && SUPPORTED_QUESTION_TYPES.includes(type as SupportedQuestionType)) {
    return type as QuestionType
  }
  throw new MixedSurveyValidationError(`Unsupported question type "${String(type)}"`)
}

export function normalizeMixedQuestions(inputs: MixedQuestionInput[]): NormalizedMixedQuestion[] {
  if (inputs.length === 0) {
    throw new MixedSurveyValidationError('At least one question is required')
  }

  const normalized = inputs.map((input, index) => {
    const prompt = input.prompt.trim()
    if (!prompt) throw new MixedSurveyValidationError(`Question ${index + 1} requires prompt text`)
    if (input.required !== undefined && typeof input.required !== 'boolean') {
      throw new MixedSurveyValidationError(`Question ${index + 1} required must be a boolean`)
    }
    const order = input.order ?? index
    if (!Number.isInteger(order) || order < 0) {
      throw new MixedSurveyValidationError(`Question ${index + 1} order must be a non-negative integer`)
    }
    return {
      id: input.id?.trim() || undefined,
      key: input.key?.trim() || undefined,
      prompt,
      type: normalizeQuestionType(input.type),
      required: input.required ?? true,
      order,
    }
  })

  const orders = new Set<number>()
  for (const question of normalized) {
    if (orders.has(question.order)) {
      throw new MixedSurveyValidationError(`Duplicate question order "${question.order}"`)
    }
    orders.add(question.order)
  }

  return normalized
    .sort((a, b) => a.order - b.order)
    .map((question, order) => ({ ...question, order }))
}

export function validateNumericAnswer(type: QuestionType, value: unknown): number {
  if (!Number.isInteger(value)) {
    throw new MixedSurveyValidationError('Structured answers require an integer numeric value')
  }
  const numericValue = value as number
  if (type === QuestionType.RATING_1_TO_5 && (numericValue < 1 || numericValue > 5)) {
    throw new MixedSurveyValidationError('RATING_1_TO_5 answers must be between 1 and 5')
  }
  if (type === QuestionType.RECOMMENDATION_0_TO_10 && (numericValue < 0 || numericValue > 10)) {
    throw new MixedSurveyValidationError('RECOMMENDATION_0_TO_10 answers must be between 0 and 10')
  }
  if (type === QuestionType.SPEAKER_FEEDBACK && (numericValue < 1 || numericValue > 5)) {
    throw new MixedSurveyValidationError('SPEAKER_FEEDBACK answers must be between 1 and 5')
  }
  if (type === QuestionType.YES_NO && numericValue !== 0 && numericValue !== 1) {
    throw new MixedSurveyValidationError('YES_NO answers must be 0 or 1')
  }
  if (type === QuestionType.SINGLE_CHOICE && numericValue < 0) {
    throw new MixedSurveyValidationError('SINGLE_CHOICE answers require a non-negative option index')
  }
  if (type === QuestionType.VOICE || type === QuestionType.OPEN_RESPONSE) {
    throw new MixedSurveyValidationError(`${type} questions do not accept structured numeric answers`)
  }
  return numericValue
}

export function assertVoiceAnswerType(type: QuestionType): void {
  if (type !== QuestionType.VOICE && type !== QuestionType.OPEN_RESPONSE) {
    throw new MixedSurveyValidationError(`${type} questions do not accept voice audio answers`)
  }
}

export function assertQuestionTypesMutable(
  existing: Array<{ id: string; key: string; type?: QuestionType | string }>,
  next: Array<{ id?: string; key?: string; type: QuestionType }>,
  responseCount: number,
): void {
  if (responseCount === 0) return
  const byId = new Map(existing.map((question) => [question.id, question]))
  const byKey = new Map(existing.map((question) => [question.key, question]))
  for (const question of next) {
    const previous = (question.id && byId.get(question.id)) || (question.key && byKey.get(question.key))
    if (previous && normalizeQuestionType(previous.type) !== question.type) {
      throw new MixedSurveyValidationError('Question type cannot change after responses have been collected', 409)
    }
  }
}

type StructuredAnswerClient = Pick<Prisma.TransactionClient, 'response' | 'question' | 'answer' | 'eventSessionSpeakerAssignment'>
type StructuredAnswerDb = StructuredAnswerClient & Partial<Pick<PrismaClient, '$transaction'>>

export interface StructuredAnswerResult {
  answer: Awaited<ReturnType<StructuredAnswerClient['answer']['create']>>
  disposition: 'created' | 'unchanged' | 'corrected'
}

async function withStructuredAnswerTransaction<T>(
  db: StructuredAnswerDb,
  operation: (tx: StructuredAnswerClient) => Promise<T>,
): Promise<T> {
  if (typeof db.$transaction === 'function') {
    return db.$transaction(operation)
  }
  return operation(db)
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
}

async function submitStructuredAnswerAttempt(
  input: { responseId: string; questionId: string; numericValue: unknown; speakerId?: string },
  db: StructuredAnswerDb,
): Promise<StructuredAnswerResult> {
  return withStructuredAnswerTransaction(db, async (tx) => {
    const [response, question] = await Promise.all([
      tx.response.findUnique({
        where: { id: input.responseId },
        select: {
          id: true,
          eventId: true,
          surveyId: true,
          surveyTargetId: true,
          publicSurveyLinkId: true,
          status: true,
          publicSurveyLink: {
            select: {
              id: true,
              surveyId: true,
              surveyTargetId: true,
              isActive: true,
              expiresAt: true,
              surveyTarget: { select: { id: true, eventId: true, isActive: true, category: true, eventStructureItemId: true } },
            },
          },
          survey: {
            select: {
              id: true,
              eventId: true,
              surveyTargetId: true,
              status: true,
              surveyTarget: { select: { id: true, eventId: true, isActive: true, category: true, eventStructureItemId: true } },
              event: { select: { id: true, status: true, isActive: true } },
            },
          },
        },
      }),
      tx.question.findUnique({
        where: { id: input.questionId },
        select: { id: true, eventId: true, surveyId: true, key: true, label: true, type: true, responseTarget: true, configurationJson: true },
      }),
    ])

    if (!response) throw new MixedSurveyValidationError('Response not found', 404)
    if (!question) throw new MixedSurveyValidationError('Question not found', 404)
    if (response.status !== 'IN_PROGRESS') {
      throw new MixedSurveyValidationError('Response is already finalized', 409)
    }
    if (!response.surveyId || !response.survey || response.surveyId !== question.surveyId || response.eventId !== question.eventId) {
      throw new MixedSurveyValidationError('Question does not belong to this response survey', 400)
    }
    const deploymentTarget = response.publicSurveyLink?.surveyTarget ?? response.survey.surveyTarget
    if (!deploymentTarget) {
      throw new MixedSurveyValidationError('Response survey target is missing', 400)
    }
    if (response.survey.eventId !== response.eventId || deploymentTarget.id !== response.surveyTargetId || deploymentTarget.eventId !== response.eventId) {
      throw new MixedSurveyValidationError('Response survey scope is invalid', 400)
    }
    if (!response.publicSurveyLinkId || !response.publicSurveyLink) {
      throw new MixedSurveyValidationError('Response public survey link is invalid', 400)
    }
    if (
      response.publicSurveyLink.id !== response.publicSurveyLinkId
      || response.publicSurveyLink.surveyId !== response.surveyId
      || (response.publicSurveyLink.surveyTargetId ?? deploymentTarget.id) !== response.surveyTargetId
    ) {
      throw new MixedSurveyValidationError('Response public survey link scope is invalid', 400)
    }
    if (!response.publicSurveyLink.isActive) {
      throw new MixedSurveyValidationError('Public survey link is inactive', 400)
    }
    if (response.publicSurveyLink.expiresAt && response.publicSurveyLink.expiresAt.getTime() <= Date.now()) {
      throw new MixedSurveyValidationError('Public survey link has expired', 400)
    }
    if (
      response.survey.status !== 'ACTIVE'
      || !deploymentTarget.isActive
      || !response.survey.event.isActive
    ) {
      throw new MixedSurveyValidationError('Survey is not launchable', 400)
    }

    const numericValue = validateNumericAnswer(question.type, input.numericValue)
    if (question.type === QuestionType.SINGLE_CHOICE) {
      const configuration = question.configurationJson && typeof question.configurationJson === 'object' && !Array.isArray(question.configurationJson)
        ? question.configurationJson as { options?: unknown }
        : null
      const options = Array.isArray(configuration?.options) ? configuration.options : []
      if (numericValue >= options.length) {
        throw new MixedSurveyValidationError('SINGLE_CHOICE answer does not identify a configured option')
      }
    }
    const speakerId = input.speakerId?.trim() || null
    if (question.responseTarget === QuestionResponseTarget.SPEAKERS) {
      if (!speakerId) {
        throw new MixedSurveyValidationError('Presenter ratings require a speaker identity')
      }
      if (deploymentTarget.category !== 'SESSION' || !deploymentTarget.eventStructureItemId) {
        throw new MixedSurveyValidationError('Presenter rating question is not attached to a session survey')
      }
      const assignment = await tx.eventSessionSpeakerAssignment.findFirst({
        where: {
          eventId: response.eventId,
          sessionId: deploymentTarget.eventStructureItemId,
          speakerId,
          speaker: { isArchived: false },
        },
        select: { id: true },
      })
      if (!assignment) {
        throw new MixedSurveyValidationError('Speaker is not attached to this session')
      }
    } else if (speakerId) {
      throw new MixedSurveyValidationError('This question does not accept a speaker identity')
    }
    const existing = await tx.answer.findFirst({
      where: {
        responseId: response.id,
        questionId: question.id,
        numericValue: { not: null },
        speakerId,
      },
    })

    if (existing) {
      if (existing.numericValue === numericValue && existing.status === 'COMPLETED') {
        return { answer: existing, disposition: 'unchanged' }
      }
      const answer = await tx.answer.update({
        where: { id: existing.id },
        data: {
          numericValue,
          speakerId,
          status: 'COMPLETED',
          statusReason: null,
          objectKey: null,
          objectEtag: null,
          mimeType: null,
          fileSizeBytes: null,
          durationMs: null,
        },
      })
      return { answer, disposition: 'corrected' }
    }

    const answer = await tx.answer.create({
      data: {
        responseId: response.id,
        questionId: question.id,
        questionKey: question.key,
        promptLabel: question.label,
        numericValue,
        speakerId,
        status: 'COMPLETED',
      } satisfies Prisma.AnswerUncheckedCreateInput,
    })
    return { answer, disposition: 'created' }
  })
}

export async function submitStructuredAnswer(
  input: { responseId: string; questionId: string; numericValue: unknown; speakerId?: string },
  db: StructuredAnswerDb = prisma,
): Promise<StructuredAnswerResult> {
  try {
    return await submitStructuredAnswerAttempt(input, db)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return submitStructuredAnswerAttempt(input, db)
    }
    throw error
  }
}

export async function createStructuredAnswer(
  input: { responseId: string; questionId: string; numericValue: unknown; speakerId?: string },
  db: StructuredAnswerDb = prisma,
) {
  const result = await submitStructuredAnswer(input, db)
  return result.answer
}
