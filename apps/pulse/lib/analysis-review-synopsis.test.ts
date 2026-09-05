import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } }
  },
}))

import {
  ANALYSIS_MODEL,
  EVENTS_ANALYSIS_PROMPT_VERSION,
  REVIEW_SYNOPSIS_MODEL,
  classifyEventTranscriptEvidence,
  generateReviewSynopsisFast,
} from './analysis-review-synopsis'

describe('context-aware answer analysis', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    createMock.mockReset()
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it.each([
    'Lancaster PA',
    'Sarah',
    'Booth 12',
    'Tuesday',
    'yes',
    'um',
    'no comment',
  ])('treats %j as insufficient Event evidence without calling a model', async (transcript) => {
    const result = await generateReviewSynopsisFast(transcript, { mode: 'EVENTS_INTELLIGENCE' })

    expect(result).toEqual({
      evidenceState: 'INSUFFICIENT_EVIDENCE',
      summary: '',
      sentiment: 'NEUTRAL',
      sentimentScore: 0,
      themes: [],
      actionItems: [],
      keyQuote: '',
    })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('keeps concise but substantive Event feedback eligible', () => {
    expect(classifyEventTranscriptEvidence('Too loud')).toBe('SUBSTANTIVE')
    expect(classifyEventTranscriptEvidence('Great speaker')).toBe('SUBSTANTIVE')
    expect(classifyEventTranscriptEvidence('The badge line was slow and confusing.')).toBe('SUBSTANTIVE')
  })

  it('uses the grounded Events v2.1 contract and preserves useful evidence-backed intelligence', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
      evidenceState: 'SUBSTANTIVE',
      summary: 'The attendee reported that the badge line was slow and confusing.',
      sentiment: 'NEGATIVE',
      sentimentScore: -0.6,
      themes: ['Badge pickup delay'],
      actionItems: [{ text: 'Add another badge pickup lane', priority: 'High' }],
      keyQuote: 'badge line was slow and confusing',
    }) } }] })

    const result = await generateReviewSynopsisFast('The badge line was slow and confusing.', { mode: 'EVENTS_INTELLIGENCE' })

    expect(result).toMatchObject({
      evidenceState: 'SUBSTANTIVE',
      sentiment: 'NEGATIVE',
      themes: ['Badge pickup delay'],
      actionItems: [{ text: 'Add another badge pickup lane', priority: 'High' }],
    })
    const request = createMock.mock.calls[0][0]
    expect(request.model).toBe(REVIEW_SYNOPSIS_MODEL)
    expect(request.messages[1].content).toContain('Events analysis contract v2.1')
    expect(request.messages[1].content).toContain('Never convert a named place or entity into praise')
  })

  it('passes pre-event planning context into the Events analysis prompt', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
      evidenceState: 'SUBSTANTIVE', summary: 'The attendee requested practical AI examples.', sentiment: 'NEUTRAL', sentimentScore: 0,
      themes: ['Practical AI examples'], actionItems: [{ text: 'Prepare practical examples', priority: 'Medium' }], keyQuote: 'practical AI examples',
    }) } }] })

    await generateReviewSynopsisFast('I want practical AI examples before the event.', { mode: 'EVENTS_INTELLIGENCE', lifecycle: 'PRE_EVENT' })

    const prompt = createMock.mock.calls[0][0].messages[1].content
    expect(prompt).toContain('before doors open')
    expect(prompt).toContain('planning/readiness evidence')
    expect(prompt).toContain('Never invent an onsite experience')
  })

  it('preserves the Retail first-person Google-review contract', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
      summary: 'I enjoyed my visit and the staff were helpful.',
      sentiment: 'POSITIVE',
      sentimentScore: 0.8,
      themes: ['Helpful staff'],
      actionItems: [],
      keyQuote: 'staff were helpful',
    }) } }] })

    const result = await generateReviewSynopsisFast('The staff were helpful.', { mode: 'RETAIL_GOOGLE_REVIEW' })

    expect(result.summary).toBe('I enjoyed my visit and the staff were helpful.')
    expect(createMock.mock.calls[0][0].messages[1].content).toContain('first person, suitable to paste as a Google review')
  })

  it('uses ANALYSIS_MODEL as the canonical default and exposes Events prompt v2.1', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'lib/analysis-model.ts'), 'utf8')
    expect(source).toContain("process.env.REVIEW_SYNOPSIS_MODEL?.trim() || ANALYSIS_MODEL")
    expect(source).not.toContain("|| 'gpt-4o-mini'")
    expect(ANALYSIS_MODEL).toBeTruthy()
    expect(EVENTS_ANALYSIS_PROMPT_VERSION).toBe('events-analysis-v2.1')
  })
})
