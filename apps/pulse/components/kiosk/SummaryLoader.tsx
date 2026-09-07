'use client'

import { useEffect, useState } from 'react'

interface SummaryLoaderProps {
  isReady: boolean
  title?: string
  subtext?: string
}

export function SummaryLoader({
  isReady,
  title = 'Generating your review summary...',
  subtext = 'Almost there...'
}: SummaryLoaderProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (isReady) {
      setProgress(100)
      return
    }

    let currentProgress = 0
    let timer: number

    const updateProgress = () => {
      if (currentProgress < 25) {
        // Fast to 25%
        currentProgress += Math.random() * 10
        timer = window.setTimeout(updateProgress, 100)
      } else if (currentProgress < 70) {
        // Steady to 70%
        currentProgress += Math.random() * 5
        timer = window.setTimeout(updateProgress, 300)
      } else if (currentProgress < 85) {
        // Slow hold at ~85%
        currentProgress += Math.random() * 1
        timer = window.setTimeout(updateProgress, 800)
      } else {
        // Cap at 88% until ready
        currentProgress = 88
      }
      
      setProgress(Math.min(currentProgress, 88))
    }

    updateProgress()

    return () => clearTimeout(timer)
  }, [isReady])

  return (
    <div className="w-full max-w-md mx-auto py-6 flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
      <div className="mb-4 text-blue-500">
        <svg className="w-10 h-10 sm:w-12 sm:h-12 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      </div>
      <p className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
        {title}
      </p>
      <p className="text-sm text-gray-500 mb-6">
        {subtext}
      </p>
      
      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden relative shadow-inner">
        <div 
          className="absolute top-0 left-0 h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
        <div className="absolute inset-0 bg-white/20 animate-pulse" />
      </div>
    </div>
  )
}
