import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@/lib/analysis'

const {
  prismaMock,
  generateReviewSynopsisFastMock,
  writeEventIntelligenceMock,
  isAnswerEligibleMock,
  extractEventCommandCenterMock,
  mergeEventExtractionMock,
} = vi.hoisted(() => ({
  prismaMock: {
    answer: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    answerAnalysis: {
      upsert: vi.fn(),
    },
    answerProcessingLog: {
      create: vi.fn(),
    },
  },
  generateReviewSynopsisFastMock: vi.fn(),
  writeEventIntelligenceMock: vi.fn(),
  isAnswerEligibleMock: vi.fn(),
  extractEventCommandCenterMock: vi.fn(),
  mergeEventExtractionMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/analysis-review-synopsis', () => ({
  generateReviewSynopsisFast: generateReviewSynopsisFastMock,
  REVIEW_SYNOPSIS_MODEL: 'gpt-5.6-sol',
  RETAIL_REVIEW_PROMPT_VERSION: 'review-synopsis-fast-v1',
  EVENTS_ANALYSIS_PROMPT_VERSION: 'events-analysis-v2.0',
  classifyEventTranscriptEvidence: (text: string) => text === 'Lancaster PA' ? 'INSUFFICIENT_EVIDENCE' : 'SUBSTANTIVE',
}))

vi.mock('@/lib/event-intelligence/dual-write', () => ({
  writeEventIntelligenceForAnalyzedAnswer: writeEventIntelligenceMock,
}))

vi.mock('@/lib/event-intelligence/extraction', () => ({
  EVENT_COMMAND_CENTER_MODEL: 'gpt-4o-mini',
  EVENT_COMMAND_CENTER_PROMPT_VERSION: 'event-command-center-v1',
  isAnswerEligibleForEventExtraction: isAnswerEligibleMock,
  extractEventCommandCenterIntelligence: extractEventCommandCenterMock,
  mergeEventExtractionIntoAnalysis: mergeEventExtractionMock,
}))

import { runAnswerReviewSynopsisPipeline } from './answer-review-synopsis-pipeline'

const baseAnalysis: AnalysisResult = {
  evidenceState: 'SUBSTANTIVE',
  summary: 'The attendee had trouble at check-in.',
  sentiment: 'NEGATIVE',
  sentimentScore: -0.4,
  themes: [],
  actionItems: [],
  keyQuote: '',
}

const eventExtraction = {
  taxonomyKey: 'access_checkin',
  taxonomyLabel: 'Access and check-in',
  priorityLevel: 'Soon',
  impactScore: 0.75,
  timeSensitivityScore: 0.7,
  recommendedNextStep: 'Add check-in staff and open another badge pickup lane',
  actionWindow: 'NEXT_24_HOURS',
  representativeSnippet: 'The badge pickup line was too long.',
  confidence: 0.86,
  entities: [],
  mentions: {
    sponsors: [],
    exhibitors: [],
    sessions: [],
    locations: ['Lobby'],
  },
}

describe('runAnswerReviewSynopsisPipeline event command-center extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.answer.update.mockResolvedValue({})
    prismaMock.answer.findUnique.mockResolvedValue({ response: { event: { location: { account: { accountType: 'RETAIL' } } } } })
    prismaMock.answerAnalysis.upsert.mockResolvedValue({})
    prismaMock.answerProcessingLog.create.mockResolvedValue({})
    writeEventIntelligenceMock.mockImplementation(async (input: { analysis?: AnalysisResult }) =>
      input.analysis?.evidenceState === 'INSUFFICIENT_EVIDENCE'
        ? { wrote: false, reason: 'insufficient_evidence' }
        : { wrote: true, intelligenceId: 'intel_123' },
    )
    generateReviewSynopsisFastMock.mockResolvedValue(baseAnalysis)
    isAnswerEligibleMock.mockResolvedValue(false)
    extractEventCommandCenterMock.mockResolvedValue(eventExtraction)
    mergeEventExtractionMock.mockImplementation((analysis: AnalysisResult) => ({
      ...analysis,
      themes: ['Access and check-in'],
      actionItems: [
        {
          text: 'Add check-in staff and open another badge pickup lane',
          priority: 'Medium',
        },
      ],
      keyQuote: 'The badge pickup line was too long.',
    }))
  })

  it('runs event-specific extraction for event-linked answers before saving and dual-writing', async () => {
    prismaMock.answer.findUnique.mockResolvedValue({ response: { event: { location: { account: { accountType: 'EVENTS' } } } } })
    isAnswerEligibleMock.mockResolvedValue(true)

    await runAnswerReviewSynopsisPipeline({
      answerId: 'answer_123',
      transcriptText: 'The badge pickup line was too long.',
      pipelineT0: Date.now(),
      cid: 'cid_123',
    })

    expect(isAnswerEligibleMock).toHaveBeenCalledWith('answer_123')
    expect(generateReviewSynopsisFastMock).toHaveBeenCalledWith('The badge pickup line was too long.', { mode: 'EVENTS_INTELLIGENCE', lifecycle: null })
    expect(extractEventCommandCenterMock).toHaveBeenCalledWith({
      transcriptText: 'The badge pickup line was too long.',
      analysis: baseAnalysis,
      lifecycle: null,
    })
    expect(prismaMock.answerAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          themesJson: {
            evidenceState: 'SUBSTANTIVE',
            themes: ['Access and check-in'],
            keyQuote: 'The badge pickup line was too long.',
          },
          actionsJson: {
            actionItems: [
              {
                text: 'Add check-in staff and open another badge pickup lane',
                priority: 'Medium',
              },
            ],
          },
        }),
      }),
    )
    expect(writeEventIntelligenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        answerId: 'answer_123',
        eventExtraction,
        analysis: expect.objectContaining({
          themes: ['Access and check-in'],
          actionItems: [
            {
              text: 'Add check-in staff and open another badge pickup lane',
              priority: 'Medium',
            },
          ],
        }),
      }),
    )
  })

  it('does not run event extraction for retail answers', async () => {
    writeEventIntelligenceMock.mockResolvedValueOnce({ wrote: false, reason: 'not_event_intelligence_scope' })

    await runAnswerReviewSynopsisPipeline({
      answerId: 'answer_456',
      transcriptText: 'Retail customer feedback.',
      pipelineT0: Date.now(),
      cid: 'cid_456',
    })

    expect(isAnswerEligibleMock).not.toHaveBeenCalled()
    expect(generateReviewSynopsisFastMock).toHaveBeenCalledWith('Retail customer feedback.', { mode: 'RETAIL_GOOGLE_REVIEW', lifecycle: null })
    expect(extractEventCommandCenterMock).not.toHaveBeenCalled()
    expect(mergeEventExtractionMock).not.toHaveBeenCalled()
    expect(writeEventIntelligenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        answerId: 'answer_456',
        eventExtraction: null,
        analysis: baseAnalysis,
      }),
    )
    await expect(Promise.resolve(writeEventIntelligenceMock.mock.results[0].value)).resolves.toEqual({
      wrote: false,
      reason: 'not_event_intelligence_scope',
    })
  })

  it('supplies the response capture lifecycle to pre-event analysis and extraction', async () => {
    prismaMock.answer.findUnique.mockResolvedValue({
      response: {
        collectionPhase: 'PRE',
        event: {
          location: { account: { accountType: 'EVENTS' } },
        },
      },
    })
    isAnswerEligibleMock.mockResolvedValue(true)

    await runAnswerReviewSynopsisPipeline({
      answerId: 'answer_pre', transcriptText: 'What practical AI examples will speakers cover?', pipelineT0: Date.now(), cid: 'cid_pre',
    })

    expect(generateReviewSynopsisFastMock).toHaveBeenCalledWith(
      'What practical AI examples will speakers cover?',
      { mode: 'EVENTS_INTELLIGENCE', lifecycle: 'PRE_EVENT' },
    )
    expect(extractEventCommandCenterMock).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'PRE_EVENT' }))
  })

  it('persists a safe fallback analysis and processing log when synopsis generation fails', async () => {
    generateReviewSynopsisFastMock.mockRejectedValueOnce(new Error('provider unavailable'))

    await runAnswerReviewSynopsisPipeline({
      answerId: 'answer_failed_analysis',
      transcriptText: 'The room was too cold and the signs were hard to follow.',
      pipelineT0: Date.now(),
      cid: 'cid_failed_analysis',
    })

    expect(prismaMock.answerAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          answerId: 'answer_failed_analysis',
          model: expect.stringContaining('-fallback'),
          promptVersion: 'review-synopsis-fallback-v1',
          sentimentLabel: 'NEUTRAL',
          sentimentScore: 0,
          themesJson: {
            evidenceState: 'SUBSTANTIVE',
            themes: [],
            keyQuote: '',
          },
          actionsJson: {
            actionItems: [],
          },
        }),
      }),
    )
    expect(prismaMock.answerProcessingLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        answerId: 'answer_failed_analysis',
        step: 'ANALYZE',
        errorCode: 'ANALYSIS_FAILED',
        errorMessage: 'provider unavailable',
        metadata: expect.objectContaining({
          synopsisFallback: true,
        }),
      }),
    })
    expect(prismaMock.answer.update).toHaveBeenLastCalledWith({
      where: { id: 'answer_failed_analysis' },
      data: { status: 'COMPLETED' },
    })
  })

  it('persists insufficient Event evidence without sentiment/themes and still completes processing', async () => {
    prismaMock.answer.findUnique.mockResolvedValue({ response: { event: { location: { account: { accountType: 'EVENTS' } } } } })
    generateReviewSynopsisFastMock.mockResolvedValueOnce({
      evidenceState: 'INSUFFICIENT_EVIDENCE', summary: '', sentiment: 'NEUTRAL', sentimentScore: 0,
      themes: [], actionItems: [], keyQuote: '',
    })

    await runAnswerReviewSynopsisPipeline({
      answerId: 'answer_sparse', transcriptText: 'Lancaster PA', pipelineT0: Date.now(), cid: 'cid_sparse',
    })

    expect(extractEventCommandCenterMock).not.toHaveBeenCalled()
    expect(prismaMock.answerAnalysis.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        promptVersion: 'events-analysis-v2.0',
        summary: '',
        sentimentLabel: null,
        sentimentScore: null,
        themesJson: { evidenceState: 'INSUFFICIENT_EVIDENCE', themes: [], keyQuote: '' },
        actionsJson: { actionItems: [] },
      }),
    }))
    expect(writeEventIntelligenceMock).toHaveBeenCalledWith(expect.objectContaining({
      analysis: expect.objectContaining({ evidenceState: 'INSUFFICIENT_EVIDENCE' }),
      eventExtraction: null,
    }))
    expect(prismaMock.answer.update).toHaveBeenLastCalledWith({
      where: { id: 'answer_sparse' }, data: { status: 'COMPLETED' },
    })
  })
})
