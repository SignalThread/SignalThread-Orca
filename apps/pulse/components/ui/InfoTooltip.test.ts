import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/ui/InfoTooltip.tsx'), 'utf8')

describe('InfoTooltip custom trigger support', () => {
  it('keeps the shared tooltip accessible for information and icon-action triggers', () => {
    expect(source).toContain('trigger?: React.ReactNode')
    expect(source).toContain('href?: string')
    expect(source).toContain('onAction?: () => void')
    expect(source).toContain('onFocus={() => setOpen(true)}')
    expect(source).toContain('onBlur={() => setOpen(false)}')
    expect(source).toContain("const triggerContents = trigger ?? 'i'")
    expect(source).toContain('disabled={disabled}')
    expect(source).toContain("${className ? ' h-full w-full' : ''}")
  })
})
