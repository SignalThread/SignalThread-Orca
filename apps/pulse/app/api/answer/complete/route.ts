import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyObjectExists } from '@/lib/objectStorage'
import {
  isAnswerQuestionContextError,
  resolveAnswerQuestionContext,
} from '@/lib/answer-question-context'
import { z } from 'zod'
import { MixedSurveyValidationError, normalizeQuestionType } from '@/lib/mixed-survey-contract'
import { QuestionType } from '@prisma/client'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const completeUploadSchema = z.object({
  responseId: z.string().cuid(),
  questionKey: z.string().min(1).max(100),
  promptLabel: z.string().min(1).max(500),
  fileSize: z.number().int().positive().max(52428800),
  mimeType: z.string().min(1),
  key: z.string().min(1),
  speakerId: z.string().cuid().optional(),
})

interface CompleteSuccessResponse {
  success: true
  key: string
  exists: true
  answerId: string
}

interface CompleteErrorResponse {
  success: false
  error: string
  message: string
  key?: string
}

/**
 * POST /api/answer/complete
 * 
 * Verify upload completion and mark Answer as uploaded
 * This endpoint verifies the object exists in storage before confirming
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate request
    const validationResult = completeUploadSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json<CompleteErrorResponse>(
        {
          success: false,
          error: 'Validation failed',
          message: validationResult.error.errors.map(e => `${e.path}: ${e.message}`).join(', '),
        },
        { status: 400 }
      )
    }

    const { responseId, questionKey, promptLabel, fileSize, mimeType, key, speakerId } = validationResult.data

    console.log('[Complete] Verifying upload:', { responseId, key })

    const questionContext = await resolveAnswerQuestionContext({ responseId, questionKey })
    const questionType = normalizeQuestionType(questionContext.questionType)
    const responseTarget = questionContext.responseTarget ?? (questionType === QuestionType.SPEAKER_FEEDBACK ? 'SPEAKERS' : 'GENERAL')

    if (speakerId && (questionType !== QuestionType.SPEAKER_FEEDBACK || responseTarget !== 'SPEAKERS')) {
      return NextResponse.json<CompleteErrorResponse>(
        {
          success: false,
          error: 'Speaker context not allowed',
          message: 'Speaker context is only valid for speaker rating questions.',
          key,
        },
        { status: 400 }
      )
    }

    if (responseTarget === 'SPEAKERS' && !speakerId) {
      return NextResponse.json<CompleteErrorResponse>(
        {
          success: false,
          error: 'Speaker context required',
          message: 'Choose the speaker being rated before uploading this answer.',
          key,
        },
        { status: 400 }
      )
    }

    if (questionContext.responseMode === 'TEXT_ONLY') {
      return NextResponse.json<CompleteErrorResponse>(
        {
          success: false,
          error: 'Voice responses not allowed',
          message: 'This survey accepts typed responses only.',
          key,
        },
        { status: 400 }
      )
    }

    // Verify object exists in storage using HEAD request
    const bucket = process.env.S3_BUCKET_NAME!
    const exists = await verifyObjectExists(bucket, key)

    if (!exists) {
      console.error('[Complete] Object not found after PUT:', { bucket, key })
      return NextResponse.json<CompleteErrorResponse>(
        {
          success: false,
          error: 'Upload missing after PUT',
          message: `Object not found in storage. Bucket: ${bucket}, Key: ${key}`,
          key,
        },
        { status: 500 }
      )
    }

    console.log('[Complete] Object verified successfully:', { responseId, key })

    // Normalize MIME type
    const normalizedMimeType = mimeType.split(';')[0].trim()

    // Create the confirmed answer
    const answer = await prisma.answer.create({
      data: {
        responseId,
        ...(questionContext.questionId ? { questionId: questionContext.questionId } : {}),
        questionKey,
        promptLabel,
        objectKey: key,
        mimeType: normalizedMimeType,
        fileSizeBytes: fileSize,
        ...(speakerId ? { speakerId } : {}),
        status: 'UPLOADING', // confirm endpoint sets to UPLOADED
      },
    })

    return NextResponse.json<CompleteSuccessResponse>(
      {
        success: true,
        key,
        exists: true,
        answerId: answer.id,
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof MixedSurveyValidationError) {
      return NextResponse.json<CompleteErrorResponse>(
        { success: false, error: 'Answer type mismatch', message: error.message },
        { status: error.status },
      )
    }
    if (isAnswerQuestionContextError(error)) {
      return NextResponse.json<CompleteErrorResponse>(
        {
          success: false,
          error: error.message.startsWith('No response found') ? 'Response not found' : 'Question not found',
          message: error.message,
        },
        { status: error.status },
      )
    }

    console.error('[Complete] Error:', error)
    
    return NextResponse.json<CompleteErrorResponse>(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
