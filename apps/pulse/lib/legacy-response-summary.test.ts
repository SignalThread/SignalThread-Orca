import { describe, expect, it } from 'vitest'
import {
  ATTENDEE_SUMMARY_WINDOW_MS,
  buildAttendeeSummaryPayload,
  isAttendeeSummaryWindowOpen,
} from './legacy-response-summary'

const now = new Date('2026-09-05T12:00:00.000Z')

describe('attendee summary window', () => {
  it('stays open while the response is in progress', () => {
    expect(isAttendeeSummaryWindowOpen({ status: 'IN_PROGRESS', completedAt: null }, now)).toBe(true)
  })

  it('stays open for 24 hours after completion and then closes', () => {
    const completedAt = new Date(now.getTime() - ATTENDEE_SUMMARY_WINDOW_MS + 1000)
    expect(isAttendeeSummaryWindowOpen({ status: 'COMPLETED', completedAt }, now)).toBe(true)
    const stale = new Date(now.getTime() - ATTENDEE_SUMMARY_WINDOW_MS - 1000)
    expect(isAttendeeSummaryWindowOpen({ status: 'COMPLETED', completedAt: stale }, now)).toBe(false)
  })

  it('never opens for abandoned or otherwise finalized responses', () => {
    expect(isAttendeeSummaryWindowOpen({ status: 'ABANDONED', completedAt: null }, now)).toBe(false)
    expect(isAttendeeSummaryWindowOpen({ status: 'COMPLETED', completedAt: null }, now)).toBe(false)
  })
})

describe('attendee summary payload', () => {
  it('exposes only lifecycle status and synopsis, never transcript text or storage keys', () => {
    const payload = buildAttendeeSummaryPayload({
      id: 'resp_1',
      eventId: 'evt_1',
      status: 'COMPLETED',
      startedAt: now,
      completedAt: now,
      answers: [
        {
          status: 'COMPLETED',
          answerTranscript: { text: 'The registration line was long.' },
          answerAnalysis: { summary: 'Registration felt slow.', sentimentScore: -0.4, themesJson: { evidenceState: 'SUBSTANTIVE', themes: ['registration'] } },
        },
        { status: 'PROCESSING_TRANSCRIPT', answerTranscript: null, answerAnalysis: null },
      ],
    })

    expect(payload).toEqual({
      id: 'resp_1',
      eventId: 'evt_1',
      status: 'COMPLETED',
      startedAt: now,
      completedAt: now,
      scope: 'attendee',
      answers: [
        { status: 'COMPLETED', hasTranscript: true, analysis: { summary: 'Registration felt slow.', sentimentScore: -0.4, evidenceState: 'SUBSTANTIVE' } },
        { status: 'PROCESSING_TRANSCRIPT', hasTranscript: false, analysis: null },
      ],
      answersCompleted: 1,
      answersTotal: 2,
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('registration line')
    expect(serialized).not.toContain('objectKey')
    expect(serialized).not.toContain('anonymousId')
    expect(serialized).not.toContain('themes')
  })
})
