import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/layout.tsx', 'utf8')

describe('RootLayout', () => {
  it('contains the shared search-param-aware theme provider in a Suspense boundary', () => {
    expect(source).toContain('import { Suspense } from "react"')
    expect(source).toContain('<Suspense fallback={null}>')
    expect(source).toContain('<ThemeProvider>{children}</ThemeProvider>')
    expect(source).not.toContain('export const dynamic')
  })
})
