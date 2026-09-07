/**
 * Attendee-scoped view of a legacy response poll.
 *
 * The kiosk thank-you screen polls GET /api/events/[eventId]/responses/[responseId]
 * with nothing but the response id it was issued. That capability must keep
 * working for QR codes and kiosk builds already in the field, so the URL is
 * unchanged — but an anonymous caller only ever receives this reduced payload:
 * lifecycle status and each answer's synopsis. No transcript text, object keys,
 * anonymous ids, or event metadata leave the server, and the window closes
 * shortly after completion so a leaked id stops being useful.
 */

export const ATTENDEE_SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000

type SummaryAnalysis = {
  summary: string | null
  sentimentScore: number | null
  themesJson: unknown
} | null

export type AttendeeSummarySourceResponse = {
  id: string
  eventId: string
  status: string
  startedAt: Date
  completedAt: Date | null
  answers: Array<{
    status: string
    answerTranscript: { text: string | null } | null
    answerAnalysis: SummaryAnalysis
  }>
}

export function isAttendeeSummaryWindowOpen(
  response: Pick<AttendeeSummarySourceResponse, 'status' | 'completedAt'>,
  now: Date = new Date(),
): boolean {
  if (response.status === 'IN_PROGRESS') return true
  if (response.status !== 'COMPLETED' || !response.completedAt) return false
  return now.getTime() - response.completedAt.getTime() <= ATTENDEE_SUMMARY_WINDOW_MS
}

export function buildAttendeeSummaryPayload(response: AttendeeSummarySourceResponse) {
  const answers = response.answers.map((answer) => ({
    status: answer.status,
    hasTranscript: Boolean(answer.answerTranscript?.text?.trim()),
    analysis: answer.answerAnalysis
      ? {
          summary: answer.answerAnalysis.summary,
          sentimentScore: answer.answerAnalysis.sentimentScore,
          evidenceState: (answer.answerAnalysis.themesJson as { evidenceState?: string } | null)?.evidenceState,
        }
      : null,
  }))

  return {
    id: response.id,
    eventId: response.eventId,
    status: response.status,
    startedAt: response.startedAt,
    completedAt: response.completedAt,
    scope: 'attendee' as const,
    answers,
    answersCompleted: answers.filter((answer) => answer.status === 'COMPLETED').length,
    answersTotal: answers.length,
  }
}
