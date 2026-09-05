import { prisma } from '@/lib/prisma'
import type { AnalysisResult } from '@/lib/analysis'
import { writeEventIntelligenceForAnalyzedAnswer } from '@/lib/event-intelligence/dual-write'
import {
  EVENT_COMMAND_CENTER_MODEL,
  EVENT_COMMAND_CENTER_PROMPT_VERSION,
  extractEventCommandCenterIntelligence,
  isAnswerEligibleForEventExtraction,
  mergeEventExtractionIntoAnalysis,
} from '@/lib/event-intelligence/extraction'
import type { EventCommandCenterExtraction } from '@/lib/event-intelligence/contract'
import { getAccountProductMode } from '@/lib/account-product-mode'
import type { EventLifecyclePhase } from '@/lib/events-home-groups'
import { lifecycleForCollectionPhase } from '@/lib/event-intelligence/collection-phase'
import {
  EVENTS_ANALYSIS_PROMPT_VERSION,
  RETAIL_REVIEW_PROMPT_VERSION,
  REVIEW_SYNOPSIS_MODEL,
  classifyEventTranscriptEvidence,
  type AnswerAnalysisMode,
  type ContextualAnalysisResult,
} from '@/lib/analysis-review-synopsis'

const REVIEW_SYNOPSIS_PROVIDER = 'openai'
const REVIEW_SYNOPSIS_FALLBACK_PROMPT_VERSION = 'review-synopsis-fallback-v1'
const EVENTS_ANALYSIS_FALLBACK_PROMPT_VERSION = 'events-analysis-v2.0-provider-fallback'

function buildFallbackSynopsisFromTranscript(transcript: string): string {
  const t = transcript.trim()
  if (!t) {
    return 'Thank you for sharing your feedback.'
  }
  const max = 600
  return t.length > max ? `${t.slice(0, max)}…` : t
}

async function dualWriteEventIntelligence(opts: {
  answerId: string
  transcriptText: string
  analysis: AnalysisResult
  eventExtraction?: EventCommandCenterExtraction | null
  promptVersion: string
  model: string
  emit: (stage: string, extra?: Record<string, unknown>) => void
}) {
  try {
    const result = await writeEventIntelligenceForAnalyzedAnswer({
      answerId: opts.answerId,
      transcriptText: opts.transcriptText,
      analysis: opts.analysis,
      eventExtraction: opts.eventExtraction ?? null,
      promptVersion: opts.promptVersion,
      model: opts.model,
    })
    opts.emit('event_intelligence_checked', result)
  } catch (error) {
    console.error('[SynopsisPipeline] Event intelligence dual-write failed:', error)
    opts.emit('event_intelligence_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    })
  }
}

async function enrichAnalysisForEventCommandCenter(opts: {
  answerId: string
  transcriptText: string
  analysis: AnalysisResult
  lifecycle: EventLifecyclePhase | null
  emit: (stage: string, extra?: Record<string, unknown>) => void
}): Promise<{ analysis: AnalysisResult; eventExtraction: EventCommandCenterExtraction | null }> {
  try {
    const eligible = await isAnswerEligibleForEventExtraction(opts.answerId)
    if (!eligible) {
      opts.emit('event_extraction_skipped', { reason: 'not_event_survey_answer' })
      return { analysis: opts.analysis, eventExtraction: null }
    }

    const tExtraction = Date.now()
    opts.emit('event_extraction_started', {
      model: EVENT_COMMAND_CENTER_MODEL,
      promptVersion: EVENT_COMMAND_CENTER_PROMPT_VERSION,
    })
    const eventExtraction = await extractEventCommandCenterIntelligence({
      transcriptText: opts.transcriptText,
      analysis: opts.analysis,
      lifecycle: opts.lifecycle,
    })
    opts.emit('event_extraction_done', {
      model: EVENT_COMMAND_CENTER_MODEL,
      promptVersion: EVENT_COMMAND_CENTER_PROMPT_VERSION,
      extractionWallMs: Date.now() - tExtraction,
      taxonomyKey: eventExtraction.taxonomyKey,
      priorityLevel: eventExtraction.priorityLevel,
    })

    return {
      analysis: mergeEventExtractionIntoAnalysis(opts.analysis, eventExtraction),
      eventExtraction,
    }
  } catch (error) {
    console.error('[SynopsisPipeline] Event command-center extraction failed:', error)
    opts.emit('event_extraction_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    })
    return { analysis: opts.analysis, eventExtraction: null }
  }
}

async function resolveAnswerAnalysisContext(answerId: string): Promise<{
  mode: AnswerAnalysisMode
  lifecycle: EventLifecyclePhase | null
}> {
  const answer = await prisma.answer.findUnique({
    where: { id: answerId },
    select: {
      response: {
        select: {
          collectionPhase: true,
          event: {
            select: {
              location: {
                select: {
                  account: { select: { accountType: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  const event = answer?.response?.event
  const isEvents = getAccountProductMode(event?.location?.account?.accountType) === 'events'
  return {
    mode: isEvents ? 'EVENTS_INTELLIGENCE' : 'RETAIL_GOOGLE_REVIEW',
    lifecycle: isEvents && answer?.response?.collectionPhase
      ? lifecycleForCollectionPhase(answer.response.collectionPhase)
      : null,
  }
}

function persistedAnalysisFields(analysis: ContextualAnalysisResult) {
  const insufficient = analysis.evidenceState === 'INSUFFICIENT_EVIDENCE'
  return {
    summary: insufficient ? '' : analysis.summary,
    sentimentLabel: insufficient ? null : analysis.sentiment,
    sentimentScore: insufficient ? null : analysis.sentimentScore,
    themesJson: {
      evidenceState: analysis.evidenceState,
      themes: insufficient ? [] : analysis.themes,
      keyQuote: insufficient ? '' : analysis.keyQuote,
    } as object,
    actionsJson: {
      actionItems: insufficient ? [] : analysis.actionItems,
    } as object,
  }
}

export async function runAnswerReviewSynopsisPipeline(opts: {
  answerId: string
  transcriptText: string
  pipelineT0: number
  cid: string
}): Promise<void> {
  const { answerId, transcriptText, pipelineT0, cid } = opts

  const emit = (stage: string, extra: Record<string, unknown> = {}) => {
    const elapsedMs = Date.now() - pipelineT0
    console.info('[PipelineTiming] stage', { cid, answerId, stage, elapsedMs, ...extra })
  }

  await prisma.answer.update({
    where: { id: answerId },
    data: { status: 'PROCESSING_ANALYSIS' },
  })

  const analysisStartTime = new Date()
  const tAnalysis = Date.now()
  const analysisContext = await resolveAnswerAnalysisContext(answerId)
  const { mode: analysisMode, lifecycle } = analysisContext
  const promptVersion = analysisMode === 'EVENTS_INTELLIGENCE'
    ? EVENTS_ANALYSIS_PROMPT_VERSION
    : RETAIL_REVIEW_PROMPT_VERSION

  try {
    const { generateReviewSynopsisFast } = await import('@/lib/analysis-review-synopsis')
    emit('synopsis_generation_started', { model: REVIEW_SYNOPSIS_MODEL, analysisMode, promptVersion })
    const initialAnalysisResult = await generateReviewSynopsisFast(transcriptText, { mode: analysisMode, lifecycle })
    emit('synopsis_generation_done', { ok: true, analysisWallMs: Date.now() - tAnalysis, model: REVIEW_SYNOPSIS_MODEL, analysisMode })
    emit('analysis_done', { analysisWallMs: Date.now() - tAnalysis, model: REVIEW_SYNOPSIS_MODEL, analysisMode })
    const enriched = analysisMode === 'EVENTS_INTELLIGENCE' && initialAnalysisResult.evidenceState === 'SUBSTANTIVE'
      ? await enrichAnalysisForEventCommandCenter({ answerId, transcriptText, analysis: initialAnalysisResult, lifecycle, emit })
      : { analysis: initialAnalysisResult, eventExtraction: null }
    const analysisResult: ContextualAnalysisResult = {
      ...enriched.analysis,
      evidenceState: initialAnalysisResult.evidenceState,
    }
    const eventExtraction = enriched.eventExtraction
    const persisted = persistedAnalysisFields(analysisResult)

    const tSave = Date.now()
    await prisma.answerAnalysis.upsert({
      where: { answerId },
      create: {
        answerId,
        provider: REVIEW_SYNOPSIS_PROVIDER,
        model: REVIEW_SYNOPSIS_MODEL,
        promptVersion,
        ...persisted,
      },
      update: {
        model: REVIEW_SYNOPSIS_MODEL,
        promptVersion,
        ...persisted,
      },
    })
    emit('summary_saved', { dbWriteMs: Date.now() - tSave })
    emit('analysis_saved', { promptVersion, evidenceState: analysisResult.evidenceState })
    await dualWriteEventIntelligence({
      answerId,
      transcriptText,
      analysis: analysisResult,
      eventExtraction,
      promptVersion,
      model: REVIEW_SYNOPSIS_MODEL,
      emit,
    })

    void prisma.answerProcessingLog
      .create({
        data: {
          answerId,
          step: 'ANALYZE',
          attempt: 1,
          startedAt: analysisStartTime,
          endedAt: new Date(),
          metadata: {
            provider: REVIEW_SYNOPSIS_PROVIDER,
            model: REVIEW_SYNOPSIS_MODEL,
            promptVersion,
            analysisMode,
            evidenceState: analysisResult.evidenceState,
            sentiment: persisted.sentimentLabel,
            themesCount: analysisResult.themes.length,
            actionItemsCount: analysisResult.actionItems.length,
          },
        },
      })
      .catch((e) => console.error('[SynopsisPipeline] ANALYZE log failed', e))

    console.log(`[SynopsisPipeline] Analysis complete for answer ${answerId}`)
  } catch (analysisError) {
    console.error(`[SynopsisPipeline] Analysis failed for answer ${answerId}:`, analysisError)
    emit('synopsis_generation_done', {
      ok: false,
      error: analysisError instanceof Error ? analysisError.message : 'unknown',
      analysisWallMs: Date.now() - tAnalysis,
    })

    const fallbackSummary = analysisMode === 'EVENTS_INTELLIGENCE'
      ? `Attendee feedback: ${buildFallbackSynopsisFromTranscript(transcriptText)}`
      : buildFallbackSynopsisFromTranscript(transcriptText)
    const fallbackAnalysis: ContextualAnalysisResult = {
      evidenceState: analysisMode === 'EVENTS_INTELLIGENCE'
        ? classifyEventTranscriptEvidence(transcriptText)
        : 'SUBSTANTIVE',
      summary: fallbackSummary,
      sentiment: 'NEUTRAL',
      sentimentScore: 0,
      themes: [],
      actionItems: [],
      keyQuote: '',
    }
    const fallbackPromptVersion = analysisMode === 'EVENTS_INTELLIGENCE'
      ? EVENTS_ANALYSIS_FALLBACK_PROMPT_VERSION
      : REVIEW_SYNOPSIS_FALLBACK_PROMPT_VERSION
    const fallbackModel = `${REVIEW_SYNOPSIS_MODEL}-fallback`
    const enrichedFallbackAnalysis = fallbackAnalysis
    const eventExtraction = null
    const persistedFallback = persistedAnalysisFields(enrichedFallbackAnalysis)
    const tFallback = Date.now()
    await prisma.answerAnalysis.upsert({
      where: { answerId },
      create: {
        answerId,
        provider: REVIEW_SYNOPSIS_PROVIDER,
        model: fallbackModel,
        promptVersion: fallbackPromptVersion,
        ...persistedFallback,
      },
      update: {
        model: fallbackModel,
        promptVersion: fallbackPromptVersion,
        ...persistedFallback,
      },
    })
    emit('analysis_saved', {
      fallback: true,
      promptVersion: fallbackPromptVersion,
      dbWriteMs: Date.now() - tFallback,
    })
    if (analysisMode !== 'EVENTS_INTELLIGENCE' || fallbackAnalysis.evidenceState === 'INSUFFICIENT_EVIDENCE') {
      await dualWriteEventIntelligence({
        answerId,
        transcriptText,
        analysis: enrichedFallbackAnalysis,
        eventExtraction,
        promptVersion: fallbackPromptVersion,
        model: fallbackModel,
        emit,
      })
    } else {
      emit('event_intelligence_skipped', { reason: 'analysis_provider_unavailable' })
    }

    await prisma.answerProcessingLog.create({
      data: {
        answerId,
        step: 'ANALYZE',
        attempt: 1,
        startedAt: analysisStartTime,
        endedAt: new Date(),
        errorCode: 'ANALYSIS_FAILED',
        errorMessage: analysisError instanceof Error ? analysisError.message : 'Unknown error',
        metadata: {
          synopsisFallback: true,
          fallbackSummaryChars: fallbackSummary.length,
        },
      },
    })

    console.log(`[SynopsisPipeline] Fallback synopsis persisted for answer ${answerId}`)
  }

  await prisma.answer.update({
    where: { id: answerId },
    data: { status: 'COMPLETED' },
  })

  emit('pipeline_complete', { totalMs: Date.now() - pipelineT0 })
}
