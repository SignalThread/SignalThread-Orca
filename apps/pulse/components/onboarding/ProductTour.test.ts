import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/onboarding/ProductTour.tsx', 'utf8')

describe('ProductTour account-product gate', () => {
  it('does not render or auto-launch for EVENTS accounts, even with stored tour state', () => {
    expect(source).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(source).toContain('if (isEventsAccount(accountType)) {')
    expect(source).toContain('setVisible(false)')
    expect(source).toContain('if (!accountSlug || accountTypeLoading || accountType === null || isEventsAccount(accountType) || !visible) return null')
    expect(source).toContain('setVisible(shouldAutoStartTour())')
  })

  it('requires positive non-Events confirmation before any launch path', () => {
    // A missing account param or failed context load can belong to an Events
    // user; neither may fall back to auto-starting the SMB tour.
    expect(source).toContain('if (!accountSlug || accountType === null) {')
    expect(source).toContain('if (!accountSlug || accountType === null || isEventsAccount(accountType)) {')
    expect(source).toContain('const currentAccountContext = accountContext?.slug === accountSlug ? accountContext : null')
    expect(source).toContain("const accountTypeLoading = Boolean(accountSlug) && currentAccountContext?.settled !== true")
  })

  it('removes an Events startTour route without launching the tour', () => {
    expect(source).toContain("if (!accountSlug || accountType === null || isEventsAccount(accountType)) {")
    expect(source).toContain("next.delete('startTour')")
    expect(source).toContain('router.replace(`${pathname}${query ? `?${query}` : \'\'}`)')
  })

  it('retains the SMB tour steps and normal manual-route launch path', () => {
    expect(source).toContain('const BASE_TOUR_STEPS: TourStep[]')
    expect(source).toContain('if (startTourParam !== \'1\' || accountTypeLoading) return')
    expect(source).toContain('setVisible(true)')
  })
})
