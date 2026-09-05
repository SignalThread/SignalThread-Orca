import { describe, expect, it } from 'vitest'
import { eventLocalDateTimeToIso } from './event-agenda-time'

describe('eventLocalDateTimeToIso', () => {
  it('interprets event wall time in the selected timezone instead of the operator timezone', () => {
    expect(eventLocalDateTimeToIso('2026-09-17T11:00', 'America/New_York')).toBe('2026-09-17T15:00:00.000Z')
    expect(eventLocalDateTimeToIso('2026-09-17T11:00', 'America/Los_Angeles')).toBe('2026-09-17T18:00:00.000Z')
  })

  it('rejects invalid timezone and nonexistent daylight-saving wall times', () => {
    expect(() => eventLocalDateTimeToIso('2026-09-17T11:00', 'Not/A_Timezone')).toThrow('Timezone must be a valid IANA timezone')
    expect(() => eventLocalDateTimeToIso('2026-03-08T02:30', 'America/New_York')).toThrow('does not exist')
  })
})
