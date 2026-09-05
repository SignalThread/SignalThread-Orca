import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/admin/AdminLayout.tsx'), 'utf8')

describe('AdminLayout content width', () => {
  it('allows pages to center within the full available main-content area', () => {
    expect(source).toContain('fullWidthContent?: boolean')
    expect(source).toContain("fullWidthContent ? 'flex-1 w-full'")
  })

  it('preserves the existing constrained layout as the default for other admin pages', () => {
    expect(source).toContain("'flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 lg:py-8'")
  })

  it('mounts the compact membership-scoped account switcher in the existing shell', () => {
    expect(source).toContain("import { AccountSwitcher } from '@/components/admin/AccountSwitcher'")
    expect(source).toContain('<AccountSwitcher />')
  })
})
