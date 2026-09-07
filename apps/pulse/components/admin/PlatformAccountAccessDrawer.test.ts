import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/admin/PlatformAccountAccessDrawer.tsx'), 'utf8')

describe('Platform account access drawer', () => {
  it('loads identity, memberships, primary control, and a searchable add picker', () => {
    for (const text of ['Manage account access', 'Primary account', 'Account access', 'Search accounts', '+ Add']) {
      expect(source).toContain(text)
    }
    expect(source).toContain("mutate('PATCH'")
    expect(source).toContain("mutate('POST'")
    expect(source).toContain("mutate('DELETE'")
  })

  it('does not remove a primary membership until another primary is selected', () => {
    expect(source).toContain("membership.isPrimary ? 'Primary'")
    expect(source).toContain('To remove the primary account, choose a different primary account first.')
  })

  it('closes on outside click and Escape', () => {
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('aria-label="Close account access drawer"')
    expect(source).toContain('onClick={onClose}')
  })
})
