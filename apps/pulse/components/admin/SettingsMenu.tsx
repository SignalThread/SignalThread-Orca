'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ThemeSwitcher } from '@/components/theme/ThemeSwitcher'
import { createClient } from '@/lib/supabase/client'
import { isEventsAccount } from '@/lib/account-product-mode'
import { loadAccountContext } from '@/lib/account-context-client'

export function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  /** When the product tour opens the menu, ignore outside-dismiss so clicks pass through the dimmed overlay don't collapse the dropdown. */
  const tourControlledOpenRef = useRef(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const accountSlug = searchParams.get('account')
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
        if (!cancelled) setAccountContext({ slug: accountSlug, accountType: account.accountType, settled: true })
      })
      .catch(() => {
        if (!cancelled) setAccountContext({ slug: accountSlug, accountType: null, settled: true })
      })

    return () => {
      cancelled = true
    }
  }, [accountSlug])

  const currentAccountContext = accountContext?.slug === accountSlug ? accountContext : null

  // Product Tour is SMB-only and requires positive confirmation from the
  // canonical account context. A missing account param or a failed context
  // load never exposes the SMB tour entry (Events users may hit both states).
  const canStartProductTour = Boolean(accountSlug)
    && currentAccountContext?.settled === true
    && currentAccountContext.accountType !== null
    && !isEventsAccount(currentAccountContext.accountType)

  // Help is currently an SMB onboarding surface. Like Product Tour, wait for
  // the canonical account context rather than briefly exposing it to Events
  // while the product mode is unresolved.
  const canAccessSmbHelp = Boolean(accountSlug)
    && currentAccountContext?.settled === true
    && currentAccountContext.accountType !== null
    && !isEventsAccount(currentAccountContext.accountType)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tourControlledOpenRef.current) return
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    function onTourSettingsToggle(e: Event) {
      const ce = e as CustomEvent<{ open?: boolean }>
      if (typeof ce.detail?.open !== 'boolean') return
      tourControlledOpenRef.current = ce.detail.open
      setIsOpen(ce.detail.open)
    }
    window.addEventListener(
      'signalthread:product-tour-settings',
      onTourSettingsToggle as EventListener
    )
    return () =>
      window.removeEventListener(
        'signalthread:product-tour-settings',
        onTourSettingsToggle as EventListener
      )
  }, [])

  const profileUrl = accountSlug ? `/app/settings/profile?account=${accountSlug}` : '/app/settings/profile'

  const handleLogout = async () => {
    tourControlledOpenRef.current = false
    setIsLoggingOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      console.error('Error signing out:', error)
      setIsLoggingOut(false)
    }
  }

  const handleStartProductTour = () => {
    if (!canStartProductTour) return
    tourControlledOpenRef.current = false
    setIsOpen(false)
    const params = new URLSearchParams()
    if (accountSlug) {
      params.set('account', accountSlug)
    }
    params.set('startTour', '1')
    router.push(`/app?${params.toString()}`)
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Settings Icon Button */}
      <button
        onClick={() => {
          tourControlledOpenRef.current = false
          setIsOpen((v) => !v)
        }}
        className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        aria-label="Settings"
        type="button"
      >
        <svg
          className="w-5 h-5 text-zinc-600 dark:text-zinc-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/5 z-50 overflow-hidden"
          data-tour="settings-menu-highlight"
        >
          {/* Account Section */}
          <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Account</p>
          </div>

          <div className="py-1.5">
            {/* Profile */}
            <a
              href={profileUrl}
              className="flex items-center gap-3 px-3 py-2 mx-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              onClick={() => {
                tourControlledOpenRef.current = false
                setIsOpen(false)
              }}
            >
              <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </a>

            {canStartProductTour && <button
              type="button"
              onClick={handleStartProductTour}
              className="flex items-center gap-3 w-[calc(100%-0.75rem)] px-3 py-2 mx-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-4.586-2.65A1 1 0 008.666 9.39v5.22a1 1 0 001.5.866l4.586-2.65a1 1 0 000-1.732z" />
                <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
              </svg>
              Product Tour
            </button>}

            {canAccessSmbHelp && (
              <a
                href={`/help?account=${accountSlug}`}
                className="flex items-center gap-3 px-3 py-2 mx-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                onClick={() => {
                  tourControlledOpenRef.current = false
                  setIsOpen(false)
                }}
              >
                <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Help
              </a>
            )}

            {/* Log out */}
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-3 w-[calc(100%-0.75rem)] px-3 py-2 mx-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {isLoggingOut ? 'Signing out...' : 'Log out'}
            </button>
          </div>

          {/* Preferences Section */}
          <div className="px-3 py-2.5 border-t border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Preferences</p>
          </div>

          <div className="px-4 py-3">
            <ThemeSwitcher />
          </div>
        </div>
      )}
    </div>
  )
}
