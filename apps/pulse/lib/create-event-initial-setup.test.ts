import { describe, expect, it, vi } from 'vitest'
import {
  appendInitialEventArea,
  createEventWithInitialSetup,
  normalizeInitialEventAreaName,
} from './create-event-initial-setup'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('Create Event initial setup', () => {
  it('trims area names, rejects blanks, and prevents case-insensitive duplicates', () => {
    expect(normalizeInitialEventAreaName('  Sponsor   Lounge  ')).toBe('Sponsor Lounge')
    expect(appendInitialEventArea([], '   ')).toMatchObject({ areas: [], added: false, reason: 'EMPTY' })
    expect(appendInitialEventArea(['Registration'], ' registration ')).toMatchObject({
      areas: ['Registration'], added: false, reason: 'DUPLICATE',
    })
    expect(appendInitialEventArea(['Registration'], ' Expo Hall ')).toMatchObject({
      areas: ['Registration', 'Expo Hall'], added: true,
    })
  })

  it('creates one event and persists areas for the direct no-agenda path', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ event: { id: 'event_1' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'area_1' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'area_2' } }, 201))

    const result = await createEventWithInitialSetup({
      accountSlug: 'events-co', eventPayload: { name: 'Summit', locationId: 'location_1', setupType: 'TEMPLATE' },
      eventAreaNames: ['Registration', 'Expo Hall'], fetcher,
    })

    expect(result).toMatchObject({ eventId: 'event_1', eventCreatedNow: true, importJobId: null, createdAreaNames: ['Registration', 'Expo Hall'], failedStage: null })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[0][0]).toBe('/api/app/events?account=events-co')
    expect(fetcher.mock.calls[1][0]).toBe('/api/app/events/event_1/survey-coverage?account=events-co')
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: 'CREATE_EVENT_AREA', name: 'Registration' })
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/agenda/imports'))).toBe(false)
  })

  it('creates a Basic event with metadata only and does not initialize setup work', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ event: { id: 'event_1' } }, 201))
    const result = await createEventWithInitialSetup({
      accountSlug: 'events-co',
      eventPayload: { name: 'Basic event', description: 'Optional context', locationId: 'location_1', setupType: 'BLANK' },
      eventAreaNames: [],
      fetcher,
    })
    expect(result).toMatchObject({ eventId: 'event_1', importJobId: null, failedStage: null })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      name: 'Basic event', description: 'Optional context', locationId: 'location_1', setupType: 'BLANK',
    })
  })

  it('resumes post-create setup against the existing event without creating a duplicate event', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Area already exists' }, 409))
    const result = await createEventWithInitialSetup({
      accountSlug: 'events-co', existingEventId: 'event_1', eventPayload: { name: 'Ignored on retry' },
      eventAreaNames: ['Registration'], fetcher,
    })
    expect(result).toMatchObject({ eventId: 'event_1', eventCreatedNow: false, importJobId: null, createdAreaNames: ['Registration'] })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls.some(([url]) => url === '/api/app/events?account=events-co')).toBe(false)
  })

  it('returns only failed areas for a retry and does not start agenda review early', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ event: { id: 'event_1' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'area_1' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Temporary failure' }, 503))
    const result = await createEventWithInitialSetup({
      accountSlug: 'events-co', eventPayload: { name: 'Summit' }, eventAreaNames: ['Registration', 'Expo Hall'],
      fetcher,
    })
    expect(result).toMatchObject({ eventId: 'event_1', createdAreaNames: ['Registration'], failedAreaNames: ['Expo Hall'], failedStage: 'EVENT_AREAS' })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
