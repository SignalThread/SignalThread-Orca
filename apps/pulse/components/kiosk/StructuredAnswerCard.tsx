'use client'

import { useState, type ReactNode } from 'react'

export type StructuredQuestionType = 'RATING_1_TO_5' | 'RECOMMENDATION_0_TO_10' | 'YES_NO' | 'SINGLE_CHOICE' | 'SPEAKER_FEEDBACK'

interface StructuredQuestion {
  id: string
  questionId: string
  text: string
  type: StructuredQuestionType
  isRequired: boolean
  options?: string[]
}

interface Branding {
  primaryButtonColor?: string | null
  primaryColor?: string | null
}

interface StructuredAnswerCardProps {
  responseId: string
  currentQuestion: StructuredQuestion
  isLastQuestion: boolean
  branding?: Branding | null
  onHearQuestion?: () => Promise<void> | void
  onComplete: (answerId: string) => Promise<void> | void
  onSkip: () => Promise<void> | void
  onCancel: () => void
  sessionContext?: { name: string; speakers: Array<{ id: string; name: string }> } | null
  sectionLabel?: string
  helperText?: string
  displayAsStars?: boolean
  /** Renders the exact attendee card without creating or submitting a response. */
  preview?: boolean
  answerModeChoice?: ReactNode
}

export function getStructuredChoices(type: StructuredQuestionType): number[] {
  return type === 'RATING_1_TO_5' || type === 'SPEAKER_FEEDBACK'
    ? [1, 2, 3, 4, 5]
    : type === 'RECOMMENDATION_0_TO_10'
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      : type === 'YES_NO'
        ? [1, 0]
        : []
}

export function StructuredAnswerCard({
  responseId,
  currentQuestion,
  isLastQuestion,
  branding,
  onHearQuestion,
  onComplete,
  onSkip,
  onCancel,
  sessionContext,
  sectionLabel,
  helperText,
  displayAsStars = false,
  preview = false,
  answerModeChoice,
}: StructuredAnswerCardProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choices = currentQuestion.type === 'SINGLE_CHOICE'
    ? (currentQuestion.options ?? []).map((_, index) => index)
    : getStructuredChoices(currentQuestion.type)
  const isRecommendation = currentQuestion.type === 'RECOMMENDATION_0_TO_10'
  const isChoice = currentQuestion.type === 'YES_NO' || currentQuestion.type === 'SINGLE_CHOICE'
  const choiceLabel = (choice: number) => currentQuestion.type === 'YES_NO'
    ? (choice === 1 ? 'Yes' : 'No')
    : currentQuestion.type === 'SINGLE_CHOICE'
      ? currentQuestion.options?.[choice] ?? `Option ${choice + 1}`
      : String(choice)

  const submit = async () => {
    if (selected == null) {
      setError('Choose an answer before continuing.')
      return
    }

    setError(null)
    if (preview) return
    setIsSaving(true)
    try {
      const response = await fetch('/api/answer/structured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          questionId: currentQuestion.questionId,
          numericValue: selected,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.success || !body.data?.answerId) {
        throw new Error(body?.message || 'We could not save your answer. Please try again.')
      }
      await onComplete(body.data.answerId)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'We could not save your answer. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-full min-h-0 bg-white">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4 sm:px-8 sm:pt-6">
        {sessionContext && (
          <section className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-left sm:mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Session</p>
            <h2 className="mt-2 line-clamp-2 text-xl font-bold leading-snug text-gray-900">{sessionContext.name}</h2>
            {sessionContext.speakers.length > 0 && <p className="mt-2 text-sm leading-relaxed text-gray-600">{sessionContext.speakers.map((speaker) => speaker.name).join(' · ')}</p>}
          </section>
        )}
        <div className={sessionContext ? 'shrink-0 text-left' : 'shrink-0 text-center'}>
          <div className="mb-2 text-xs font-semibold uppercase text-gray-500">
            {sectionLabel ?? (currentQuestion.isRequired ? 'Required' : 'Optional')}
          </div>
          <h2 className="mx-auto max-w-[28ch] px-1 text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">
            {currentQuestion.text}
          </h2>
          <p className="mt-2 text-sm text-gray-500 sm:text-base">
            {helperText ?? (isRecommendation ? 'Select a number from 0 to 10.' : isChoice ? 'Select one answer.' : 'Select a rating from 1 to 5.')}
          </p>
        </div>
        {answerModeChoice ? <div className="mx-auto mt-4 w-full max-w-[420px]">{answerModeChoice}</div> : null}

        <div className="mx-auto mt-5 flex w-full max-w-2xl flex-1 flex-col justify-center sm:mt-7">
          {onHearQuestion && (
            <button
              type="button"
              onClick={() => void onHearQuestion()}
              disabled={isSaving}
              className="mx-auto mb-5 min-h-11 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50"
            >
              Hear question
            </button>
          )}

          <div
            role="radiogroup"
            aria-label={isRecommendation ? 'Recommendation from 0 to 10' : 'Rating from 1 to 5'}
            className={`grid gap-2 ${isRecommendation ? 'grid-cols-6 sm:grid-cols-11' : isChoice ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-5'}`}
          >
            {choices.map((choice) => {
              const isSelected = selected === choice
              return (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${choiceLabel(choice)}${isSelected ? ', selected' : ''}`}
                  onClick={() => {
                    setSelected(choice)
                    setError(null)
                  }}
                  disabled={isSaving}
                  className={`min-h-12 rounded-xl border-2 px-1 text-base font-bold transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 sm:min-h-14 ${
                    isSelected
                      ? 'border-neutral-950 bg-neutral-950 text-white shadow-sm'
                      : 'border-gray-200 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50'
                  } disabled:opacity-60`}
                >
                  {displayAsStars ? <span aria-hidden="true" className="text-3xl leading-none">{choice <= (selected ?? 0) ? '★' : '☆'}</span> : choiceLabel(choice)}
                  {isSelected && <span className="sr-only"> selected</span>}
                </button>
              )
            })}
          </div>

          {isRecommendation && (
            <div className="mt-2 flex justify-between text-xs font-medium text-gray-500">
              <span>Not at all likely</span>
              <span>Extremely likely</span>
            </div>
          )}

          <div aria-live="polite" className="min-h-12 pt-3 text-center">
            {error && <p className="text-sm font-medium text-red-700">{error}</p>}
          </div>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              {!currentQuestion.isRequired && (
                <button
                  type="button"
                  onClick={() => void onSkip()}
                  disabled={isSaving}
                  className="min-h-11 rounded-xl px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Skip this question
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={isSaving}
              className={`min-h-12 rounded-xl px-7 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                !branding?.primaryButtonColor ? 'bg-neutral-950' : ''
              }`}
              style={branding?.primaryButtonColor ? { backgroundColor: branding.primaryButtonColor } : undefined}
            >
              {isSaving ? 'Saving…' : isLastQuestion ? 'Finish' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
