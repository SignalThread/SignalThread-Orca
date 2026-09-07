import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveEventStatus, type EventStatusTone } from './EventStatusPill'

const dir = path.join(process.cwd(), 'components/app/events')

function read(file: string): string {
  return fs.readFileSync(path.join(dir, file), 'utf8')
}

describe('event-only UI primitives', () => {
  it('exports every primitive from the barrel for the three Events tiers', () => {
    const index = read('index.ts')
    for (const name of [
      'EventCard',
      'EventStatusPill',
      'EventMetricStrip',
      'EventPrimaryActions',
      'EventHeroHeader',
      'EventPageShell',
      'EventTabs',
      'EventObjectRow',
      'EventReadinessList',
      'EventEmptyState',
      'EventFilterBar',
    ]) {
      expect(index).toContain(name)
    }
  })

  it('uses the product-wide status primitive for shared semantic treatment', () => {
    // Status semantics are product-wide; EventStatusPill is a domain adapter.
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.tsx')) continue
      const source = read(file)
      if (file === 'EventStatusPill.tsx') expect(source).toContain("from '@/components/ui/StatusPill'")
    }
  })

  it('resolves event-domain status words to tones', () => {
    const cases: Array<[string, EventStatusTone]> = [
      ['Live now', 'live'],
      ['Upcoming', 'muted'],
      ['Wrapped', 'muted'],
      ['Active', 'positive'],
      ['Ready', 'positive'],
      ['Needs survey', 'attention'],
      ['Launchable', 'positive'],
      ['Immediate', 'critical'],
      ['Soon', 'attention'],
      ['Watch', 'attention'],
      ['Positive', 'positive'],
      ['Negative', 'critical'],
    ]
    for (const [token, tone] of cases) {
      expect(resolveEventStatus(token).tone).toBe(tone)
    }
  })

  it('falls back to a muted pill for unknown status tokens (no crash)', () => {
    const resolved = resolveEventStatus('Some custom phase')
    expect(resolved.tone).toBe('muted')
    expect(resolved.label).toBe('Some custom phase')
  })

  it('uses lifecycle-consistent labels for workspace views', () => {
    expect(resolveEventStatus('Upcoming')).toMatchObject({ label: 'Upcoming', tone: 'muted' })
    expect(resolveEventStatus('Live now')).toMatchObject({ label: 'Live now', tone: 'live' })
    expect(resolveEventStatus('Completed')).toMatchObject({ label: 'Wrapped', tone: 'muted' })
  })

  it('renders green/live states through the quiet healthy treatment', () => {
    const source = read('EventStatusPill.tsx')
    expect(source).toContain("live: 'healthy'")
    expect(source).toContain("positive: 'healthy'")
  })

  it('keeps object rows clickable and isolates inline action clicks', () => {
    const source = read('EventObjectRow.tsx')
    // Whole row navigates via href or onClick…
    expect(source).toContain('href')
    expect(source).toContain('onClick')
    // …but inline actions stop propagation so they stay independently usable.
    expect(source).toContain('stopPropagation')
    // Keyboard accessible when rendered as a button.
    expect(source).toContain("event.key === 'Enter'")
  })

  it('separates destructive actions in the primary action cluster', () => {
    const source = read('EventPrimaryActions.tsx')
    expect(source).toContain('destructiveActions')
    // Destructive items are forced to the danger variant.
    expect(source).toContain("variant: 'danger'")
  })

  it('renders truthful missing metrics rather than fake zeros', () => {
    const source = read('EventMetricStrip.tsx')
    expect(source).toContain('—')
    expect(source).toContain('null || value === undefined')
  })

  it('uses static Tailwind column classes (scanner-safe, no dynamic class names)', () => {
    const source = read('EventMetricStrip.tsx')
    expect(source).toContain('lg:grid-cols-4')
    expect(source).not.toContain('lg:grid-cols-${')
  })

  it('uses the approved events workspace surface and tab primitives without touching shared UI primitives', () => {
    expect(read('EventCard.tsx')).toContain("sm: 'p-4'")
    expect(read('EventCard.tsx')).toContain('rounded-[18px] border border-[#e8ebf2]')
    expect(read('EventTabs.tsx')).toContain('border-b border-[#e8ebf2]')
    expect(read('EventTabs.tsx')).toContain('gap-6')
    expect(read('EventTabs.tsx')).toContain('after:bg-[#0B1220]')
    expect(read('EventMetricStrip.tsx')).toContain('px-3 py-2.5')
    expect(read('EventEmptyState.tsx')).toContain("size === 'sm' ? 'px-3 py-5'")
  })

  it('uses the shared Events typography roles for shell identity and tabs', () => {
    expect(read('EventWorkspaceShell.tsx')).toContain('event-workspace-type')
    expect(read('EventWorkspaceShell.tsx')).toContain('event-type-page-title')
    expect(read('EventTabs.tsx')).toContain('event-type-control')
    expect(read('EventTabs.tsx')).toContain('event-type-pill')
  })

  it('keeps linked tabs as navigation instead of changing local tab state', () => {
    const source = read('EventTabs.tsx')
    const linkBlock = source.match(/if \(tab\.href\)[\s\S]*?\n          }\n\n          return/)?.[0] ?? ''
    expect(linkBlock).toContain('href={tab.href}')
    expect(linkBlock).not.toContain('onClick')
  })

  it('shows derived readiness status and keeps completed rows navigable', () => {
    const source = read('EventReadinessList.tsx')
    expect(source).toContain('statusLabel?: string')
    expect(source).toContain("statusTone?: 'ready' | 'attention' | 'progress' | 'neutral'")
    expect(source).toContain("item.actionLabel && (item.actionHref || item.onAction)")
    expect(source).not.toContain('!item.complete && item.actionLabel')
  })
})
