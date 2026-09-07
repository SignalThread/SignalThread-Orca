import { describe, expect, it } from 'vitest'
import { resolveSummaryPollingDecision } from './useSummaryPolling'

describe('resolveSummaryPollingDecision', () => {
  it('settles immediately for a completed structured-only response', () => {
    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'COMPLETED', transcript: null, analysis: null },
      { status: 'COMPLETED', transcript: null, analysis: null },
    ])).toEqual({ kind: 'plain_confirmation' })
  })

  it('waits for an open-response synopsis, then returns it', () => {
    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'PROCESSING_ANALYSIS', transcript: 'The room was excellent.', analysis: null },
    ])).toEqual({ kind: 'pending' })

    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'COMPLETED', transcript: 'The room was excellent.', analysis: { summary: 'The attendee enjoyed the room.' } },
    ])).toEqual({ kind: 'summary', summaries: ['The attendee enjoyed the room.'] })
  })

  it('waits for the analyzable answer in a mixed response', () => {
    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'COMPLETED', transcript: null, analysis: null },
      { status: 'PROCESSING_TRANSCRIPT', transcript: null, analysis: null },
    ])).toEqual({ kind: 'pending' })
  })

  it('settles on plain confirmation for completed insufficient-evidence Event answers', () => {
    expect(resolveSummaryPollingDecision('COMPLETED', [
      {
        status: 'COMPLETED',
        transcript: 'Lancaster PA',
        analysis: { summary: '', evidenceState: 'INSUFFICIENT_EVIDENCE' },
      },
    ])).toEqual({ kind: 'plain_confirmation' })
  })

  it('keeps the existing all-failed terminal error state', () => {
    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'FAILED', transcript: null, analysis: null },
      { status: 'FAILED', transcript: null, analysis: null },
    ])).toEqual({ kind: 'hard_failure', reason: 'all_answers_failed' })
  })

  it('treats the attendee-scoped poll (hasTranscript, no transcript text) exactly like a transcript', () => {
    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'PROCESSING_ANALYSIS', hasTranscript: true, analysis: null },
    ])).toEqual({ kind: 'pending' })

    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'COMPLETED', hasTranscript: true, analysis: { summary: 'The attendee enjoyed the room.' } },
    ])).toEqual({ kind: 'summary', summaries: ['The attendee enjoyed the room.'] })

    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'COMPLETED', hasTranscript: true, analysis: { summary: '', evidenceState: 'INSUFFICIENT_EVIDENCE' } },
    ])).toEqual({ kind: 'plain_confirmation' })

    expect(resolveSummaryPollingDecision('COMPLETED', [
      { status: 'COMPLETED', hasTranscript: false, analysis: null },
    ])).toEqual({ kind: 'plain_confirmation' })
  })
})
