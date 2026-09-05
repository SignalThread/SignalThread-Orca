'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTourContext } from './TourContext'
import { isEventsAccount } from '@/lib/account-product-mode'
import { dismissTour, shouldAutoStartTour } from '@/lib/tour-preference'
import { loadAccountContext } from '@/lib/account-context-client'

export interface TourStep {
  target: string | null
  title: string
  body: string
  /** Alternate body when no surveys (for survey-step) */
  bodyNoSurveys?: string
  navigateTo?: string
  /** Tab to show when on profile page (locations | consent | branding | billing | users) */
  tourTab?: 'locations' | 'consent' | 'branding' | 'billing' | 'users'
}

/** Settings menu dropdown must open while this tour step is active so Help / Product Tour are visible. */
const PRODUCT_TOUR_SETTINGS_EVENT = 'signalthread:product-tour-settings' as const

const BASE_TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome',
    body: "This is a quick setup tour. We'll walk you through Account Setup, Profile Settings, and managing surveys.",
  },
  {
    target: 'account-setup-card',
    title: 'Account Setup',
    body: 'Start here to configure your profile, locations/teams, and preferences. Click this card to open Profile Settings.',
  },
  {
    target: 'tab-locations',
    title: 'Locations/Teams',
    body: 'Add locations/teams and connect your Google Review link for post-survey routing. Customers can be directed to leave a review after completing the survey.',
    tourTab: 'locations',
  },
  {
    target: 'consent-tab',
    title: 'Consent Screen',
    body: 'Customize the introduction your customers see before starting a survey. Edit the title, subtitle, and consent items.',
    tourTab: 'consent',
  },
  {
    target: 'branding-tab',
    title: 'Branding',
    body: 'Upload your logo and configure brand colors. Your logo appears on the consent screen and completion page.',
    tourTab: 'branding',
  },
  {
    target: 'locations-surveys-list',
    title: 'Locations/Teams & Surveys',
    body: 'Your locations/teams and surveys appear here. Each survey row has action buttons to manage it.',
  },
  {
    target: 'survey-row',
    title: 'Survey Row',
    body: 'Each survey has a row with its name, status, and action buttons.',
  },
  {
    target: 'survey-action-analytics',
    title: 'View Analytics',
    body: 'Open the analytics dashboard to see sentiment, themes, and performance insights from your survey responses.',
  },
  {
    target: 'survey-action-edit',
    title: 'Edit',
    body: 'Edit the survey questions, flow, and settings.',
  },
  {
    target: 'survey-action-copy',
    title: 'Duplicate Surveys Fast',
    body: 'Use Copy Survey to duplicate an existing survey, including its questions and configuration. Great for creating variations without starting over.',
  },
  {
    target: 'survey-action-status',
    title: 'Open / Close Survey',
    body: 'Toggle the survey on or off. Active surveys accept responses; closed ones do not.',
  },
  {
    target: 'survey-action-kiosk',
    title: 'Open Kiosk',
    body: 'Open the kiosk experience in a new tab for customers to take the survey.',
  },
  {
    target: 'survey-action-qr',
    title: 'Download QR Code',
    body: 'Download a QR code that opens this survey\'s kiosk experience for easy sharing.',
  },
  {
    target: 'survey-action-delete',
    title: 'Delete Survey',
    body: 'Permanently remove this survey and all associated responses. Use with caution.',
  },
  {
    target: 'create-survey-button',
    title: 'Create Survey',
    body: "You don't have any surveys yet. Create your first survey to get started.",
  },
  {
    target: 'settings-menu-highlight',
    title: 'Help & Product Tour',
    body: 'Need a refresher? Open the settings menu anytime to restart the product tour or access help documentation.',
  },
  {
    target: '__final__',
    title: 'Get Started',
    body: 'You’re all set to begin collecting feedback and exploring insights across your surveys.',
  },
]

const EVENT_TOUR_STEP_OVERRIDES: Partial<Record<string, Partial<TourStep>>> = {
  __welcome__: {
    title: 'Welcome',
    body: "This is a quick setup tour. We'll walk you through Event setup, Event workspaces, and managing surveys inside Events.",
  },
  'account-setup-card': {
    body: 'Start here to configure your Event profile, Event workspaces, and preferences. Click this card to open Profile Settings.',
  },
  'tab-locations': {
    title: 'Event Workspaces',
    body: 'Use Event workspaces to organize where attendee feedback is collected for your Events.',
  },
  'consent-tab': {
    body: 'Customize the introduction attendees see before starting an event survey. Edit the title, subtitle, and consent items.',
  },
  'locations-surveys-list': {
    title: 'Event Workspaces & Events',
    body: 'Your Event workspaces and Event containers appear here. Open an Event to manage its surveys and command center.',
  },
  'survey-row': {
    title: 'Event Row',
    body: 'Each Event row has its name, status, and event actions.',
  },
  'survey-action-analytics': {
    title: 'Open Event',
    body: 'Open the Event detail surface to manage surveys and view the command center.',
  },
  'survey-action-edit': {
    title: 'Edit Event',
    body: 'Edit the Event or its launch-ready event voice survey where supported.',
  },
  'survey-action-copy': {
    title: 'Duplicate Event',
    body: 'Copy an Event container when you need a similar event setup.',
  },
  'survey-action-status': {
    title: 'Activate / Pause Event Feedback',
    body: 'Toggle whether the Event feedback experience is accepting responses.',
  },
  'survey-action-kiosk': {
    title: 'Open Event Kiosk',
    body: 'Open the kiosk experience in a new tab for attendees to give live feedback.',
  },
  'survey-action-qr': {
    title: 'Download Event QR Code',
    body: 'Download a QR code that opens the Event feedback kiosk.',
  },
  'survey-action-delete': {
    title: 'Delete Event',
    body: 'Permanently remove this Event and associated attendee responses. Use with caution.',
  },
  'create-survey-button': {
    title: 'Create Event',
    body: 'Create your first Event container to get started.',
  },
  __final__: {
    body: 'You’re all set to collect live event feedback and explore event intelligence.',
  },
}

export function getTourSteps(isEventsAccount: boolean): TourStep[] {
  if (!isEventsAccount) return BASE_TOUR_STEPS

  return BASE_TOUR_STEPS.map((step, index) => {
    const key = step.target ?? (index === 0 ? '__welcome__' : '')
    const override = EVENT_TOUR_STEP_OVERRIDES[key]
    return override ? { ...step, ...override } : step
  })
}

/** Poll until element exists, with timeout. */
function waitForSelector(
  selector: string,
  options?: { timeout?: number; interval?: number }
): Promise<Element | null> {
  const { timeout = 10000, interval = 50 } = options ?? {}
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const el = document.querySelector(selector)
      if (el) {
        resolve(el)
        return
      }
      if (Date.now() - start >= timeout) {
        resolve(null)
        return
      }
      setTimeout(check, interval)
    }
    check()
  })
}

/** Wait for DOM + scroll completion before showing a step. */
function waitForScrollAndDom(
  targetSelector: string,
  options?: { scrollBehavior?: ScrollBehavior; delayAfterScroll?: number; waitFirst?: boolean }
): Promise<Element | null> {
  const { scrollBehavior = 'smooth', delayAfterScroll = 450, waitFirst = false } = options ?? {}
  return new Promise((resolve) => {
    const finish = () => {
      setTimeout(() => {
        const found = document.querySelector(targetSelector)
        resolve(found)
      }, delayAfterScroll)
    }
    if (waitFirst) {
      waitForSelector(targetSelector).then((el) => {
        if (el) {
          el.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
          finish()
        } else {
          resolve(null)
        }
      })
    } else {
      const el = document.querySelector(targetSelector)
      if (el) {
        el.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
        finish()
      } else {
        resolve(null)
      }
    }
  })
}

export function ProductTour() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isCentered, setIsCentered] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const pendingJustResolvedRef = useRef(false)
  const autoStartEvaluatedRef = useRef(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const accountSlug = searchParams.get('account')
  const startTourParam = searchParams.get('startTour')
  const tourCtx = useTourContext()
  const isOnProfile = pathname?.includes('/settings/profile')
  const [accountContext, setAccountContext] = useState<{ slug: string; accountType: string | null; settled: boolean } | null>(null)

  useEffect(() => {
    if (!accountSlug) {
      setAccountContext(null)
      return
    }

    let cancelled = false
    setAccountContext({ slug: accountSlug, accountType: null, settled: false })

    loadAccountContext(accountSlug)
      .then((account) => {
        if (!cancelled) {
          setAccountContext({ slug: accountSlug, accountType: account.accountType, settled: true })
        }
      })
      .catch(() => {
        if (!cancelled) setAccountContext({ slug: accountSlug, accountType: null, settled: true })
      })

    return () => {
      cancelled = true
    }
  }, [accountSlug])

  const currentAccountContext = accountContext?.slug === accountSlug ? accountContext : null
  const accountType = currentAccountContext?.accountType ?? null
  const accountTypeLoading = Boolean(accountSlug) && currentAccountContext?.settled !== true

  useEffect(() => {
    if (accountTypeLoading || startTourParam === '1') return
    // The tour is SMB-only. It requires positive non-Events confirmation from
    // the canonical account context: a missing account param or a failed
    // context load must never fall back to launching the SMB tour.
    if (!accountSlug || accountType === null) {
      setVisible(false)
      return
    }
    if (isEventsAccount(accountType)) {
      autoStartEvaluatedRef.current = true
      setVisible(false)
      tourCtx?.setTourTab(null)
      return
    }
    if (autoStartEvaluatedRef.current) return
    autoStartEvaluatedRef.current = true
    setVisible(shouldAutoStartTour())
  }, [accountSlug, accountType, accountTypeLoading, startTourParam, tourCtx])

  const tourSteps = getTourSteps(isEventsAccount(accountType))
  const currentStep = tourSteps[step]

  /** Open/close Settings dropdown so Help / Product Tour items exist in the DOM for the tour step */
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent(PRODUCT_TOUR_SETTINGS_EVENT, {
        detail: {
          open: Boolean(!isEventsAccount(accountType) && visible && currentStep?.target === 'settings-menu-highlight'),
        },
      })
    )
  }, [accountType, visible, currentStep?.target])
  const isFinal = currentStep?.target === '__final__'

  const updateTargetRect = useCallback((selector: string | null) => {
    if (!selector || selector === '__final__') {
      setTargetRect(null)
      setIsCentered(true)
      return
    }
    const el = document.querySelector(`[data-tour="${selector}"]`)
    if (el) {
      setTargetRect(el.getBoundingClientRect())
      setIsCentered(false)
    } else {
      setTargetRect(null)
      setIsCentered(selector === null || selector === '__final__')
    }
  }, [])

  // Resize listener
  useEffect(() => {
    if (!currentStep?.target) return
    const handler = () => updateTargetRect(currentStep.target!)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [currentStep?.target, updateTargetRect])

  // Resolve pending target (wait + scroll + delay) for survey step and locations-panel
  useEffect(() => {
    if (!pendingTarget) return
    const sel = `[data-tour="${pendingTarget}"]`
    const scrollToFirst = [
      'survey-action-analytics',
      'survey-action-edit',
      'survey-action-copy',
      'survey-action-status',
      'survey-action-kiosk',
      'survey-action-qr',
      'survey-action-delete',
    ]
    const scrollTo =
      pendingTarget === 'settings-menu-highlight'
        ? sel
        : scrollToFirst.includes(pendingTarget)
          ? '[data-tour="survey-row"]'
          : sel
    const waitFirst = [
      'locations-surveys-list',
      'survey-row',
      'tab-locations',
      'consent-tab',
      'branding-tab',
      'create-survey-button',
      'settings-menu-highlight',
      ...scrollToFirst,
    ].includes(pendingTarget)
    waitForScrollAndDom(scrollTo, { waitFirst }).then(() => {
      const el = document.querySelector(sel)
      if (el) {
        const rect = el.getBoundingClientRect()
        setTargetRect(rect)
        setIsCentered(false)
      } else {
        setTargetRect(null)
        setIsCentered(true)
      }
      pendingJustResolvedRef.current = true
      setPendingTarget(null)
    })
  }, [pendingTarget])

  // Normal step: update rect when step or pathname changes
  useEffect(() => {
    if (pendingTarget) return
    if (pendingJustResolvedRef.current) {
      pendingJustResolvedRef.current = false
      return
    }
    let t = currentStep?.target
    if (!t || t === '__final__') {
      setTargetRect(null)
      setIsCentered(true)
      return
    }
    const needsScrollAndWait = [
      'locations-surveys-list', 'survey-row',
      'survey-action-analytics', 'survey-action-edit', 'survey-action-copy', 'survey-action-status',
      'survey-action-kiosk', 'survey-action-qr', 'survey-action-delete',
      'tab-locations', 'consent-tab', 'branding-tab',
      'create-survey-button',
      'settings-menu-highlight',
    ]
    if (needsScrollAndWait.includes(t)) {
      setTargetRect(null)
      setIsCentered(true)
      setPendingTarget(t)
      return
    }
    const el = document.querySelector(`[data-tour="${t}"]`)
    if (el) {
      setTargetRect(el.getBoundingClientRect())
      setIsCentered(false)
    } else {
      setTargetRect(null)
      setIsCentered(t === null)
    }
  }, [step, pathname, currentStep?.target, pendingTarget])

  // Sync tour tab when showing profile steps
  useEffect(() => {
    if (isEventsAccount(accountType) || !tourCtx || !currentStep?.tourTab) return
    if (isOnProfile) {
      tourCtx.setTourTab(currentStep.tourTab)
    }
  }, [accountType, tourCtx, currentStep?.tourTab, isOnProfile, step])

  // Imperative entrypoint: ?startTour=1 starts the guided product tour.
  // Same positive non-Events gate as auto-start: no confirmed SMB context, no tour.
  useEffect(() => {
    if (startTourParam !== '1' || accountTypeLoading) return

    if (!accountSlug || accountType === null || isEventsAccount(accountType)) {
      autoStartEvaluatedRef.current = true
      setVisible(false)
      tourCtx?.setTourTab(null)
      const next = new URLSearchParams(searchParams.toString())
      next.delete('startTour')
      const query = next.toString()
      router.replace(`${pathname}${query ? `?${query}` : ''}`)
      return
    }

    autoStartEvaluatedRef.current = true
    setStep(0)
    setPendingTarget(null)
    setTargetRect(null)
    setIsCentered(true)
    setVisible(true)
    tourCtx?.setTourTab(null)

    const next = new URLSearchParams(searchParams.toString())
    next.delete('startTour')
    const query = next.toString()
    router.replace(`${pathname}${query ? `?${query}` : ''}`)
  }, [accountSlug, accountType, accountTypeLoading, pathname, router, searchParams, startTourParam, tourCtx])

  const handleNext = () => {
    if (step >= tourSteps.length - 1) {
      dismissTour()
      setVisible(false)
      tourCtx?.setTourTab(null)
      return
    }

    // Navigate to profile after Account Setup card step
    if (step === 1 && !isOnProfile && accountSlug) {
      tourCtx?.setTourTab('locations')
      router.push(`/app/settings/profile?account=${accountSlug}`)
    }
    // Navigate back to dashboard after Branding step (step 4)
    else if (step === 4 && isOnProfile && accountSlug) {
      tourCtx?.setTourTab(null)
      router.push(`/app?account=${accountSlug}`)
    }

    setStep((s) => s + 1)
  }

  const handleBack = () => {
    if (step <= 0) return

    const prevStep = tourSteps[step - 1]

    // Going back from profile to dashboard (from Locations step)
    if (step === 2 && isOnProfile && accountSlug) {
      tourCtx?.setTourTab(null)
      router.push(`/app?account=${accountSlug}`)
    }
    // Going back within profile tabs - sync tab
    else if (isOnProfile && prevStep?.tourTab) {
      tourCtx?.setTourTab(prevStep.tourTab)
    }

    setStep((s) => s - 1)
  }

  const handleExit = () => {
    dismissTour()
    setVisible(false)
    tourCtx?.setTourTab(null)
  }

  const displayBody = currentStep?.body ?? ''

  if (!accountSlug || accountTypeLoading || accountType === null || isEventsAccount(accountType) || !visible) return null

  return (
    <>
      {/* Dark backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/60"
        style={{ pointerEvents: 'none' }}
        aria-hidden
      />

      {/* Highlight cutout (when target exists) */}
      {targetRect && !isCentered && (
        <div
          className="fixed z-[9999] rounded-lg ring-2 ring-white ring-offset-2 ring-offset-transparent pointer-events-none"
          style={{
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
          aria-hidden
        />
      )}

      {/* Tooltip — hide while waiting for target to avoid "load in middle then move" */}
      {!pendingTarget && (
      <div
        className={`fixed z-[10000] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-5 max-w-sm ${
          isCentered
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
            : ''
        }`}
        style={
          !isCentered && targetRect
            ? (() => {
                const tw = 320
                const th = currentStep?.target === 'survey-action-delete' ? 340 : 280
                const pad = 16
                const gap = 12
                const clampX = (x: number) =>
                  Math.min(Math.max(x, pad), window.innerWidth - tw - pad)
                const centerX = targetRect.left + targetRect.width / 2 - tw / 2

                const isLocationsSurveysList = currentStep?.target === 'locations-surveys-list'
                const isSurveyDelete = currentStep?.target === 'survey-action-delete'
                const isSurveySection = ['locations-surveys-list', 'survey-row'].includes(currentStep?.target || '')

                if (isLocationsSurveysList || isSurveyDelete) {
                  return {
                    left: clampX(centerX),
                    top: Math.max(pad, targetRect.top - th - gap),
                  }
                }

                const rightSpace = window.innerWidth - targetRect.right
                const bottomSpace = window.innerHeight - targetRect.bottom
                const spaceAbove = targetRect.top

                if (rightSpace >= tw + gap && rightSpace >= bottomSpace && rightSpace >= spaceAbove) {
                  return { left: targetRect.right + gap, top: targetRect.top }
                }
                if (spaceAbove >= th + gap && (spaceAbove >= bottomSpace || bottomSpace < 120)) {
                  return {
                    left: clampX(centerX),
                    top: targetRect.top - th - gap,
                  }
                }
                return {
                  left: clampX(centerX),
                  top: targetRect.bottom + gap,
                }
              })()
            : undefined
        }
      >
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          {currentStep?.title}
        </h3>
        {currentStep?.target === 'survey-action-delete' && (
          <div
            className="mb-3 flex gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800/50"
            role="note"
          >
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {isEventsAccount(accountType)
                ? 'This permanently deletes the Event and its attendee responses.'
                : 'This permanently deletes the survey and its responses.'}
            </span>
          </div>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          {displayBody}
        </p>

        {step === 1 && !isOnProfile && accountSlug && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
            Click Next to go to Profile Settings
          </p>
        )}
        {step === 4 && isOnProfile && accountSlug && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
            Click Next to return to the dashboard
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleExit}
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            Exit Tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-2 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity"
            >
              {step === tourSteps.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
      )}
    </>
  )
}
