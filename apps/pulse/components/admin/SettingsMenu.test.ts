import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/admin/SettingsMenu.tsx', 'utf8')

describe('SettingsMenu product tour availability', () => {
  it('uses canonical account context to hide Product Tour for Events accounts', () => {
    expect(source).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(source).toContain("import { loadAccountContext } from '@/lib/account-context-client'")
    expect(source).toContain('loadAccountContext(accountSlug)')
    expect(source).toContain('setAccountContext({ slug: accountSlug, accountType: account.accountType, settled: true })')
    // Positive confirmation only: no account param or failed context load
    // hides the SMB tour entry rather than defaulting it on.
    expect(source).toContain('const currentAccountContext = accountContext?.slug === accountSlug ? accountContext : null')
    expect(source).toContain('currentAccountContext?.settled === true')
    expect(source).toContain('!isEventsAccount(currentAccountContext.accountType)')
    expect(source).toContain('{canStartProductTour && <button')
  })

  it('keeps the existing SMB tour and Help actions while withholding them from Events', () => {
    expect(source).toContain('Product Tour')
    expect(source).toContain('onClick={handleStartProductTour}')
    expect(source).toContain('if (!canStartProductTour) return')
    expect(source).toContain("params.set('startTour', '1')")
    expect(source).toContain('Profile')
    expect(source).toContain('Help')
    expect(source).toContain('const canAccessSmbHelp')
    expect(source).toContain('!isEventsAccount(currentAccountContext.accountType)')
    expect(source).toContain('{canAccessSmbHelp && (')
    expect(source).toContain('href={`/help?account=${accountSlug}`}')
    expect(source).toContain('Log out')
    expect(source).toContain('ThemeSwitcher')
  })
})
