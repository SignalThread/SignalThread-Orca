import { describe, expect, it } from 'vitest'
import { resolveEventListeningWindow, validateEventListeningWindow } from './event-listening-window'

describe('event listening window', () => {
  it('defaults to five days around the event without fabricating a session schedule', () => {
    const window = resolveEventListeningWindow({ startDate: new Date('2026-09-10T12:00:00.000Z'), endDate: new Date('2026-09-12T12:00:00.000Z') })
    expect(window).toMatchObject({ source: 'DEFAULT', opensAt: new Date('2026-09-05T12:00:00.000Z'), closesAt: new Date('2026-09-17T12:00:00.000Z') })
  })

  it('uses saved edits and rejects an incomplete or reversed window', () => {
    const opensAt = new Date('2026-09-01T12:00:00.000Z')
    const closesAt = new Date('2026-09-20T12:00:00.000Z')
    expect(resolveEventListeningWindow({ startDate: null, endDate: null, listeningWindowOpensAt: opensAt, listeningWindowClosesAt: closesAt })).toMatchObject({ source: 'SAVED', opensAt, closesAt })
    expect(() => validateEventListeningWindow(closesAt, opensAt)).toThrow('Listening window opening time')
  })
})
