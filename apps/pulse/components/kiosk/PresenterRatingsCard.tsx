'use client'

import { useState, type ReactNode } from 'react'
import { resolveSpeakerFeedbackQuestionText } from '@/lib/speaker-feedback-question'

interface PresenterRatingsCardProps {
  responseId: string
  questionId: string
  questionText: string
  speakers: Array<{ id: string; name: string }>
  branding?: { primaryButtonColor?: string | null } | null
  onComplete: (answerIds: string[]) => Promise<void> | void
  /** Renders the exact attendee card without creating or submitting responses. */
  preview?: boolean
  answerModeChoice?: ReactNode
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-8 w-8 sm:h-9 sm:w-9 ${filled ? 'fill-amber-400 text-amber-400' : 'fill-none text-gray-800'}`} stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 2.75 5.57 6.15.9-4.45 4.34 1.05 6.13L12 17.05l-5.5 2.89 1.05-6.13L3.1 9.47l6.15-.9L12 3Z" />
    </svg>
  )
}

export function PresenterRatingsCard({ responseId, questionId, questionText, speakers, branding, onComplete, preview = false, answerModeChoice }: PresenterRatingsCardProps) {
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolvedQuestionText = resolveSpeakerFeedbackQuestionText(questionText, speakers)

  const submit = async () => {
    if (speakers.some((speaker) => ratings[speaker.id] == null)) {
      setError('Rate each presenter before continuing.')
      return
    }
    setError(null)
    if (preview) return
    setIsSaving(true)
    try {
      const saved = await Promise.all(speakers.map(async (speaker) => {
        const response = await fetch('/api/answer/structured', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responseId, questionId, speakerId: speaker.id, numericValue: ratings[speaker.id] }),
        })
        const body = await response.json().catch(() => null)
        if (!response.ok || !body?.success || !body.data?.answerId) {
          throw new Error(body?.message || `We could not save ${speaker.name}'s rating. Please try again.`)
        }
        return body.data.answerId as string
      }))
      await onComplete(saved)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'We could not save your ratings. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4 sm:px-8 sm:pt-6">
        <div className="shrink-0">
          <h2 className="max-w-[24ch] text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">{resolvedQuestionText}</h2>
          <p className="mt-2 max-w-[38ch] text-base leading-relaxed text-gray-500">Consider expertise, subject knowledge, and overall teaching ability.</p>
        </div>
        {answerModeChoice ? <div className="mt-4 w-full max-w-[420px]">{answerModeChoice}</div> : null}
        <div className="mt-6 space-y-4 pb-4 sm:mt-8">
          {speakers.map((speaker) => {
            const rating = ratings[speaker.id]
            return <section key={speaker.id} className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900">{speaker.name}</h3>
              <div role="radiogroup" aria-label={`Rating for ${speaker.name}`} className="mt-3 flex gap-1.5 sm:gap-3">
                {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} stars${rating === value ? ', selected' : ''}`} disabled={isSaving} onClick={() => { setRatings((current) => ({ ...current, [speaker.id]: value })); setError(null) }} className="rounded-lg p-0.5 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-60"><StarIcon filled={Boolean(rating && value <= rating)} /></button>)}
              </div>
            </section>
          })}
        </div>
        <div aria-live="polite" className="min-h-8 pt-1">{error && <p className="text-sm font-medium text-red-700">{error}</p>}</div>
        <button type="button" onClick={() => void submit()} disabled={isSaving} className={`mt-2 min-h-12 w-full rounded-xl px-7 text-base font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${!branding?.primaryButtonColor ? 'bg-neutral-950' : ''}`} style={branding?.primaryButtonColor ? { backgroundColor: branding.primaryButtonColor } : undefined}>{isSaving ? 'Saving…' : 'Continue'}</button>
      </div>
    </div>
  )
}
