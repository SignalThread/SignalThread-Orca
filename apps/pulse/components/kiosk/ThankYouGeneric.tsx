'use client'

/**
 * Generic thank-you confirmation screen for kiosk.
 * Used when no Google review link is configured.
 * No external links, no CTA — strictly a confirmation screen.
 */
import { useSummaryPolling, type SummaryPollStatus } from '@/lib/hooks/useSummaryPolling'
import { SummaryLoader } from '@/components/kiosk/SummaryLoader'

export type ThankYouGenericViewState = 'confirmation' | 'loading' | 'error' | 'summary'

export function resolveThankYouGenericViewState(
  status: SummaryPollStatus,
  finalSummary: string | null,
): ThankYouGenericViewState {
  if (finalSummary) return 'summary'
  if (status === 'error') return 'error'
  if (status === 'success') return 'confirmation'
  return 'loading'
}

function PlainConfirmationCard() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm px-6 py-6 sm:px-8 sm:py-7">
      <p className="text-lg font-bold text-gray-900 text-center mb-2">✨ We appreciate you ✨</p>
      <p className="text-sm sm:text-base text-gray-600 text-center leading-relaxed">
        Your voice matters to us. We review every response to continuously improve our service.
      </p>
    </div>
  )
}

export function ThankYouGeneric({ eventId, responseId }: { eventId?: string | null; responseId?: string | null }) {
  const { status, summaries, refetch } = useSummaryPolling(eventId, responseId)

  const finalSummary =
    summaries.length > 0 ? (summaries.length === 1 ? summaries[0] : summaries.join(' ')) : null
  const viewState = resolveThankYouGenericViewState(status, finalSummary)

  return (
    <div className="min-h-[100svh] bg-gradient-to-br from-emerald-50/50 via-white to-white flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200/50 mb-6">
        <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Thank You!</h1>

      <p className="text-base sm:text-lg text-gray-600 text-center max-w-md mb-8">
        Your feedback has been recorded and will help us serve you better.
      </p>

      {!eventId || !responseId ? (
        <PlainConfirmationCard />
      ) : viewState === 'loading' ? (
        <SummaryLoader isReady={false} title="Generating your review summary..." />
      ) : viewState === 'confirmation' ? (
        <PlainConfirmationCard />
      ) : viewState === 'error' ? (
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50/80 shadow-sm px-6 py-6 text-center">
          <p className="text-sm font-medium text-amber-900 mb-2">We couldn&apos;t load your summary yet.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-semibold text-amber-900 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-blue-50/70 px-5 py-4 border-b border-gray-100 flex items-center justify-center">
            <span className="text-sm font-semibold text-blue-800">AI-generated feedback summary</span>
          </div>
          <div className="px-6 py-6 sm:px-8 sm:py-7">
            <p className="text-sm sm:text-base text-gray-700 text-center leading-relaxed">{finalSummary}</p>
          </div>
        </div>
      )}
    </div>
  )
}
