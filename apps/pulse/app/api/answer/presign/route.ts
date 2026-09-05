import { NextRequest, NextResponse } from 'next/server'
import { presignPut, generateObjectKey, getStorageConfig } from '@/lib/objectStorage'
import {
  isAnswerQuestionContextError,
  resolveAnswerQuestionContext,
} from '@/lib/answer-question-context'
import { z } from 'zod'
import { MixedSurveyValidationError, normalizeQuestionType } from '@/lib/mixed-survey-contract'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const presignAnswerSchema = z.object({
  responseId: z.string().cuid(),
  questionKey: z.string().min(1).max(100),
  promptLabel: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(52428800), // 50MB
  mimeType: z.string().min(1),
})

interface PresignSuccessResponse {
  success: true
  key: string
  url: string
  bucket: string
  expiresIn: number
}

interface PresignErrorResponse {
  success: false
  error: string
  message: string
}

/**
 * POST /api/answer/presign
 * 
 * Request a presigned URL for uploading an Answer
 * 
 * Security features:
 * - Validates file size and MIME type
 * - Verifies Response exists
 * - Verifies Question key exists in the Question table, with Event.questionsJson fallback
 * - Creates Answer record with proper links
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error('[Presign][ERROR]', { reason: 'Failed to parse JSON body', rawBody })
      return NextResponse.json<PresignErrorResponse>(
        { success: false, error: 'Bad Request', message: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    console.log('[Presign][START]', { body })

    // Check storage configuration first
    const storageConfig = getStorageConfig()
    if (!storageConfig) {
      console.error('[Presign][500]', { reason: 'Storage not configured', body })
      return NextResponse.json<PresignErrorResponse>(
        {
          success: false,
          error: 'Storage not configured',
          message: 'Object storage credentials are missing. Please check server configuration.',
        },
        { status: 500 }
      )
    }

    console.log('[Presign] Storage configured:', storageConfig.provider)

    // Validate request
    const validationResult = presignAnswerSchema.safeParse(body)
    
    if (!validationResult.success) {
      console.error('[Presign][400]', { reason: 'Validation failed', body })
      return NextResponse.json<PresignErrorResponse>(
        {
          success: false,
          error: 'Validation failed',
          message: validationResult.error.errors.map(e => `${e.path}: ${e.message}`).join(', '),
        },
        { status: 400 }
      )
    }

    const { responseId, questionKey, promptLabel, fileName, fileSize, mimeType } = validationResult.data

    const questionContext = await resolveAnswerQuestionContext({ responseId, questionKey })
    normalizeQuestionType(questionContext.questionType)

    if (!questionContext) {
      console.error('[Presign][404]', { reason: 'Response not found', body })
      return NextResponse.json<PresignErrorResponse>(
        {
          success: false,
          error: 'Response not found',
          message: `No response found with ID: ${responseId}`,
        },
        { status: 404 }
      )
    }

    if (questionContext.responseMode === 'TEXT_ONLY') {
      console.error('[Presign][400]', { reason: 'Voice uploads not allowed for text-only survey', body })
      return NextResponse.json<PresignErrorResponse>(
        {
          success: false,
          error: 'Voice responses not allowed',
          message: 'This survey accepts typed responses only.',
        },
        { status: 400 }
      )
    }

    // Normalize MIME type
    const normalizedMimeType = mimeType.split(';')[0].trim()

    const tempId = crypto.randomUUID()

    // Generate unique object key
    const objectKey = generateObjectKey(tempId, fileName)

    // Get bucket and expiration from env
    const bucket = process.env.S3_BUCKET_NAME!
    const expiresIn = parseInt(process.env.S3_UPLOAD_EXPIRES_IN || '300', 10)

    // Generate presigned URL using shared module
    const uploadUrl = await presignPut({
      bucket,
      key: objectKey,
      contentType: normalizedMimeType,
      expiresIn,
    })

    console.log('[Presign][SUCCESS]', { responseId, objectKey })

    return NextResponse.json<PresignSuccessResponse>(
      {
        success: true,
        key: objectKey,
        url: uploadUrl,
        bucket,
        expiresIn,
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof MixedSurveyValidationError) {
      return NextResponse.json<PresignErrorResponse>(
        { success: false, error: 'Answer type mismatch', message: error.message },
        { status: error.status },
      )
    }
    if (isAnswerQuestionContextError(error)) {
      const isMissingResponse = error.message.startsWith('No response found')
      console.error(`[Presign][${error.status}]`, {
        reason: isMissingResponse ? 'Response not found' : 'Question context invalid',
        message: error.message,
      })
      return NextResponse.json<PresignErrorResponse>(
        {
          success: false,
          error: isMissingResponse ? 'Response not found' : 'Question not found',
          message: error.message,
        },
        { status: error.status },
      )
    }

    console.error('[Presign] Error:', error)
    
    return NextResponse.json<PresignErrorResponse>(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
