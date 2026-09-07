import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MixedSurveyValidationError,
  submitStructuredAnswer,
} from '@/lib/mixed-survey-contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const structuredAnswerSchema = z.object({
  responseId: z.string().cuid(),
  questionId: z.string().cuid(),
  numericValue: z.number().int(),
  speakerId: z.string().cuid().optional(),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const parsed = structuredAnswerSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          message: parsed.error.errors.map((issue) => `${issue.path}: ${issue.message}`).join(', '),
        },
        { status: 400 },
      )
    }

    const result = await submitStructuredAnswer(parsed.data)
    return NextResponse.json({
      success: true,
      data: {
        answerId: result.answer.id,
        responseId: result.answer.responseId,
        questionId: result.answer.questionId,
        numericValue: result.answer.numericValue,
        speakerId: result.answer.speakerId,
        status: result.answer.status,
        disposition: result.disposition,
      },
    })
  } catch (error) {
    if (error instanceof MixedSurveyValidationError) {
      return NextResponse.json(
        { success: false, error: 'Structured answer rejected', message: error.message },
        { status: error.status },
      )
    }

    console.error('[API] /api/answer/structured error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: 'Unable to save this answer' },
      { status: 500 },
    )
  }
}
