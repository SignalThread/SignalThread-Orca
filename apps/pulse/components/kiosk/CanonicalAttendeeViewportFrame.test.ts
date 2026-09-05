import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/kiosk/CanonicalAttendeeViewportFrame.tsx', 'utf8')

describe('CanonicalAttendeeViewportFrame', () => {
  it('mounts the canonical attendee renderer into a real mobile iframe viewport', () => {
    expect(source).toContain("export const CANONICAL_ATTENDEE_VIEWPORT = { width: 430, height: 844 } as const")
    expect(source).toContain('<iframe')
    expect(source).toContain('createPortal(children, mountNode)')
    expect(source).toContain("querySelectorAll('link[rel=\"stylesheet\"], style')")
  })

  it('uses only a uniform outer scale and keeps the attendee document at native dimensions', () => {
    expect(source).toContain("const scale = variant === 'inline' ? 0.76 : 1")
    expect(source).toContain('width: `${CANONICAL_ATTENDEE_VIEWPORT.width}px`')
    expect(source).toContain('height: `${CANONICAL_ATTENDEE_VIEWPORT.height}px`')
    expect(source).toContain('transform: `scale(${scale})`')
    expect(source).not.toContain('overflow-y-auto')
  })
})
