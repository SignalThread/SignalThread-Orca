'use client'

import { Suspense } from 'react'
import { SettingsMenu } from '@/components/admin/SettingsMenu'
import { AccountSwitcher } from '@/components/admin/AccountSwitcher'

interface AdminLayoutProps {
  children: React.ReactNode
  /** Optional home path override (defaults to /admin) */
  homePath?: string
  /** Lets a page own a centered content region within the available app area. */
  fullWidthContent?: boolean
}

export function AdminLayout({ children, homePath = '/admin', fullWidthContent = false }: AdminLayoutProps) {

  return (
    <div className="min-h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950">
      {/* Top Navigation */}
      <nav className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <a href={homePath} className="flex items-center gap-2">
              <img src="/brand/logov2.png" alt="SignalThread" className="h-12 sm:h-12" />
              <span className="hidden sm:inline text-sm text-zinc-500 dark:text-zinc-500">Admin</span>
            </a>

            <div className="flex items-center gap-3 sm:gap-6">
              <Suspense fallback={null}>
                <AccountSwitcher />
              </Suspense>
              <a href={homePath} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors text-xs sm:text-sm">
                Home
              </a>
              <Suspense fallback={null}>
                <SettingsMenu />
              </Suspense>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className={fullWidthContent ? 'flex-1 w-full' : 'flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 lg:py-8'}>
        {children}
      </main>

      {/* Footer - minimal, quiet internal-tool aesthetic */}
      <footer className="mt-auto border-t border-zinc-100 dark:border-zinc-800/80">
        <div className="mx-auto px-4 py-5 sm:py-6 max-w-2xl">
          <p className="text-center text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500">
            © 2026 SignalThread<span className="mx-1 text-zinc-300 dark:text-zinc-600">·</span>All rights reserved
          </p>
        </div>
      </footer>
    </div>
  )
}
