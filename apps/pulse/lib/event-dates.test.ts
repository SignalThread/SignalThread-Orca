import { describe, expect, it } from 'vitest'
import { eventDateToDateInputValue, parseEventDateInput } from './event-dates'

describe('parseEventDateInput', () => {
  it('stores a date-only value so the intended calendar date survives Eastern Time display', () => {
    const stored = parseEventDateInput('2026-09-17', 'startDate')
    expect(stored?.toISOString()).toBe('2026-09-17T12:00:00.000Z')
    expect(stored?.toLocaleDateString('en-US', { timeZone: 'America/New_York' })).toBe('9/17/2026')
  })

  it('preserves the calendar date on the opposite side of UTC (Asia/Tokyo)', () => {
    const stored = parseEventDateInput('2026-09-17', 'endDate')
    expect(stored?.toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo' })).toBe('9/17/2026')
    expect(stored?.toLocaleDateString('en-US', { timeZone: 'Pacific/Honolulu' })).toBe('9/17/2026')
  })

  it('clears the date for empty input', () => {
    expect(parseEventDateInput('', 'startDate')).toBeNull()
    expect(parseEventDateInput(null, 'startDate')).toBeNull()
    expect(parseEventDateInput(undefined, 'startDate')).toBeNull()
  })

  it('passes full datetime input through unchanged for legacy callers', () => {
    const stored = parseEventDateInput('2026-09-17T16:00:00.000Z', 'startDate')
    expect(stored?.toISOString()).toBe('2026-09-17T16:00:00.000Z')
  })

  it('reports invalid input with a human field label, not a raw key', () => {
    expect(() => parseEventDateInput('not-a-date', 'startDate')).toThrow('Start date must be a valid date')
    expect(() => parseEventDateInput('9999-99-99', 'endDate')).toThrow('End date must be a valid date')
    expect(() => parseEventDateInput(42, 'endDate')).toThrow('End date must be a valid date')
  })
})

describe('eventDateToDateInputValue', () => {
  it('round-trips canonical noon-UTC dates', () => {
    expect(eventDateToDateInputValue('2026-09-17T12:00:00.000Z')).toBe('2026-09-17')
  })

  it('recovers the intended calendar date from legacy midnight-UTC values', () => {
    expect(eventDateToDateInputValue('2026-09-17T00:00:00.000Z')).toBe('2026-09-17')
  })

  it('returns empty string for missing or invalid values', () => {
    expect(eventDateToDateInputValue(null)).toBe('')
    expect(eventDateToDateInputValue(undefined)).toBe('')
    expect(eventDateToDateInputValue('garbage')).toBe('')
  })
})
