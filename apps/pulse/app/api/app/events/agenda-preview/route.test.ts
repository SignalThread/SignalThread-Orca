import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireAccountMembershipMock = vi.fn()
vi.mock('@/lib/auth/require-account-membership', () => ({ requireAccountMembership: requireAccountMembershipMock }))

describe('POST /api/app/events/agenda-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAccountMembershipMock.mockResolvedValue({ ok: true, account: { id: 'account_1' }, userId: 'user_1' })
  })

  it('interprets an uploaded agenda without creating an Event or durable import job', async () => {
    const form = new FormData()
    form.set('file', new File([
      'Date,Time,Session,Speaker(s)\n2026-09-17,9:15 AM - 10:45 AM,Opening Keynote,Ben Nemtin',
    ], 'agenda.csv', { type: 'text/csv' }))
    form.set('timezone', 'America/New_York')
    const { POST } = await import('./route')
    const response = await POST(new NextRequest('http://localhost/api/app/events/agenda-preview?account=events', { method: 'POST', body: form }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.sourceFileName).toBe('agenda.csv')
    expect(body.data.mapping).toMatchObject({ title: 'Session', startDate: 'Date', startTime: 'Time', endTime: 'Time', speakerNames: 'Speaker(s)' })
    expect(body.data.rows).toHaveLength(1)
    expect(body.data.rows[0]).toMatchObject({ status: 'READY', normalized: { title: 'Opening Keynote' } })
  })

  it('rejects unauthenticated previews before reading the upload', async () => {
    requireAccountMembershipMock.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    const { POST } = await import('./route')
    const response = await POST(new NextRequest('http://localhost/api/app/events/agenda-preview?account=events', { method: 'POST', body: new FormData() }))
    expect(response.status).toBe(401)
  })
})
