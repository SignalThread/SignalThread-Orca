import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatEventDateValue } from './EventDatePicker'

const source = readFileSync('components/app/events/EventDatePicker.tsx', 'utf8')

describe('EventDatePicker', () => {
  it('is a product-styled control with no native browser date/time inputs', () => {
    expect(source).not.toContain('type="date"')
    expect(source).not.toContain('datetime-local')
    expect(source).not.toContain('type="time"')
    expect(source).toContain("aria-haspopup=\"dialog\"")
    expect(source).toContain('aria-expanded={open}')
  })

  it('works on plain calendar-date strings so the selected date cannot drift by timezone', () => {
    expect(source).toContain("value: string")
    expect(source).toContain('onChange: (value: string) => void')
    expect(source).toContain('function toValue(date: CalendarDate): string')
    expect(source).not.toContain('toISOString')
  })

  it('supports outside-click and Escape dismissal with focus returned to the trigger', () => {
    expect(source).toContain("document.addEventListener('pointerdown', handlePointerDown)")
    expect(source).toContain("if (event.key === 'Escape')")
    expect(source).toContain('triggerRef.current?.focus()')
  })

  it('supports arrow-key navigation and Enter/Space selection in the day grid', () => {
    expect(source).toContain('ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7')
    expect(source).toContain("event.key === 'Enter' || event.key === ' '")
    expect(source).toContain('role="grid"')
    expect(source).toContain('role="gridcell"')
  })

  it('respects the min bound and offers clear/today affordances', () => {
    expect(source).toContain('const isDisabledDay = (date: CalendarDate) => Boolean(minDate && compareDates(date, minDate) < 0)')
    expect(source).toContain('Clear date')
    expect(source).toContain('Today')
  })

  it('stays within the viewport at narrow responsive widths', () => {
    expect(source).toContain('max-w-[calc(100vw-2rem)]')
  })
})

describe('formatEventDateValue', () => {
  it('formats calendar-date strings without Date-object timezone conversion', () => {
    expect(formatEventDateValue('2026-09-17')).toBe('Sep 17, 2026')
    expect(formatEventDateValue('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatEventDateValue('')).toBe('')
    expect(formatEventDateValue('garbage')).toBe('')
  })
})
