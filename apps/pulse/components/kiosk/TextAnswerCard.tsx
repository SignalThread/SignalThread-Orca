'use client'

import { useState, type ReactNode } from 'react'

interface AnalysisInsights {
  summary: string
  sentiment: string
  sentimentScore: number
  themes: string[]
  actionItems: string[]
  keyQuote: string
}

interface Question {
  id: string
  text: string
  order: number
  isRequired: boolean
}

interface Branding {
  primaryButtonColor?: string | null
  primaryColor?: string | null
}

interface TextAnswerCardProps {
  responseId: string
  currentQuestion: Question
  isLastQuestion: boolean
  branding?: Branding | null
  onSpeakQuestion?: () => Promise<void> | void
  onComplete: (answerId: string, transcript?: string, analysis?: AnalysisInsights) => void
  onSkip: () => Promise<void> | void
  onCancel: () => void
  /** Voice + text: after “Hear question”, directly above the text input card */
  answerModeChoice?: ReactNode
  /** Renders the exact attendee card without creating or submitting a response. */
  preview?: boolean
}

export function TextAnswerCard({
  responseId,
  currentQuestion,
  isLastQuestion,
  branding,
  onSpeakQuestion,
  onComplete,
  onSkip,
  onCancel,
  answerModeChoice,
  preview = false,
}: TextAnswerCardProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleHearQuestion = async () => {
    if (!onSpeakQuestion) return
    try {
      setError(null)
      await Promise.resolve(onSpeakQuestion())
    } catch (e) {
      console.error('[TextAnswerCard] Hear question failed:', e)
    }
  }

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    if (preview) return

    setError(null)
    setSending(true)
    try {
      const res = await fetch('/api/answer/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          questionKey: currentQuestion.id,
          promptLabel: currentQuestion.text,
          text: trimmed,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success || !data.data?.answerId) {
        throw new Error(data.message || data.error || 'Could not save your answer')
      }
      const analysis = data.data.analysis
      const insights: AnalysisInsights | undefined = analysis
        ? {
            summary: analysis.summary,
            sentiment: analysis.sentiment,
            sentimentScore: analysis.sentimentScore,
            themes: analysis.themes,
            actionItems: analysis.actionItems,
            keyQuote: analysis.keyQuote,
          }
        : undefined
      onComplete(data.data.answerId, data.data.transcript, insights)
      setText('')
    } catch (e) {
      console.error('[TextAnswerCard] Submit failed:', e)
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="h-full min-h-0 bg-white md:min-h-[100svh]">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col justify-start px-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4 sm:px-8 sm:pt-5 md:px-10 md:pt-6">
        <div className="shrink-0 text-center">
          <h2 className="mx-auto max-w-[26ch] text-2xl sm:text-[2.05rem] md:text-[2.2rem] font-bold text-gray-900 leading-[1.15] px-1">
            {currentQuestion.text}
          </h2>
          <p className="mt-1.5 text-sm text-gray-500 sm:mt-2 sm:text-base">
            Share your answer in a sentence or two.
          </p>
        </div>

        {error && (
          <div className="mt-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:mt-5">
            <p className="text-sm font-medium text-red-800 sm:text-base">{error}</p>
          </div>
        )}

        <div className="mt-4 flex w-full flex-col items-center gap-3 sm:mt-5 sm:gap-4 md:mt-6 md:max-w-[420px] md:mx-auto">
          {onSpeakQuestion && (
            <div className="flex w-full max-w-[420px] justify-center">
              <button
                type="button"
                onClick={handleHearQuestion}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                    clipRule="evenodd"
                  />
                </svg>
                Hear question
              </button>
            </div>
          )}

          {answerModeChoice ? <div className="w-full max-w-[420px]">{answerModeChoice}</div> : null}

          <div className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-gray-50/80 shadow-sm px-4 py-3.5 sm:px-5 sm:py-4">
            <label htmlFor="kiosk-text-answer" className="sr-only">
              Your response
            </label>
            <textarea
              id="kiosk-text-answer"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              disabled={sending}
              placeholder="Type your response…"
              className="min-h-[7.5rem] w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:opacity-60 md:min-h-[9.5rem]"
            />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onCancel}
                disabled={sending}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={sending || !text.trim()}
                className={`rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                  !branding?.primaryButtonColor ? 'bg-neutral-950' : ''
                }`}
                style={branding?.primaryButtonColor ? { backgroundColor: branding.primaryButtonColor } : undefined}
              >
                {sending ? 'Sending…' : isLastQuestion ? 'Send' : 'Continue'}
              </button>
            </div>
            {!currentQuestion.isRequired && (
              <button
                type="button"
                onClick={() => void onSkip()}
                disabled={sending}
                className="mt-3 w-full text-center text-sm font-semibold text-gray-600 underline-offset-4 transition hover:text-gray-900 hover:underline disabled:opacity-50"
              >
                Skip this question
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
