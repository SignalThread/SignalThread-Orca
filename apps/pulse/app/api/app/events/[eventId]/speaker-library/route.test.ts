import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAccountAdminMock, listEventSpeakerLibraryMock } = vi.hoisted(() => ({
  requireAccountAdminMock: vi.fn(),
  listEventSpeakerLibraryMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-account-admin', () => ({ requireAccountAdmin: requireAccountAdminMock }))
vi.mock('@/lib/event-agenda-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/event-agenda-service')>(),
  listEventSpeakerLibrary: listEventSpeakerLibraryMock,
}))

import { GET } from './route'

const params = { params: { eventId: 'event_1' } }
const request = () => new NextRequest('http://localhost/api/app/events/event_1/speaker-library?account=events-demo')

describe('/api/app/events/[eventId]/speaker-library', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      account: { id: 'account_1', slug: 'events-demo', accountType: 'EVENTS' },
    })
  })

  it('loads only library speakers available to the authorized account and current event', async () => {
    listEventSpeakerLibraryMock.mockResolvedValue([{ id: 'speaker_1', name: 'Avery Brooks' }])

    const response = await GET(request(), params)

    expect(response.status).toBe(200)
    expect(listEventSpeakerLibraryMock).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1' })
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { speakers: [{ id: 'speaker_1' }] } })
  })

  it('preserves the canonical account-admin rejection before reading the library', async () => {
    requireAccountAdminMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })

    const response = await GET(request(), params)

    expect(response.status).toBe(403)
    expect(listEventSpeakerLibraryMock).not.toHaveBeenCalled()
  })
})
