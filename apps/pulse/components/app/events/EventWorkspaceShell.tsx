'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { EventStatusPill } from './EventStatusPill'

export type EventWorkspaceSection = 'setup' | 'signals'

export interface EventWorkspaceLink {
  key: 'events' | 'setup' | 'signals' | 'settings'
  label: string
  href: string
}

export function buildEventWorkspaceLinks(
  accountSlug: string,
  eventId: string,
): EventWorkspaceLink[] {
  const account = encodeURIComponent(accountSlug)
  const event = encodeURIComponent(eventId)
  return [
    { key: 'events', label: 'Events', href: `/app?account=${account}` },
    { key: 'setup', label: 'Setup', href: `/app/events/${event}?account=${account}` },
    { key: 'signals', label: 'Signals', href: `/app/events/${event}/dashboard?account=${account}` },
    { key: 'settings', label: 'Settings', href: `/app/settings/profile?account=${account}&tab=event-settings&event=${event}` },
  ]
}

function WorkspaceIcon({ name }: { name: EventWorkspaceLink['key'] }) {
  const paths = {
    events: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    setup: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="10" cy="18" r="1.5" /></>,
    signals: <><path d="M4 18V9M10 18V5M16 18v-7M22 18V3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 14.7a1.7 1.7 0 0 0-1.56-1.03H5v-3h.44A1.7 1.7 0 0 0 7 9.64a1.7 1.7 0 0 0-.34-1.88L6.6 7.7l2.12-2.12.06.06A1.7 1.7 0 0 0 10.66 6a1.7 1.7 0 0 0 1.03-1.56V4h3v.44A1.7 1.7 0 0 0 15.72 6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03H21v3h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>,
  }
  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

function WorkspaceNavigation({
  links,
  activeSection,
  onNavigate,
}: {
  links: EventWorkspaceLink[]
  activeSection: EventWorkspaceSection
  onNavigate?: () => void
}) {
  const itemClassName = (selected: boolean) => `group relative flex w-14 flex-col items-center justify-center gap-1.5 rounded-[14px] px-0 py-2.5 text-[10px] font-semibold tracking-[0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
    selected
      ? 'bg-[#28439A] text-white'
      : 'text-white/55 hover:bg-white/[0.08] hover:text-white'
  }`

  const itemLabel = (link: EventWorkspaceLink, selected: boolean) => (
    <>
      <WorkspaceIcon name={link.key} />
      <span>{link.label}</span>
      {selected && <span className="sr-only">Current section</span>}
    </>
  )

  return (
    <nav aria-label="Event workspace" className="flex min-h-0 flex-1 flex-col items-center">
      <div className="space-y-1.5">
        {links.slice(0, 3).map((link) => {
          const selected = link.key === activeSection
          return (
            <Link
              key={link.key}
              href={link.href}
              prefetch={false}
              aria-current={selected ? 'page' : undefined}
              data-selected={selected ? 'true' : 'false'}
              onClick={onNavigate}
              className={itemClassName(selected)}
            >
              {itemLabel(link, selected)}
            </Link>
          )
        })}
      </div>
      <div className="mt-auto border-t border-white/10 pt-3">
        {links.slice(3).map((link) => (
          <Link
            key={link.key}
            href={link.href}
            prefetch={false}
            onClick={onNavigate}
            className={itemClassName(false)}
          >
            {itemLabel(link, false)}
          </Link>
        ))}
      </div>
    </nav>
  )
}

interface EventWorkspaceShellProps {
  accountSlug: string
  eventId: string
  activeSection: EventWorkspaceSection
  eventName?: string | null
  eventStatus?: string | null
  headerActions?: ReactNode
  children: ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

export function EventWorkspaceShell({
  accountSlug,
  eventId,
  activeSection,
  eventName,
  eventStatus,
  headerActions,
  children,
  loading = false,
  error = null,
  onRetry,
}: EventWorkspaceShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const links = buildEventWorkspaceLinks(accountSlug, eventId)

  const closeMobileNavigation = (returnFocus = true) => {
    setMobileOpen(false)
    if (returnFocus) requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  useEffect(() => {
    if (!mobileOpen) return
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileNavigation()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  return (
    <div data-event-workspace-theme="light" className="event-workspace-type min-h-screen bg-[#f4f6fa] text-slate-600">
      <aside id="event-workspace-desktop-navigation" className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center bg-[#0B1638] py-4 text-white lg:flex">
        <Link prefetch={false} href={links[0].href} aria-label="SignalThread Events home" className="mb-5 flex h-[42px] w-[42px] items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="10" width="2.4" height="4" rx="1.2" fill="#5b7ae0" /><rect x="6" y="7" width="2.4" height="10" rx="1.2" fill="#5b7ae0" /><rect x="10" y="3" width="2.4" height="18" rx="1.2" fill="#fff" /><rect x="14" y="7" width="2.4" height="10" rx="1.2" fill="#5b7ae0" /><rect x="18" y="10" width="2.4" height="4" rx="1.2" fill="#5b7ae0" /></svg>
        </Link>
        <WorkspaceNavigation links={links} activeSection={activeSection} />
      </aside>

      <div className="min-w-0 lg:pl-[72px]">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">Voice for Events</p>
              <p className="text-xs font-medium text-slate-500">{activeSection === 'setup' ? 'Setup' : 'Signals'}</p>
            </div>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Open event navigation"
              aria-expanded={mobileOpen}
              aria-controls="event-workspace-mobile-navigation"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" aria-label="Close event navigation" className="absolute inset-0 bg-slate-950/55" onClick={() => closeMobileNavigation()} />
            <div id="event-workspace-mobile-navigation" role="dialog" aria-modal="true" aria-label="Event navigation" className="relative flex h-full w-[min(19rem,86vw)] flex-col bg-[#0b1220] p-4 text-white shadow-2xl">
              <div className="mb-5 flex items-center justify-between gap-3">
                <img src="/brand/logov2.png" alt="SignalThread" className="h-9 w-auto brightness-0 invert" />
                <button ref={closeButtonRef} type="button" aria-label="Close event navigation" onClick={() => closeMobileNavigation()} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                  <span aria-hidden="true" className="text-2xl leading-none">×</span>
                </button>
              </div>
              <WorkspaceNavigation links={links} activeSection={activeSection} onNavigate={() => closeMobileNavigation(false)} />
            </div>
          </div>
        )}

        <header className="border-b border-[#e8ebf2] bg-white px-4 sm:px-5 lg:px-6 xl:px-8">
          <div className="mx-auto max-w-[1240px] py-5">
            <div className="grid gap-4 lg:min-h-[59px] lg:grid-cols-[minmax(320px,1fr)_auto_minmax(280px,420px)] lg:items-start lg:gap-3">
              <div className="min-w-0">
              <div className="flex min-h-8 flex-wrap items-center gap-2.5">
                {eventStatus && <EventStatusPill status={eventStatus} size="sm" />}
              </div>
              {loading ? (
                <div className="h-7 w-56 animate-pulse rounded bg-slate-200" aria-label="Loading event identity" />
              ) : error || !eventName ? (
                <h1 className="event-type-page-title text-[#0B1220]">Event workspace unavailable</h1>
              ) : (
                <h1 className="event-type-page-title truncate text-[#0B1220]">{eventName}</h1>
              )}
              </div>
              {!loading && !error && (
                <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-self-start">
                  {headerActions}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 px-4 py-[22px] sm:px-5 lg:px-6 xl:px-8 lg:pb-11">
          <div className="mx-auto max-w-[1240px]">
            {error ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-800">
                <p className="font-bold">Unable to load this event workspace</p>
                <p className="mt-1">{error}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {onRetry && <button type="button" onClick={onRetry} className="font-semibold text-red-900 underline underline-offset-2">Retry</button>}
                  <Link prefetch={false} href={links[0].href} className="font-semibold text-red-900 underline underline-offset-2">Back to Events</Link>
                </div>
              </div>
            ) : loading ? (
              <div className="flex min-h-[45vh] items-center justify-center" aria-live="polite">
                <div className="text-center text-sm font-medium text-slate-500">Loading event workspace…</div>
              </div>
            ) : children}
          </div>
        </main>
      </div>
    </div>
  )
}
