import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/theme/ThemeProvider.tsx', 'utf8')

describe('ThemeProvider product defaults', () => {
  it('starts account-scoped pages light until canonical product context resolves', () => {
    expect(source).toContain("const activeTheme = storedThemeLoaded ? theme : (accountSlug ? 'light' : 'system')")
    expect(source).toContain("const fallbackTheme: Theme = !accountSlug\n    ? 'system'")
    expect(source).toContain("currentAccountContext?.accountType && !isEventsAccount(currentAccountContext.accountType)")
    expect(source).toContain("document.documentElement.classList.toggle('dark', nextResolvedTheme === 'dark')")
  })

  it('uses canonical account context for Events while retaining explicit preferences and SMB system behavior', () => {
    expect(source).toContain("import { loadAccountContext } from '@/lib/account-context-client'")
    expect(source).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(source).toContain('loadAccountContext(accountSlug)')
    expect(source).toContain("currentAccountContext?.accountType && !isEventsAccount(currentAccountContext.accountType)")
    expect(source).toContain('const theme = storedTheme ?? fallbackTheme')
    expect(source).toContain("localStorage.setItem('theme', nextTheme)")
  })

  it('does not rely on the Events workspace to mutate the document theme after render', () => {
    const workspace = readFileSync('components/app/events/EventWorkspaceShell.tsx', 'utf8')
    expect(workspace).not.toContain('keepWorkspaceLight')
    expect(workspace).not.toContain('requestAnimationFrame(keepWorkspaceLight)')
  })
})
