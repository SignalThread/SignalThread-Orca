import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  isAnswerQuestionContextError,
  resolveAnswerQuestionContext,
} from '@/lib/answer-question-context'
import { runAnswerReviewSynopsisPipeline } from '@/lib/answer-review-synopsis-pipeline'
import { assertVoiceAnswerType, MixedSurveyValidationError } from '@/lib/mixed-survey-contract'
import type { ApiResponse } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  responseId: z.string().cuid(),
  questionKey: z.string().min(1).max(100),
  promptLabel: z.string().min(1).max(500),
  text: z.string().min(1).max(10000),
})

/**
 * POST /api/answer/text
 * Typed kiosk answer: persists Answer + AnswerTranscript and runs the same review synopsis
 * pipeline as post-transcription (no object storage / transcription).
 */
export async function POST(request: NextRequest) {
  try {
    const json = await request.json()
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Validation failed',
          message: parsed.error.errors.map((e) => `${e.path}: ${e.message}`).join(', '),
        },
        { status: 400 },
      )
    }

    const { responseId, questionKey, promptLabel, text } = parsed.data
    const trimmed = text.trim()
    if (!trimmed) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Validation failed', message: 'text is empty' }, { status: 400 })
    }

    const questionContext = await resolveAnswerQuestionContext({ responseId, questionKey })
    assertVoiceAnswerType(questionContext.questionType)

    if (questionContext.responseMode === 'VOICE_ONLY') {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Text responses not allowed',
          message: 'This survey accepts voice responses only.',
        },
        { status: 400 },
      )
    }

    const pipelineT0 = Date.now()
    const objectKey = `answers/text/${crypto.randomUUID()}`
    const encoder = new TextEncoder()
    const fileSizeBytes = encoder.encode(trimmed).length

    const answer = await prisma.answer.create({
      data: {
        responseId,
        ...(questionContext.questionId ? { questionId: questionContext.questionId } : {}),
        questionKey,
        promptLabel,
        objectKey,
        mimeType: 'text/plain',
        fileSizeBytes,
        durationMs: null,
        objectEtag: 'text-entry',
        status: 'PROCESSING_TRANSCRIPT',
      },
    })

    const answerId = answer.id
    const cid = responseId

    console.info('[PipelineTiming] text_answer_started', { cid, answerId, responseId, t: pipelineT0 })

    await prisma.answerProcessingLog.create({
      data: {
        answerId,
        step: 'TEXT_ENTRY',
        attempt: 1,
        startedAt: new Date(),
        endedAt: new Date(),
        metadata: {
          charCount: trimmed.length,
        },
      },
    })

    await prisma.answerTranscript.upsert({
      where: { answerId },
      create: {
        answerId,
        provider: 'kiosk-text',
        model: 'n/a',
        text: trimmed,
      },
      update: {
        text: trimmed,
      },
    })

    await runAnswerReviewSynopsisPipeline({
      answerId,
      transcriptText: trimmed,
      pipelineT0,
      cid,
    })

    const [transcriptRow, analysisRow] = await Promise.all([
      prisma.answerTranscript.findFirst({ where: { answerId } }),
      prisma.answerAnalysis.findFirst({ where: { answerId } }),
    ])

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          answerId,
          transcript: transcriptRow?.text,
          analysis: analysisRow
            ? {
                summary: analysisRow.summary,
                sentiment: analysisRow.sentimentLabel,
                sentimentScore: analysisRow.sentimentScore,
                evidenceState: (analysisRow.themesJson as { evidenceState?: string })?.evidenceState,
                themes: (analysisRow.themesJson as { themes?: string[] })?.themes || [],
                actionItems: (analysisRow.actionsJson as { actionItems?: string[] })?.actionItems || [],
                keyQuote: (analysisRow.themesJson as { keyQuote?: string })?.keyQuote || '',
              }
            : undefined,
        },
        message: 'Text answer saved and analyzed',
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof MixedSurveyValidationError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Answer type mismatch', message: error.message },
        { status: error.status },
      )
    }
    if (isAnswerQuestionContextError(error)) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: error.message.startsWith('No response found') ? 'Response not found' : 'Question not found',
          message: error.message,
        },
        { status: error.status },
      )
    }

    console.error('[API] /api/answer/text error:', error)
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 },
    )
  }
}
