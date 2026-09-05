import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/EventEntityCard.tsx', 'utf8')

describe('EventEntityCard', () => {
  it('provides one white outer surface and separate bordered item cards', () => {
    expect(source).toContain('EventEntityListShell')
    expect(source).toContain('EventEntityCard')
    expect(source).toContain('bg-white')
    expect(source).toContain('rounded-xl border p-4')
    expect(source).toContain('border-indigo-400 bg-indigo-50/60')
  })
})
