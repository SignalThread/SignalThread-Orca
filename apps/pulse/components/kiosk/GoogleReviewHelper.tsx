'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { humanizeReviewText, sentimentToRating } from '@/lib/humanize-review'
import { useSummaryPolling } from '@/lib/hooks/useSummaryPolling'
import { SummaryLoader } from '@/components/kiosk/SummaryLoader'

const LOG = '[GoogleReview][GoogleReviewHelper]'

interface GoogleReviewHelperProps {
  completedAnswers: {
    questionText: string
    transcript?: string
    analysis?: {
      summary: string
      sentiment: string
      sentimentScore: number
      themes: string[]
      actionItems: string[]
      keyQuote: string
    }
  }[]
  googleReviewUrl?: string | null
  eventId?: string | null
  responseId?: string | null
}

export function GoogleReviewHelper({ completedAnswers, googleReviewUrl, eventId, responseId }: GoogleReviewHelperProps) {
  const [copied, setCopied] = useState(false)

  const { status, summaries, avgSentiment, refetch } = useSummaryPolling(eventId, responseId)

  useEffect(() => {
    const cid = responseId ?? 'unknown'
    console.info(`${LOG} review_page_mount`, {
      cid,
      eventId,
      responseId,
      completedAnswersCount: completedAnswers.length,
    })
  }, [eventId, responseId, completedAnswers.length])

  const buildReviewFromAnalysis = (): string | null => {
    if (summaries && summaries.length > 0) {
      return summaries.length === 1 ? summaries[0] : summaries.join(' ')
    }

    const existingSummaries = completedAnswers
      .map((a) => a.analysis?.summary)
      .filter((s): s is string => Boolean(s && s.trim()))

    if (existingSummaries.length === 0) return null

    return existingSummaries.length === 1 ? existingSummaries[0] : existingSummaries.join(' ')
  }

  const rawSummary = buildReviewFromAnalysis()

  const fallbackRating = (() => {
    const scores = completedAnswers
      .map((a) => a.analysis?.sentimentScore)
      .filter((s): s is number => s != null)
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined
  })()

  const ratingToUse =
    avgSentiment != null
      ? sentimentToRating(avgSentiment)
      : fallbackRating != null
        ? sentimentToRating(fallbackRating)
        : undefined

  const ratingForHumanize = ratingToUse ?? (rawSummary?.trim() ? 4 : undefined)

  const humanized = humanizeReviewText(rawSummary, ratingForHumanize)
  /** Prefer humanized copy; if humanize strips everything, still show AI synopsis (never empty composer in normal flow). */
  const finalReviewText = (humanized?.trim() || rawSummary?.trim()) ?? null

  const showError = status === 'error' && !finalReviewText
  const showSynopsis = Boolean(finalReviewText)
  const showLoader = !showSynopsis && !showError

  const renderedBranch = useMemo(() => {
    if (showLoader) return 'loading'
    if (showError) return 'error'
    if (showSynopsis) return 'synopsis'
    return 'unexpected'
  }, [showLoader, showError, showSynopsis])

  useEffect(() => {
    const cid = responseId ?? 'unknown'
    console.info(`${LOG} final_render_branch`, {
      cid,
      status,
      renderedBranch,
      hasRawSynopsisPayload: Boolean(rawSummary?.trim()),
      hasHumanized: Boolean(humanized?.trim()),
      hasFinalReviewText: Boolean(finalReviewText),
    })
  }, [status, rawSummary, humanized, finalReviewText, renderedBranch, responseId])

  useEffect(() => {
    if (!showLoader && (status === 'success' || status === 'error')) {
      const cid = responseId ?? 'unknown'
      console.info(`${LOG} loading_false`, { cid, status, renderedBranch })
    }
  }, [showLoader, status, renderedBranch, responseId])

  const synopsisLoggedRef = useRef(false)
  useEffect(() => {
    if (showSynopsis && finalReviewText && !synopsisLoggedRef.current) {
      synopsisLoggedRef.current = true
      console.info(`${LOG} synopsis_visible_in_ui`, {
        status,
        synopsisLength: finalReviewText.length,
        t: typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now(),
      })
    }
  }, [showSynopsis, finalReviewText, status])

  if (!googleReviewUrl) {
    return null
  }

  const handleCopy = async () => {
    if (!finalReviewText) return
    try {
      await navigator.clipboard.writeText(finalReviewText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error(`${LOG} copy failed`, err)
    }
  }

  const handleOpenReview = () => {
    window.open(googleReviewUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="mx-auto w-full max-w-lg shrink-0">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md">
        <div className="bg-blue-50/70 px-4 py-3 sm:px-8 sm:py-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-white shadow-sm sm:h-11 sm:w-11">
              <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-snug text-gray-900 sm:text-lg">Share on Google Reviews</h3>
              <p className="text-xs text-gray-500 sm:text-sm">It takes just 30 seconds</p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        <div className="px-4 pb-2 pt-4 sm:px-8 sm:pb-3 sm:pt-6">
          <div className="mb-4 flex justify-center gap-0.5 sm:mb-6 sm:gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <svg
                key={i}
                className="h-7 w-7 text-amber-400 drop-shadow-sm sm:h-8 sm:w-8"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ))}
          </div>

          <div className="mb-3 flex items-center gap-2.5 sm:mb-4 sm:gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-sm sm:h-8 sm:w-8 sm:text-sm">
              1
            </span>
            <span className="text-sm font-semibold text-gray-900">Copy your review below</span>
          </div>

          {showLoader ? (
            <SummaryLoader isReady={false} />
          ) : showError ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center sm:mb-5 sm:p-4">
              <p className="text-sm text-amber-900 font-medium mb-2">We couldn&apos;t load your generated review.</p>
              <p className="text-xs text-amber-800/90 mb-3">Your feedback was saved. You can try loading the review again.</p>
              <button
                type="button"
                onClick={() => {
                  console.info(`${LOG} retry clicked`)
                  refetch()
                }}
                className="text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="mb-1.5 max-h-[min(44svh,340px)] min-h-[11rem] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 sm:mb-2 sm:min-h-[9rem] sm:max-h-[min(38vh,300px)] sm:p-4">
                <p className="text-sm leading-relaxed text-gray-700 break-words whitespace-pre-wrap">{finalReviewText}</p>
              </div>
              <p className="mb-3 text-center text-xs text-gray-400 sm:mb-5">Generated from your feedback</p>
            </>
          )}

          <button
            onClick={handleCopy}
            disabled={!finalReviewText}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all sm:py-3 ${
              finalReviewText
                ? 'border-blue-600 text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-700 active:bg-blue-100 active:border-blue-800 shadow-sm hover:shadow'
                : 'border-gray-300 text-gray-500 bg-white cursor-not-allowed'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span>Copy This Review</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center justify-center px-4 pb-1 pt-2 sm:px-8 sm:pb-2 sm:pt-3">
          <div className="h-px flex-1 bg-gray-300" />
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-blue-400 bg-white shadow-md animate-bounce sm:h-12 sm:w-12">
            <svg
              className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>
          <div className="h-px flex-1 bg-gray-300" />
        </div>

        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom,10px))] pt-2 sm:px-8 sm:pb-8 sm:pt-4">
          <div className="mb-3 flex items-center gap-2.5 sm:mb-4 sm:gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-sm sm:h-8 sm:w-8 sm:text-sm">
              2
            </span>
            <span className="text-sm font-semibold text-gray-900">Open Google and paste your review</span>
          </div>

          <button
            onClick={handleOpenReview}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg active:bg-blue-800 sm:py-3.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Google Review Page
          </button>

          <p className="mt-2 text-center text-xs text-gray-400 sm:mt-3">
            A new tab will open. Just paste your review and hit submit!
          </p>
        </div>
      </div>
    </div>
  )
}
