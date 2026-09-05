import { QuestionType } from '@prisma/client'
import { prisma } from './prisma'
import { resolveEventQuestionsFromSource } from './question-read'

type PrismaLike = typeof prisma

export class AnswerQuestionContextError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'AnswerQuestionContextError'
  }
}

export interface AnswerQuestionContext {
  responseId: string
  eventId: string
  surveyId: string | null
  questionId: string | null
  questionKey: string
  questionType: QuestionType
  responseTarget: 'GENERAL' | 'SESSION' | 'SPEAKERS'
  responseMode: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  scope: 'event' | 'survey'
}

export function isAnswerQuestionContextError(error: unknown): error is AnswerQuestionContextError {
  return error instanceof AnswerQuestionContextError
}

export async function resolveAnswerQuestionContext(
  input: {
    responseId: string
    questionKey: string
  },
  db: PrismaLike = prisma,
): Promise<AnswerQuestionContext> {
  const response = await db.response.findUnique({
    where: { id: input.responseId },
    select: {
      id: true,
      eventId: true,
      surveyId: true,
      responseMode: true,
      event: {
        select: {
          responseMode: true,
          questionsJson: true,
          questions: {
            where: { surveyId: null },
            select: {
              key: true,
              label: true,
              ttsText: true,
              order: true,
              required: true,
              type: true,
              responseTarget: true,
            },
            orderBy: {
              order: 'asc',
            },
          },
        },
      },
      survey: {
        select: {
          id: true,
          responseMode: true,
          questions: {
            select: {
              id: true,
              key: true,
              label: true,
              ttsText: true,
              order: true,
              required: true,
              type: true,
              responseTarget: true,
            },
            orderBy: {
              order: 'asc',
            },
          },
        },
      },
    },
  })

  if (!response) {
    throw new AnswerQuestionContextError(`No response found with ID: ${input.responseId}`, 404)
  }

  if (response.surveyId) {
    if (!response.survey || response.survey.id !== response.surveyId) {
      throw new AnswerQuestionContextError('Survey context for this response could not be loaded', 400)
    }

    if (response.survey.questions.length === 0) {
      throw new AnswerQuestionContextError('This survey does not have any questions configured', 400)
    }

    const question = response.survey.questions.find(
      (candidate) => candidate.key === input.questionKey || candidate.id === input.questionKey,
    )

    if (!question) {
      throw new AnswerQuestionContextError(
        `Question "${input.questionKey}" does not belong to this survey`,
        404,
      )
    }

    return {
      responseId: response.id,
      eventId: response.eventId,
      surveyId: response.surveyId,
      questionId: question.id,
      questionKey: question.key,
      questionType: question.type,
      responseTarget: question.responseTarget,
      responseMode: response.responseMode,
      scope: 'survey',
    }
  }

  const questions = resolveEventQuestionsFromSource(response.event)
  if (questions.length === 0) {
    throw new AnswerQuestionContextError('This event does not have any questions configured', 400)
  }

  const questionExists = questions.some((question) => question.key === input.questionKey)
  if (!questionExists) {
    throw new AnswerQuestionContextError(
      `Question with key "${input.questionKey}" does not exist in this event`,
      404,
    )
  }

  return {
    responseId: response.id,
    eventId: response.eventId,
    surveyId: null,
    questionId: null,
    questionKey: input.questionKey,
    questionType: QuestionType.VOICE,
    responseTarget: 'GENERAL',
    responseMode: response.responseMode,
    scope: 'event',
  }
}
