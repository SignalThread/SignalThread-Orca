import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventSettingsPanel.tsx'), 'utf8')

describe('EventSettingsPanel', () => {
  it('loads and saves the canonical Event settings data through the existing scoped route', () => {
    expect(source).toContain('/api/app/events/${encodeURIComponent(eventId)}?account=${encodeURIComponent(accountSlug)}')
    expect(source).toContain('/api/app/events/${encodeURIComponent(eventId)}/settings?account=${encodeURIComponent(accountSlug)}')
    expect(source).toContain("method: 'PATCH'")
    for (const field of ['Event name', 'Description', 'Venue', 'Start date', 'End date', 'Event-wide listening window']) expect(source).toContain(field)
    expect(source).toContain('listeningWindowOpensAt: eventWindowIso(listeningOpenDate, listeningOpenTime)')
    expect(source).toContain('listeningWindowClosesAt: eventWindowIso(listeningCloseDate, listeningCloseTime)')
  })

  it('keeps deletion in the Event Settings danger zone with exact-name confirmation and server authority', () => {
    expect(source).toContain('Danger Zone')
    expect(source).toContain('Delete event')
    expect(source).toContain('Confirm event name')
    expect(source).toContain('deleteConfirmation !== event.name')
    expect(source).toContain("method: 'DELETE'")
    expect(source).toContain('confirmationName: deleteConfirmation')
    expect(source).toContain('router.replace(`/app?account=${encodeURIComponent(accountSlug)}`)')
  })
})
