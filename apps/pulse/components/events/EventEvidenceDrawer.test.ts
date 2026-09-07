import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/EventEvidenceDrawer.tsx', 'utf8')

describe('EventEvidenceDrawer', () => {
  it('owns the shared accessible modal interaction contract', () => {
    expect(source).toContain('testId="event-evidence-drawer"')
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain("document.body.style.overflow = 'hidden'")
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain('aria-label={`Close ${ariaLabel ?? title}`}')
    expect(source).toContain('export function EventWorkspaceDrawer')
  })

  it('offers a compact desktop width while remaining full width on small screens', () => {
    expect(source).toContain("width?: 'default' | 'compact'")
    expect(source).toContain("width === 'compact' ? 'max-w-[500px]'")
    expect(source).toContain('h-full w-full flex-col')
  })
})
