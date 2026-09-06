import { useState, useEffect, useCallback } from 'react'

export interface ParsedAnalysis {
  summary?: string
  sentimentScore?: number
  evidenceState?: 'SUBSTANTIVE' | 'INSUFFICIENT_EVIDENCE'
}

export type SummaryPollStatus = 'idle' | 'loading' | 'success' | 'error'

export type SummaryPollingAnswer = {
  status?: string | null
  transcript?: string | null
  /**
   * The attendee-scoped poll (see lib/legacy-response-summary) reports whether
   * a transcript exists without sending its text; organizer payloads still
   * carry `transcript`.
   */
  hasTranscript?: boolean | null
  analysis?: ParsedAnalysis | null
}

function hasTranscriptText(answer: SummaryPollingAnswer): boolean {
  return Boolean(answer.transcript?.trim()) || answer.hasTranscript === true
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

const BUSY_STATUSES = new Set([
  'CREATED',
  'UPLOADING',
  'UPLOADED',
  'PROCESSING_TRANSCRIPT',
  'PROCESSING_ANALYSIS',
])

/**
 * Hard stop: nothing we wait for will produce an AI synopsis (not a timeout).
 * A completed answer without a summary is not itself terminal: text answers
 * can still be awaiting analysis. Structured-only completion is handled by
 * resolveSummaryPollingDecision after this failure guard.
 */
function detectHardFailure(answers: SummaryPollingAnswer[]): string | null {
  if (!answers.length) return null

  if (answers.every((a) => a.status === 'FAILED')) return 'all_answers_failed'

  if (answers.some((a) => BUSY_STATUSES.has(a.status ?? ''))) return null

  const anySummary = answers.some((a) => a.analysis?.summary?.trim())
  if (anySummary) return null

  return null
}

function countPresence(answers: SummaryPollingAnswer[]) {
  let transcripts = 0
  let analysisRows = 0
  let synopsis = 0
  for (const a of answers) {
    if (hasTranscriptText(a)) transcripts++
    if (a.analysis != null) analysisRows++
    if (a.analysis?.summary?.trim()) synopsis++
  }
  return { transcripts, analysisRows, synopsis }
}

export type SummaryPollingDecision =
  | { kind: 'summary'; summaries: string[] }
  | { kind: 'plain_confirmation' }
  | { kind: 'hard_failure'; reason: string }
  | { kind: 'pending' }

/**
 * A completed response made entirely of completed, transcript-free answers is
 * a structured-only journey. It has no analysis work to wait for, so the
 * thank-you screen should settle on its regular confirmation state.
 */
export function resolveSummaryPollingDecision(
  responseStatus: string | null | undefined,
  answers: SummaryPollingAnswer[],
): SummaryPollingDecision {
  const summaries = answers
    .map((answer) => answer.analysis?.summary)
    .filter((summary): summary is string => Boolean(summary && summary.trim()))

  if (summaries.length > 0) return { kind: 'summary', summaries }

  const hardFailure = detectHardFailure(answers)
  if (hardFailure) return { kind: 'hard_failure', reason: hardFailure }

  const hasAnalyzableTranscript = answers.some((answer) => hasTranscriptText(answer))
  const allAnswersCompleted = answers.length > 0 && answers.every((answer) => answer.status === 'COMPLETED')
  const allTranscriptAnswersTerminal = answers.every((answer) =>
    !hasTranscriptText(answer) || answer.analysis?.evidenceState === 'INSUFFICIENT_EVIDENCE',
  )
  if (responseStatus === 'COMPLETED' && allAnswersCompleted && (!hasAnalyzableTranscript || allTranscriptAnswersTerminal)) {
    return { kind: 'plain_confirmation' }
  }

  return { kind: 'pending' }
}

/**
 * Polls until an analysis summary exists, a completed structured-only response
 * reaches its plain confirmation state, or a true hard failure occurs.
 */
export function useSummaryPolling(eventId: string | null | undefined, responseId: string | null | undefined) {
  const [status, setStatus] = useState<SummaryPollStatus>(() => (eventId && responseId ? 'loading' : 'idle'))
  const [summaries, setSummaries] = useState<string[]>([])
  const [avgSentiment, setAvgSentiment] = useState<number | undefined>(undefined)
  const [retryToken, setRetryToken] = useState(0)

  const refetch = useCallback(() => {
    setRetryToken((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!eventId || !responseId) {
      setStatus('idle')
      setSummaries([])
      setAvgSentiment(undefined)
      return
    }

    setStatus('loading')
    setSummaries([])
    setAvgSentiment(undefined)

    let cancelled = false
    /** Tighter interval so the UI picks up the summary soon after DB write (no UX change). */
    const MS_BETWEEN_POLL = 1000
    /** First polls may see 0 answers briefly after navigation; do not hard-fail immediately. */
    const NO_ANSWER_GRACE_POLLS = 45
    /** Safety net if data never becomes readable (should be rare after server fallback). */
    const MAX_POLL_ATTEMPTS = 1200

    const cid = responseId ?? 'unknown'
    const log = (event: string, extra?: Record<string, unknown>) => {
      console.info(`[GoogleReview][cid=${cid}] ${event}`, { eventId, responseId, ...extra })
    }

    log('polling_start', { intervalMs: MS_BETWEEN_POLL, maxAttempts: MAX_POLL_ATTEMPTS })

    const poll = async () => {
      let attempt = 0

      while (!cancelled) {
        attempt++
        if (attempt > 1) {
          await sleep(MS_BETWEEN_POLL)
        }
        if (cancelled) break

        try {
          const res = await fetch(`/api/events/${eventId}/responses/${responseId}`)

          if (res.status === 404) {
            log('polling_error', { attempt, httpStatus: 404 })
            if (!cancelled) {
              setStatus('error')
              log('loading_false', { branch: 'error', reason: 'not_found' })
            }
            return
          }

          if (res.status === 400) {
            log('polling_error', { attempt, httpStatus: 400 })
            if (!cancelled) {
              setStatus('error')
              log('loading_false', { branch: 'error', reason: 'bad_request' })
            }
            return
          }

          if (!res.ok) {
            log('poll_attempt', { attempt, httpStatus: res.status, note: 'http_not_ok_keep_waiting' })
            continue
          }

          const json = await res.json()
          if (!json.success || !json.data?.answers) {
            log('poll_attempt', { attempt, note: 'invalid_payload_keep_waiting' })
            continue
          }

          const answers = json.data.answers as SummaryPollingAnswer[]
          const answersTotal = typeof json.data.answersTotal === 'number' ? json.data.answersTotal : answers.length
          if (answers.length === 0 && answersTotal === 0) {
            if (attempt <= NO_ANSWER_GRACE_POLLS) {
              log('poll_attempt', { attempt, note: 'no_answers_yet_grace' })
              continue
            }
            log('polling_error', { attempt, reason: 'no_answers' })
            if (!cancelled) {
              setStatus('error')
              log('loading_false', { branch: 'error', reason: 'no_answers' })
            }
            return
          }

          const { transcripts, analysisRows, synopsis } = countPresence(answers)

          const decision = resolveSummaryPollingDecision(json.data.status, answers)

          log('poll_attempt', {
            attempt,
            transcriptCount: transcripts,
            analysisRowCount: analysisRows,
            synopsisPayloadCount: synopsis,
            validSummaryStrings: decision.kind === 'summary' ? decision.summaries.length : 0,
          })

          if (decision.kind === 'summary') {
            log('polling_success', { attempt, summaryCount: decision.summaries.length })
            if (!cancelled) {
              setSummaries(decision.summaries)
              const scores = answers.map((a) => a.analysis?.sentimentScore).filter((s): s is number => s != null)
              if (scores.length > 0) {
                setAvgSentiment(scores.reduce((a, b) => a + b, 0) / scores.length)
              }
              setStatus('success')
              log('loading_false', { branch: 'success' })
            }
            return
          }

          if (decision.kind === 'plain_confirmation') {
            log('polling_success', { attempt, reason: 'completed_structured_only' })
            if (!cancelled) {
              setStatus('success')
              log('loading_false', { branch: 'success', reason: 'completed_structured_only' })
            }
            return
          }

          if (attempt >= MAX_POLL_ATTEMPTS) {
            log('polling_timeout', { attempt })
            if (!cancelled) {
              setStatus('error')
              log('loading_false', { branch: 'error', reason: 'polling_timeout' })
            }
            return
          }

          if (decision.kind === 'hard_failure') {
            log('polling_error', { attempt, reason: decision.reason })
            if (!cancelled) {
              setStatus('error')
              log('loading_false', { branch: 'error', reason: decision.reason })
            }
            return
          }

          log('poll_attempt', { attempt, note: 'no_synopsis_yet' })
        } catch (err) {
          console.error(`[GoogleReview][cid=${cid}] polling_error — keep waiting`, {
            eventId,
            responseId,
            attempt,
            err,
          })
        }
      }
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [eventId, responseId, retryToken])

  return { status, summaries, avgSentiment, refetch }
}
