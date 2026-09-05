import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@/lib/analysis'
import {
  extractEventCommandCenterIntelligence,
  isAnswerEligibleForEventExtraction,
  mergeEventExtractionIntoAnalysis,
} from './extraction'

const originalOpenAiKey = process.env.OPENAI_API_KEY

const baseAnalysis: AnalysisResult = {
  summary: 'The attendee reported a slow check-in experience.',
  sentiment: 'NEGATIVE',
  sentimentScore: -0.45,
  themes: ['Registration'],
  actionItems: [],
  keyQuote: 'The badge line was slow',
}

describe('event command-center extraction', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = ''
  })

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey
  })

  it('detects event-linked answers from survey or public launch linkage', async () => {
    const db = {
      answer: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({
            response: {
              surveyId: null,
              surveyTargetId: null,
              publicSurveyLinkId: 'link_123',
              event: {
                location: {
                  account: {
                    accountType: 'EVENTS',
                  },
                },
              },
            },
          })
          .mockResolvedValueOnce({
            response: {
              surveyId: null,
              surveyTargetId: null,
              publicSurveyLinkId: null,
              event: {
                location: {
                  account: {
                    accountType: 'EVENTS',
                  },
                },
              },
            },
          })
          .mockResolvedValueOnce({
            response: {
              surveyId: 'survey_123',
              surveyTargetId: 'target_123',
              publicSurveyLinkId: 'link_123',
              event: {
                location: {
                  account: {
                    accountType: 'RETAIL',
                  },
                },
              },
            },
          }),
      },
    }

    await expect(isAnswerEligibleForEventExtraction('answer_123', db as never)).resolves.toBe(true)
    await expect(isAnswerEligibleForEventExtraction('answer_456', db as never)).resolves.toBe(false)
    await expect(isAnswerEligibleForEventExtraction('answer_789', db as never)).resolves.toBe(false)
  })

  it('extracts controlled event operations intelligence from operational feedback', async () => {
    const extraction = await extractEventCommandCenterIntelligence({
      transcriptText: 'The badge pickup line at check-in was wrapped around the lobby and needs another station right now.',
      analysis: baseAnalysis,
    })

    expect(extraction.taxonomyKey).toBe('access_checkin')
    expect(extraction.taxonomyLabel).toBe('Access and check-in')
    expect(extraction.priorityLevel).toBe('Watch')
    expect(extraction.recommendedNextStep).toBe('Add check-in staff and open another badge pickup lane')
    expect(extraction.representativeSnippet).toContain('badge line')
    expect(extraction.confidence).toBeGreaterThan(0)
  })

  it('does not turn positive feedback into a noisy operational action', async () => {
    const extraction = await extractEventCommandCenterIntelligence({
      transcriptText: 'The keynote session was excellent and the speaker was the most valuable part of the event.',
      analysis: {
        ...baseAnalysis,
        sentiment: 'POSITIVE',
        sentimentScore: 0.85,
        themes: ['Keynote'],
        actionItems: [],
      },
    })

    expect(extraction.priorityLevel).toBe('Informational')
    expect(extraction.recommendedNextStep).toBeNull()
  })

  it('uses planning framing for pre-event answers instead of onsite operations', async () => {
    const extraction = await extractEventCommandCenterIntelligence({
      transcriptText: 'I want practical AI governance examples and structured networking with other operations leaders.',
      lifecycle: 'PRE_EVENT',
      analysis: { ...baseAnalysis, sentiment: 'NEUTRAL', sentimentScore: 0, themes: ['AI governance', 'Networking'], actionItems: [] },
    })

    expect(extraction.actionWindow).toBe('THIS_WEEK')
    expect(extraction.priorityLevel).not.toBe('Immediate')
    expect(extraction.recommendedNextStep).toMatch(/plan|prepare|before doors open/i)
  })

  it('merges event extraction into AnswerAnalysis-compatible fields', () => {
    const analysis = mergeEventExtractionIntoAnalysis(baseAnalysis, {
      taxonomyKey: 'room_environment_av',
      taxonomyLabel: 'Room environment and AV',
      priorityLevel: 'Soon',
      impactScore: 0.7,
      timeSensitivityScore: 0.7,
      recommendedNextStep: 'Send AV staff to verify room setup and sound levels',
      actionWindow: 'NEXT_24_HOURS',
      representativeSnippet: 'The microphone was cutting out in room A.',
      confidence: 0.86,
      entities: ['Room A'],
      mentions: {
        sponsors: [],
        exhibitors: [],
        sessions: [],
        locations: ['Room A'],
      },
    })

    expect(analysis.themes).toContain('Room environment and AV')
    expect(analysis.actionItems[0]).toEqual({
      text: 'Send AV staff to verify room setup and sound levels',
      priority: 'Medium',
    })
    expect(analysis.keyQuote).toBe('The microphone was cutting out in room A.')
  })
})
