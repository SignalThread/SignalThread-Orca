import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { buildEventWorkspaceLinks } from './EventWorkspaceShell'

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/app/events/EventWorkspaceShell.tsx'),
  'utf8',
)

describe('EventWorkspaceShell', () => {
  it('builds every destination with the current account and event context', () => {
    expect(buildEventWorkspaceLinks('events co', 'event/123')).toEqual([
      { key: 'events', label: 'Events', href: '/app?account=events%20co' },
      { key: 'setup', label: 'Setup', href: '/app/events/event%2F123?account=events%20co' },
      { key: 'signals', label: 'Signals', href: '/app/events/event%2F123/dashboard?account=events%20co' },
      { key: 'settings', label: 'Settings', href: '/app/settings/profile?account=events%20co&tab=event-settings&event=event%2F123' },
    ])
  })

  it('never writes a lifecycle view into Signals navigation', () => {
    const links = buildEventWorkspaceLinks('events co', 'event/123')
    expect(links.find((link) => link.key === 'setup')?.href).toBe('/app/events/event%2F123?account=events%20co')
    expect(links.find((link) => link.key === 'signals')?.href).toBe('/app/events/event%2F123/dashboard?account=events%20co')
    expect(links.find((link) => link.key === 'events')?.href).toBe('/app?account=events%20co')
  })

  it('does not render lifecycle controls in the shared workspace shell', () => {
    expect(source).not.toContain('lifecycle?: {')
    expect(source).not.toContain('Lifecycle preview')
    expect(source).toContain('!loading && !error && (')
    expect(source).toContain("{ key: 'setup', label: 'Setup', href: `/app/events/${event}?account=${account}` }")
  })

  it('uses client navigation so the persistent Event shell survives workspace changes', () => {
    expect(source).toContain("import Link from 'next/link'")
    expect(source).toContain('<Link')
    expect(source).toContain('prefetch={false}')
    expect(source).not.toContain('<a\n')
  })

  it('marks Setup and Signals with a non-color selected state', () => {
    expect(source).toContain("const selected = link.key === activeSection")
    expect(source).toContain("aria-current={selected ? 'page' : undefined}")
    expect(source).toContain("data-selected={selected ? 'true' : 'false'}")
    expect(source).toContain('Current section')
  })

  it('keeps Settings at the bottom of the permanent desktop navigation', () => {
    expect(source).toContain('links.slice(0, 3)')
    expect(source).toContain('mt-auto border-t border-white/10')
    expect(source).toContain('links.slice(3)')
  })

  it('uses the approved compact rail and centered desktop frame', () => {
    expect(source).toContain('w-[72px]')
    expect(source).toContain('lg:pl-[72px]')
    expect(source).toContain('max-w-[1240px]')
    expect(source).toContain('bg-[#f4f6fa]')
    expect(source).not.toContain('max-w-[1500px]')
    expect(source).not.toContain("'w-56 px-3'")
  })

  it('uses the reference rail treatment without duplicating the Signals left-nav destination in the header', () => {
    expect(source).toContain('flex w-14 flex-col items-center justify-center')
    expect(source).toContain("? 'bg-[#28439A] text-white'")
    expect(source).not.toContain('aria-label="Workspace section"')
    expect(source).not.toContain("activeSection === 'setup' ? 'Signals' : 'Setup'")
    expect(source).not.toContain("link.key === (activeSection === 'setup' ? 'signals' : 'setup')")
    expect(source).toContain("{ key: 'signals', label: 'Signals'")
  })

  it('provides an accessible mobile drawer with focus return and Escape close', () => {
    expect(source).toContain('aria-expanded={mobileOpen}')
    expect(source).toContain('aria-controls="event-workspace-mobile-navigation"')
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('menuButtonRef.current?.focus()')
    expect(source).toContain('closeButtonRef.current?.focus()')
  })

  it('does not render stale event identity in loading or error states', () => {
    expect(source).toContain('loading ? (')
    expect(source).toContain('Loading event identity')
    expect(source).toContain('error || !eventName ? (')
    expect(source).toContain('Event workspace unavailable')
    expect(source).toContain('!loading && !error && (')
    expect(source).toContain('{onRetry && <button')
    expect(source).toContain('>Retry</button>')
  })

  it('keeps header actions in the shared workspace placement without a lifecycle selector', () => {
    expect(source).not.toContain('rounded-xl bg-[#eef0f5] p-1')
    expect(source).toContain('lg:grid-cols-[minmax(320px,1fr)_auto_minmax(280px,420px)]')
    expect(source).toContain('lg:min-h-[59px]')
    expect(source).toContain('min-h-8 flex-wrap')
    expect(source).toContain('lg:justify-self-start')
    expect(source).not.toContain('lg:absolute lg:right-0 lg:top-0')
    expect(source).not.toContain('Lifecycle preview')
  })

  it('leaves global theme resolution to the canonical provider', () => {
    expect(source).toContain('data-event-workspace-theme="light"')
    expect(source).not.toContain('keepWorkspaceLight')
    expect(source).not.toContain('new MutationObserver')
    expect(source).not.toContain('restoreDarkTheme')
    expect(source).not.toContain("localStorage.setItem('theme'")
  })
})
