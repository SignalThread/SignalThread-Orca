import { describe, expect, it } from 'vitest'
import { computeEventDay, formatLiveDayBadge } from './event-day'

describe('computeEventDay', () => {
  it('returns day 1 on the first calendar day of the event', () => {
    const start = '2026-07-01T09:00:00.000Z'
    const now = new Date('2026-07-01T18:30:00.000Z')
    expect(computeEventDay(start, '2026-07-03T23:00:00.000Z', now)).toBe(1)
  })

  it('returns day 2 on the second calendar day of the event', () => {
    const start = '2026-07-01T09:00:00.000Z'
    const now = new Date('2026-07-02T10:00:00.000Z')
    expect(computeEventDay(start, '2026-07-03T23:00:00.000Z', now)).toBe(2)
  })

  it('returns null (no misleading day) when there is no start date', () => {
    expect(computeEventDay(null, null, new Date('2026-07-02T10:00:00.000Z'))).toBeNull()
    expect(computeEventDay(undefined, undefined, new Date('2026-07-02T10:00:00.000Z'))).toBeNull()
  })

  it('returns null for an unparseable start date', () => {
    expect(computeEventDay('not-a-date', null, new Date('2026-07-02T10:00:00.000Z'))).toBeNull()
  })

  it('returns null before the event has started', () => {
    const start = '2026-07-05T09:00:00.000Z'
    const now = new Date('2026-07-02T10:00:00.000Z')
    expect(computeEventDay(start, null, now)).toBeNull()
  })

  it('returns null after a known end date has passed', () => {
    const start = '2026-07-01T09:00:00.000Z'
    const end = '2026-07-03T23:00:00.000Z'
    const now = new Date('2026-07-05T10:00:00.000Z')
    expect(computeEventDay(start, end, now)).toBeNull()
  })

  it('computes day from start when the event has no end date', () => {
    const start = '2026-07-01T09:00:00.000Z'
    const now = new Date('2026-07-04T01:00:00.000Z')
    expect(computeEventDay(start, null, now)).toBe(4)
  })
})

describe('formatLiveDayBadge', () => {
  it('renders a day number when computable', () => {
    expect(
      formatLiveDayBadge('2026-07-01T09:00:00.000Z', null, new Date('2026-07-02T10:00:00.000Z')),
    ).toBe('Live · Day 2')
  })

  it('falls back to plain Live when the day is not computable', () => {
    expect(formatLiveDayBadge(null, null, new Date('2026-07-02T10:00:00.000Z'))).toBe('Live')
  })
})
