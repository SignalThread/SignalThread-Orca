import { describe, expect, it } from 'vitest'
import { getEventDisplayStatus, getEventLifecyclePhase, getEventsHomeTimeBucket, groupEventsForHome, resolveEventLifecyclePhase } from './events-home-groups'

describe('getEventLifecyclePhase', () => {
  const now = new Date('2026-07-08T12:00:00.000Z')

  it('uses event start/end timestamps without treating a future active event as live', () => {
    expect(getEventLifecyclePhase({ status: 'ACTIVE', isActive: true, startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-02T00:00:00.000Z' }, now)).toBe('PRE_EVENT')
    expect(getEventLifecyclePhase({ status: 'ACTIVE', isActive: true, startDate: '2026-07-08T00:00:00.000Z', endDate: '2026-07-09T00:00:00.000Z' }, now)).toBe('IN_EVENT')
    expect(getEventLifecyclePhase({ status: 'ACTIVE', isActive: true, startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-02T00:00:00.000Z' }, now)).toBe('POST_EVENT')
  })

  it('does not derive lifecycle from stale storage status or survey-style activity flags', () => {
    expect(getEventLifecyclePhase({ status: 'COMPLETED', isActive: false, startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-02T00:00:00.000Z' }, now)).toBe('PRE_EVENT')
    expect(getEventLifecyclePhase({ status: 'DRAFT', isActive: false, startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-02T00:00:00.000Z' }, now)).toBe('POST_EVENT')
  })

  it('uses the event timezone for canonical date-only boundaries', () => {
    const event = {
      status: 'DRAFT', isActive: false, timezone: 'America/Los_Angeles',
      startDate: '2026-07-08T12:00:00.000Z', endDate: '2026-07-08T12:00:00.000Z',
    }
    expect(getEventLifecyclePhase(event, new Date('2026-07-08T06:59:59.000Z'))).toBe('PRE_EVENT')
    expect(getEventLifecyclePhase(event, new Date('2026-07-08T07:00:00.000Z'))).toBe('IN_EVENT')
    expect(getEventLifecyclePhase(event, new Date('2026-07-09T06:59:59.999Z'))).toBe('IN_EVENT')
    expect(getEventLifecyclePhase(event, new Date('2026-07-09T07:00:00.000Z'))).toBe('POST_EVENT')
  })

  it('keeps undated events pre-event until their actual dates are configured', () => {
    expect(getEventLifecyclePhase({ status: 'ACTIVE', isActive: true, startDate: null, endDate: null }, now)).toBe('PRE_EVENT')
  })

  it('keeps workspace intelligence neutral for missing or incomplete dates', () => {
    expect(resolveEventLifecyclePhase({ status: 'ACTIVE', isActive: true, startDate: null, endDate: null }, now)).toBeNull()
    expect(resolveEventLifecyclePhase({ status: 'ACTIVE', isActive: true, startDate: new Date('2026-07-01'), endDate: null }, now)).toBeNull()
  })

})

describe('getEventsHomeTimeBucket', () => {
  const now = new Date('2026-07-08T12:00:00.000Z')

  it('derives buckets from the canonical lifecycle phase, so a future ACTIVE event is upcoming, not live', () => {
    expect(getEventsHomeTimeBucket({ status: 'ACTIVE', isActive: true, startDate: '2026-09-01T12:00:00.000Z', endDate: '2026-09-02T12:00:00.000Z' }, now)).toBe('upcoming')
    expect(getEventsHomeTimeBucket({ status: 'DRAFT', isActive: true, startDate: '2026-09-01T12:00:00.000Z', endDate: '2026-09-02T12:00:00.000Z' }, now)).toBe('upcoming')
    expect(getEventsHomeTimeBucket({ status: 'ACTIVE', isActive: true, startDate: '2026-07-08T00:00:00.000Z', endDate: '2026-07-09T00:00:00.000Z' }, now)).toBe('live')
    expect(getEventsHomeTimeBucket({ status: 'ACTIVE', isActive: true, startDate: '2026-06-01T12:00:00.000Z', endDate: '2026-06-02T12:00:00.000Z' }, now)).toBe('past')
    expect(getEventsHomeTimeBucket({ status: 'COMPLETED', isActive: true, startDate: null, endDate: null }, now)).toBe('upcoming')
  })
})

describe('getEventDisplayStatus', () => {
  const now = new Date('2026-07-08T12:00:00.000Z')

  it('gives comparable future events one consistent status regardless of DRAFT/ACTIVE storage state', () => {
    const dates = { startDate: '2026-09-17T12:00:00.000Z', endDate: '2026-09-18T12:00:00.000Z' }
    expect(getEventDisplayStatus({ status: 'ACTIVE', isActive: true, ...dates }, now)).toBe('upcoming')
    expect(getEventDisplayStatus({ status: 'DRAFT', isActive: true, ...dates }, now)).toBe('upcoming')
  })

  it('resolves draft, future, live, and completed events through the one lifecycle rule', () => {
    expect(getEventDisplayStatus({ status: 'DRAFT', isActive: true, startDate: null, endDate: null }, now)).toBe('upcoming')
    expect(getEventDisplayStatus({ status: 'ACTIVE', isActive: true, startDate: '2026-07-08T00:00:00.000Z', endDate: '2026-07-09T00:00:00.000Z' }, now)).toBe('live')
    expect(getEventDisplayStatus({ status: 'ACTIVE', isActive: true, startDate: '2026-06-01T12:00:00.000Z', endDate: '2026-06-02T12:00:00.000Z' }, now)).toBe('completed')
    expect(getEventDisplayStatus({ status: 'COMPLETED', isActive: false, startDate: null, endDate: null }, now)).toBe('upcoming')
  })
})

describe('groupEventsForHome', () => {
  it('uses one real-event collection for live, upcoming, and past groups', () => {
    const groups = groupEventsForHome(
      [
        { id: 'live-1', status: 'ACTIVE', isActive: true, startDate: '2026-07-08T00:00:00.000Z', endDate: '2026-07-09T00:00:00.000Z' },
        { id: 'live-2', status: 'ACTIVE', isActive: true, startDate: '2026-07-08T00:00:00.000Z', endDate: '2026-07-09T00:00:00.000Z' },
        { id: 'upcoming-1', status: 'DRAFT', isActive: true, startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-02T00:00:00.000Z' },
        { id: 'past-1', status: 'COMPLETED', isActive: false, startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-02T00:00:00.000Z' },
      ],
      new Date('2026-07-08T12:00:00.000Z'),
    )

    expect(groups.live.map((event) => event.id)).toEqual(['live-1', 'live-2'])
    expect(groups.upcoming.map((event) => event.id)).toEqual(['upcoming-1'])
    expect(groups.past.map((event) => event.id)).toEqual(['past-1'])
  })

  it('does not include create-event actions because only real events are grouped', () => {
    const groups = groupEventsForHome(
      [
        { id: 'live-1', status: 'ACTIVE', isActive: true, startDate: '2026-07-08T00:00:00.000Z', endDate: '2026-07-09T00:00:00.000Z' },
      ],
      new Date('2026-07-08T12:00:00.000Z'),
    )

    expect(groups.live).toHaveLength(1)
    expect(groups.upcoming).toHaveLength(0)
    expect(groups.past).toHaveLength(0)
  })

  it('preserves distinct event records with matching names and dates', () => {
    const groups = groupEventsForHome(
      [
        { id: 'canonical-demo', name: 'SignalThread Live Experience Summit', status: 'ACTIVE', isActive: true, startDate: '2026-09-17T12:00:00.000Z', endDate: '2026-09-18T12:00:00.000Z' },
        { id: 'legacy-fixture', name: 'SignalThread Live Experience Summit', status: 'ACTIVE', isActive: true, startDate: '2026-09-17T12:00:00.000Z', endDate: '2026-09-18T12:00:00.000Z' },
      ],
      new Date('2026-09-04T12:00:00.000Z'),
    )

    expect(groups.upcoming.map((event) => event.id)).toEqual(['canonical-demo', 'legacy-fixture'])
  })
})
