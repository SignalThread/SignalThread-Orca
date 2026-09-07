import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { ApiResponse, ConfirmUploadResponse } from '@/types'
import { runAnswerReviewSynopsisPipeline } from '@/lib/answer-review-synopsis-pipeline'
import { parseStructuredVoiceAnswer, isStructuredVoiceQuestionType } from '@/lib/structured-voice-answer'
import { validateNumericAnswer } from '@/lib/mixed-survey-contract'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const confirmAnswerSchema = z.object({
  answerId: z.string().cuid(),
  objectEtag: z.string().min(1),
  durationMs: z.number().int().positive(),
  language: z.string().length(2).optional(),
})

/**
 * POST /api/answer/confirm
 *
 * Confirm upload and process Answer (replaces /api/recording/confirm)
 * Queues background transcription + fast review synopsis (not full operational analysis).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const validationResult = confirmAnswerSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Validation failed',
          message: validationResult.error.errors.map((e) => `${e.path}: ${e.message}`).join(', '),
        },
        { status: 400 }
      )
    }

    const { answerId, objectEtag, durationMs, language } = validationResult.data

    const existingAnswer = await prisma.answer.findUnique({
      where: { id: answerId },
      include: {
        question: { select: { type: true, responseTarget: true, configurationJson: true } },
        response: {
          select: {
            eventId: true,
            surveyTarget: { select: { category: true, eventStructureItemId: true } },
          },
        },
      },
    })

    if (!existingAnswer) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Answer not found',
          message: `No answer found with ID: ${answerId}`,
        },
        { status: 404 }
      )
    }

    if (existingAnswer.status !== 'CREATED' && existingAnswer.status !== 'UPLOADING') {
      const existingTranscript = await prisma.answerTranscript.findFirst({
        where: { answerId: existingAnswer.id },
      })

      const isStructuredAnswer = Boolean(
        existingAnswer.question && isStructuredVoiceQuestionType(existingAnswer.question.type),
      )
      if (isStructuredAnswer && existingAnswer.status === 'FAILED') {
        return NextResponse.json(
          {
            success: false,
            error: 'Structured answer not recognized',
            message: existingAnswer.statusReason || 'Please answer again.',
            data: { answerId, transcript: existingTranscript?.text, retry: true },
          },
          { status: 422 },
        )
      }
      if (isStructuredAnswer && existingAnswer.status !== 'COMPLETED') {
        return NextResponse.json(
          {
            success: false,
            error: 'Structured answer is still processing',
            message: 'Please wait a moment and try again.',
          },
          { status: 409 },
        )
      }

      const existingAnalysis = await prisma.answerAnalysis.findFirst({
        where: { answerId: existingAnswer.id },
      })

      return NextResponse.json<ApiResponse<ConfirmUploadResponse>>(
        {
          success: true,
          data: {
            success: true,
            answerId: existingAnswer.id,
            status: existingAnswer.status as any,
            message: `Answer already in ${existingAnswer.status} status`,
            transcript: existingTranscript?.text,
            numericValue: existingAnswer.numericValue ?? undefined,
            analysis: existingAnalysis
              ? {
                  summary: existingAnalysis.summary,
                  sentiment: existingAnalysis.sentimentLabel,
                  sentimentScore: existingAnalysis.sentimentScore,
                  evidenceState: (existingAnalysis.themesJson as any)?.evidenceState,
                  themes: (existingAnalysis.themesJson as any)?.themes || [],
                  actionItems: (existingAnalysis.actionsJson as any)?.actionItems || [],
                  keyQuote: (existingAnalysis.themesJson as any)?.keyQuote || '',
                }
              : undefined,
          },
        },
        { status: 200 }
      )
    }

    if (!existingAnswer.objectKey || !existingAnswer.mimeType) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Audio metadata missing',
          message: 'Only uploaded voice answers can enter transcription processing.',
        },
        { status: 400 },
      )
    }

    const updatedAnswer = await prisma.answer.update({
      where: { id: answerId },
      data: {
        status: 'UPLOADED',
        objectEtag,
        durationMs,
        updatedAt: new Date(),
      },
    })

    await prisma.answerProcessingLog.create({
      data: {
        answerId: updatedAnswer.id,
        step: 'UPLOAD',
        attempt: 1,
        startedAt: existingAnswer.createdAt,
        endedAt: new Date(),
        metadata: {
          objectEtag,
          durationMs,
          language,
        },
      },
    })

    const confirmReceivedAt = Date.now()
    console.info('[PipelineTiming] confirm_received', {
      cid: existingAnswer.responseId,
      answerId,
      responseId: existingAnswer.responseId,
      t: confirmReceivedAt,
    })

    if (existingAnswer.question && isStructuredVoiceQuestionType(existingAnswer.question.type)) {
      let structured
      try {
        structured = await processStructuredVoiceAnswer({
          answerId,
          objectKey: existingAnswer.objectKey,
          mimeType: existingAnswer.mimeType,
          type: existingAnswer.question.type,
          responseTarget: existingAnswer.question.responseTarget,
          configurationJson: existingAnswer.question.configurationJson,
          speakerId: existingAnswer.speakerId,
          eventId: existingAnswer.response.eventId,
          surveyTarget: existingAnswer.response.surveyTarget,
          startedAt: new Date(),
        })
      } catch (error) {
        await failStructuredVoiceAnswer(answerId, `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        throw error
      }
      if (!structured.ok) {
        return NextResponse.json(
          {
            success: false,
            error: 'Structured answer not recognized',
            message: structured.message,
            data: { answerId, transcript: structured.transcript, retry: true },
          },
          { status: 422 },
        )
      }
      return NextResponse.json<ApiResponse<ConfirmUploadResponse>>({
        success: true,
        data: {
          success: true,
          answerId,
          status: 'COMPLETED' as any,
          message: 'Structured voice answer captured.',
          transcript: structured.transcript,
          numericValue: structured.numericValue,
          canonicalLabel: structured.label,
        },
      })
    }

    processAnswerInBackground(answerId, existingAnswer.objectKey, existingAnswer.mimeType, existingAnswer.createdAt, confirmReceivedAt).catch((err) => {
      console.error(`[Confirm] Background processing failed for ${answerId}:`, err)
    })

    const response: ConfirmUploadResponse = {
      success: true,
      answerId: updatedAnswer.id,
      status: 'UPLOADING' as any,
      message: 'Upload confirmed. Audio transcription and analysis queued successfully.',
    }

    return NextResponse.json<ApiResponse<ConfirmUploadResponse>>(
      {
        success: true,
        data: response,
        message: 'Upload confirmed successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error confirming upload:', error)

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

async function processStructuredVoiceAnswer(input: {
  answerId: string
  objectKey: string
  mimeType: string
  type: string
  responseTarget: string
  configurationJson: unknown
  speakerId: string | null
  eventId: string
  surveyTarget: { category: string; eventStructureItemId: string | null } | null
  startedAt: Date
}): Promise<
  | { ok: true; transcript: string; numericValue: number; label: string }
  | { ok: false; transcript: string; message: string }
> {
  await prisma.answer.update({ where: { id: input.answerId }, data: { status: 'PROCESSING_TRANSCRIPT' } })
  const { transcribeAudio } = await import('@/lib/transcription')
  const transcription = await transcribeAudio(input.objectKey, input.mimeType)
  await prisma.answerTranscript.upsert({
    where: { answerId: input.answerId },
    create: {
      answerId: input.answerId,
      provider: process.env.TRANSCRIPTION_PROVIDER || 'openai',
      model: process.env.TRANSCRIPTION_MODEL || 'whisper-1',
      text: transcription.text,
    },
    update: { text: transcription.text },
  })
  await prisma.answerProcessingLog.create({
    data: {
      answerId: input.answerId,
      step: 'TRANSCRIBE',
      attempt: 1,
      startedAt: input.startedAt,
      endedAt: new Date(),
      metadata: {
        structured: true,
        provider: process.env.TRANSCRIPTION_PROVIDER || 'openai',
        model: process.env.TRANSCRIPTION_MODEL || 'whisper-1',
      },
    },
  })

  if (input.responseTarget === 'SPEAKERS') {
    if (!input.speakerId || input.surveyTarget?.category !== 'SESSION' || !input.surveyTarget.eventStructureItemId) {
      await failStructuredVoiceAnswer(input.answerId, 'Presenter rating context is missing.')
      return { ok: false, transcript: transcription.text, message: 'We could not match this rating to a presenter. Please answer again.' }
    }
    const assignment = await prisma.eventSessionSpeakerAssignment.findFirst({
      where: {
        eventId: input.eventId,
        sessionId: input.surveyTarget.eventStructureItemId,
        speakerId: input.speakerId,
        speaker: { isArchived: false },
      },
      select: { id: true },
    })
    if (!assignment) {
      await failStructuredVoiceAnswer(input.answerId, 'Presenter is not attached to this session.')
      return { ok: false, transcript: transcription.text, message: 'We could not match this rating to a presenter. Please answer again.' }
    }
  } else if (input.speakerId) {
    await failStructuredVoiceAnswer(input.answerId, 'Unexpected presenter identity.')
    return { ok: false, transcript: transcription.text, message: 'We could not save that answer. Please answer again.' }
  }

  const configuration = input.configurationJson && typeof input.configurationJson === 'object' && !Array.isArray(input.configurationJson)
    ? input.configurationJson as { options?: unknown }
    : null
  const options = Array.isArray(configuration?.options)
    ? configuration.options.filter((option): option is string => typeof option === 'string')
    : []
  const parsed = parseStructuredVoiceAnswer({ type: input.type, transcript: transcription.text, options })
  if (!parsed.ok) {
    await failStructuredVoiceAnswer(input.answerId, `${parsed.reason}: ${parsed.message}`)
    return { ok: false, transcript: transcription.text, message: parsed.message }
  }
  const numericValue = validateNumericAnswer(input.type as any, parsed.numericValue)
  if (input.type === 'SINGLE_CHOICE' && numericValue >= options.length) {
    await failStructuredVoiceAnswer(input.answerId, 'Structured option is not configured.')
    return { ok: false, transcript: transcription.text, message: 'Please say one of the available option names.' }
  }
  await prisma.answer.update({
    where: { id: input.answerId },
    data: { numericValue, status: 'COMPLETED', statusReason: null },
  })
  return { ok: true, transcript: transcription.text, numericValue, label: parsed.label }
}

async function failStructuredVoiceAnswer(answerId: string, reason: string) {
  await prisma.answer.update({
    where: { id: answerId },
    data: { status: 'FAILED', statusReason: reason },
  })
}

async function processAnswerInBackground(
  answerId: string,
  objectKey: string,
  mimeType: string,
  createdAt: Date,
  confirmReceivedAt: number,
) {
  const pipelineT0 = confirmReceivedAt
  const transcribeStartTime = new Date()
  const answerRow = await prisma.answer.findUnique({
    where: { id: answerId },
    select: { responseId: true },
  })
  const cid = answerRow?.responseId ?? answerId

  const emit = (stage: string, extra: Record<string, unknown> = {}) => {
    const elapsedMs = Date.now() - pipelineT0
    console.info('[PipelineTiming] stage', { cid, answerId, stage, elapsedMs, ...extra })
  }

  emit('job_started')

  let transcriptText = ''

  try {
    const parallel = await Promise.all([
      import('@/lib/transcription'),
      prisma.answer.update({
        where: { id: answerId },
        data: { status: 'PROCESSING_TRANSCRIPT' },
      }),
    ])
    const transcriptionMod = parallel[0]
    const { transcribeAudio } = transcriptionMod
    emit('modules_loaded_and_processing_transcript')
    emit('transcription_started', { objectKey: objectKey.slice(-48) })

    const tTranscribe = Date.now()
    const transcriptionResult = await transcribeAudio(objectKey, mimeType)
    transcriptText = transcriptionResult.text
    emit('transcription_done', { transcriptionWallMs: Date.now() - tTranscribe, textLength: transcriptText.length })

    await prisma.answerTranscript.upsert({
      where: { answerId },
      create: {
        answerId,
        provider: process.env.TRANSCRIPTION_PROVIDER || 'openai',
        model: process.env.TRANSCRIPTION_MODEL || 'whisper-1',
        text: transcriptionResult.text,
      },
      update: {
        text: transcriptionResult.text,
      },
    })

    void prisma.answerProcessingLog
      .create({
        data: {
          answerId,
          step: 'TRANSCRIBE',
          attempt: 1,
          startedAt: transcribeStartTime,
          endedAt: new Date(),
          metadata: {
            provider: process.env.TRANSCRIPTION_PROVIDER || 'openai',
            model: process.env.TRANSCRIPTION_MODEL || 'whisper-1',
            textLength: transcriptionResult.text.length,
            language: transcriptionResult.language,
            duration: transcriptionResult.duration,
          },
        },
      })
      .catch((e) => console.error('[Confirm] TRANSCRIBE log failed', e))

    await runAnswerReviewSynopsisPipeline({
      answerId,
      transcriptText,
      pipelineT0,
      cid,
    })
    console.info('[PipelineTiming] e2e_breakdown', {
      answerId,
      confirmToCompleteMs: Date.now() - pipelineT0,
      stages: 'confirm_received → job_started → transcription_done → analysis_done → summary_saved → pipeline_complete',
    })

    console.log(`[Confirm] Processing complete for answer ${answerId}`)
  } catch (error) {
    console.error(`[Confirm] Transcription failed for answer ${answerId}:`, error)

    await prisma.answerProcessingLog.create({
      data: {
        answerId,
        step: 'TRANSCRIBE',
        attempt: 1,
        startedAt: transcribeStartTime,
        endedAt: new Date(),
        errorCode: 'TRANSCRIPTION_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    await prisma.answer.update({
      where: { id: answerId },
      data: {
        status: 'FAILED',
        statusReason: `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    })
    emit('pipeline_failed_transcription', { totalMs: Date.now() - pipelineT0 })
  }
}
