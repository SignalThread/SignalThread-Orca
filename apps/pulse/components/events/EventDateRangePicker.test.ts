import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/events/EventDateRangePicker.tsx'), 'utf8')

describe('EventDateRangePicker', () => {
  it('uses an app-styled calendar popover rather than native date inputs', () => {
    expect(source).toContain('data-testid="event-date-range-picker"')
    expect(source).toContain('role="dialog"')
    expect(source).not.toContain('type="date"')
  })

  it('supports month navigation, selecting a range, Today, and Clear', () => {
    expect(source).toContain('Previous month')
    expect(source).toContain('Next month')
    expect(source).toContain("onChange({ from: value, to: '' })")
    expect(source).toContain("onChange({ from, to: value })")
    expect(source).toContain('Today')
    expect(source).toContain("onChange({ from: '', to: '' })")
  })
})
