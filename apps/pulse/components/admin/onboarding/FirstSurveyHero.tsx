'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { WalkthroughModal } from './WalkthroughModal'

interface FirstSurveyHeroProps {
  accountSlug: string | null
  isRetail?: boolean
  eventPath?: string
  eventCreatePath?: string
  hasEvent?: boolean
}

export function FirstSurveyHero({
  accountSlug,
  isRetail,
  eventPath,
  eventCreatePath,
  hasEvent = false,
}: FirstSurveyHeroProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)

  const createSurveyPath = isRetail
    ? `/app/surveys/create${accountSlug ? `?account=${accountSlug}` : ''}`
    : hasEvent
      ? eventPath || `/app${accountSlug ? `?account=${accountSlug}` : ''}`
      : eventCreatePath || `/app/events/new${accountSlug ? `?account=${accountSlug}` : ''}`
  const primaryActionLabel = isRetail ? 'Create Survey' : hasEvent ? 'Open Event' : 'Create Event'
  const heroTitle = isRetail ? 'Launch Your First Survey' : 'Create Your First Event'
  const heroDescription = isRetail
    ? 'Collect real voice feedback in minutes. Set up your survey, add questions, and go live.'
    : 'Create an event workspace first. Surveys, kiosk links, and intelligence can be managed from the event.'
  const firstStepTitle = isRetail ? 'Create a Survey' : 'Create an Event'
  const firstStepDescription = isRetail
    ? 'Give it a name and choose your location.'
    : 'Give the event a name and choose its workspace.'
  const secondStepTitle = isRetail ? 'Add Your Questions' : 'Add Surveys Later'
  const secondStepDescription = isRetail
    ? 'Write prompts that capture what matters most.'
    : 'Create one or more surveys inside the event when you are ready.'
  const thirdStepTitle = isRetail ? 'Click Start Survey' : 'Inspect Event Intelligence'
  const thirdStepDescription = isRetail
    ? 'Your kiosk is live and ready to collect feedback.'
    : 'Roll up feedback across surveys once attendees start responding.'

  return (
    <>
      <Card
        className="mb-10 shadow-sm rounded-xl overflow-hidden"
        padding="none"
        variant="default"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 p-6 sm:p-8">
          <div className="flex flex-col">
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              {heroTitle}
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              {heroDescription}
            </p>

            {/* Steps */}
            <div className="space-y-4 mb-6">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{firstStepTitle}</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{firstStepDescription}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{secondStepTitle}</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{secondStepDescription}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{thirdStepTitle}</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{thirdStepDescription}</p>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => router.push(createSurveyPath)}
                className="inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                {primaryActionLabel}
              </Button>
            </div>
          </div>

          {/* Right column - walkthrough video preview */}
          <div className="flex flex-col items-center justify-center">
            <div
              onClick={() => setModalOpen(true)}
              className="w-full aspect-video max-w-md bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-2 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                  <svg className="w-10 h-10 text-zinc-500 dark:text-zinc-400 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
                  </svg>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">See how it works</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-10">
        No credit card required. Start collecting authentic voice feedback in under 5 minutes.
      </p>

      <WalkthroughModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        accountSlug={accountSlug}
      />
    </>
  )
}
