import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveStatusPresentation } from './StatusPill'

describe('StatusPill', () => {
  it('uses the shared 32px Event Workspace control geometry and approved pill typography', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'components/ui/StatusPill.tsx'), 'utf8')
    expect(source).toContain("STATUS_PILL_CONTROL_CLASS = 'h-8 rounded-md px-2.5'")
    expect(source).toContain('text-[11px]')
    expect(source).toContain('font-bold')
    expect(source).toContain('uppercase')
    expect(source).toContain('tracking-[0.12em]')
    expect(source).toContain("bg-[#FEF3F2] text-[#B42318]")
    expect(source).toContain("bg-[#FEF6E7] text-[#9A5B00]")
    expect(source).toContain("bg-[#F1F4F9] text-[#5B6880]")
  })

  it('selects just one status using Blocking, Attention, Lifecycle priority', () => {
    expect(resolveStatusPresentation([
      { label: 'Draft', tone: 'lifecycle' },
      { label: 'Time conflict', tone: 'attention' },
      { label: 'Missing details', tone: 'blocking' },
    ])).toEqual({ label: 'Missing details', tone: 'blocking' })
  })

  it('does not promote routine healthy state into a colored pill', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'components/ui/StatusPill.tsx'), 'utf8')
    expect(source).toContain("if (tone === 'healthy')")
    expect(source).toContain('text-[#5B6880]')
  })
})
