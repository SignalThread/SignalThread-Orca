'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { loadAccountContext } from '@/lib/account-context-client'
import { isEventsAccount } from '@/lib/account-product-mode'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
}

interface ResolvedAccountThemeContext {
  slug: string
  accountType: string | null
  settled: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const accountSlug = searchParams.get('account')?.trim() || null
  const [storedTheme, setStoredTheme] = useState<Theme | null>(null)
  const [storedThemeLoaded, setStoredThemeLoaded] = useState(false)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const [accountContext, setAccountContext] = useState<ResolvedAccountThemeContext | null>(null)

  // Read a user's explicit choice before paint. Without a choice, an account
  // URL deliberately starts light until its canonical product context arrives.
  useLayoutEffect(() => {
    const candidate = localStorage.getItem('theme')
    setStoredTheme(isTheme(candidate) ? candidate : null)
    setStoredThemeLoaded(true)
  }, [])

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
    return () => { cancelled = true }
  }, [accountSlug])

  const currentAccountContext = accountContext?.slug === accountSlug ? accountContext : null
  // An account-scoped page is light unless canonical context positively
  // identifies the account as SMB. A failed or still-loading lookup must not
  // let an Events page fall back to the operating-system preference.
  const fallbackTheme: Theme = !accountSlug
    ? 'system'
    : currentAccountContext?.accountType && !isEventsAccount(currentAccountContext.accountType)
      ? 'system'
      : 'light'
  const theme = storedTheme ?? fallbackTheme
  const activeTheme = storedThemeLoaded ? theme : (accountSlug ? 'light' : 'system')

  useLayoutEffect(() => {
    const nextResolvedTheme = resolveTheme(activeTheme)
    setResolvedTheme(nextResolvedTheme)
    document.documentElement.classList.toggle('dark', nextResolvedTheme === 'dark')
  }, [activeTheme])

  useEffect(() => {
    if (activeTheme !== 'system') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const nextResolvedTheme = resolveTheme('system')
      setResolvedTheme(nextResolvedTheme)
      document.documentElement.classList.toggle('dark', nextResolvedTheme === 'dark')
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [activeTheme])

  const setTheme = (nextTheme: Theme) => {
    setStoredTheme(nextTheme)
    setStoredThemeLoaded(true)
    localStorage.setItem('theme', nextTheme)
  }

  const value = useMemo(() => ({ theme, setTheme, resolvedTheme }), [theme, resolvedTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
