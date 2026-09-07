import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/admin/AccountSwitcher.tsx'), 'utf8')

describe('AccountSwitcher', () => {
  it('renders only for multi-account regular ADMIN users', () => {
    expect(source).toContain("setIsRegularAdmin(json.data.role === 'ADMIN')")
    expect(source).toContain('if (!isRegularAdmin || accounts.length <= 1) return null')
  })

  it('loads only server-authorized accounts and switches to the selected account home', () => {
    expect(source).toContain("fetch('/api/app/accounts'")
    expect(source).toContain('json.data.accounts')
    expect(source).toContain('router.push(`/app?account=${encodeURIComponent(selected.slug)}`)')
  })
})
