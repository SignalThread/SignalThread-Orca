'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

interface WalkthroughModalProps {
  isOpen: boolean
  onClose: () => void
  accountSlug: string | null
}

export function WalkthroughModal({ isOpen, onClose, accountSlug }: WalkthroughModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-3xl w-full border border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            How to Launch Your First Survey
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Video placeholder */}
          <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-zinc-500 dark:text-zinc-400 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Video placeholder</p>
            </div>
          </div>

          {/* Clickable links */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <Link
              href={`/app/settings/profile${accountSlug ? `?account=${accountSlug}` : ''}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
            >
              Go to Account Setup
            </Link>
            <Link
              href={`/app/surveys/create${accountSlug ? `?account=${accountSlug}` : ''}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
            >
              Create Survey Now
            </Link>
            <a
              href="/kiosk?eventId=retail-demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
            >
              View Demo Kiosk
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
