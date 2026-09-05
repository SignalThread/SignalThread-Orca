import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireAccountAdminMock = vi.fn()

const transaction = {
  event: {
    findFirst: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
  publicSurveyLink: { deleteMany: vi.fn() },
  session: { deleteMany: vi.fn() },
}

const prismaMock = {
  $transaction: vi.fn(),
}

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/auth/require-account-admin', () => ({
  requireAccountAdmin: requireAccountAdminMock,
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventAccess: vi.fn() }))
vi.mock('@/lib/questions', () => ({ syncEventQuestions: vi.fn() }))
vi.mock('@/lib/question-audio', () => ({ ensureEventQuestionAudioForEvent: vi.fn() }))

describe('DELETE /api/app/events/[eventId] canonical integration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      account: { id: 'acct_site_stay', slug: 'site-stay' },
    })
    transaction.event.findFirst.mockResolvedValue({ id: 'evt_target', name: 'Target Event' })
    transaction.event.delete.mockResolvedValue({ id: 'evt_target' })
    transaction.event.findUnique.mockResolvedValue(null)
    transaction.publicSurveyLink.deleteMany.mockResolvedValue({ count: 1 })
    transaction.session.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
  })

  it('confirms through the real route and canonical service, then removes only the scoped event', async () => {
    const { DELETE } = await import('@/app/api/app/events/[eventId]/route')

    const response = await DELETE(
      new NextRequest('http://localhost/api/app/events/evt_target?account=site-stay', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationName: 'Target Event' }),
      }),
      { params: { eventId: 'evt_target' } },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { eventId: 'evt_target', eventName: 'Target Event' },
    })
    expect(requireAccountAdminMock).toHaveBeenCalledWith('site-stay')
    expect(prismaMock.$transaction).toHaveBeenCalledOnce()
    expect(transaction.event.findFirst).toHaveBeenCalledWith({
      where: { id: 'evt_target', location: { accountId: 'acct_site_stay' } },
      select: { id: true, name: true },
    })
    expect(transaction.publicSurveyLink.deleteMany).toHaveBeenCalledWith({
      where: { survey: { eventId: 'evt_target' } },
    })
    expect(transaction.session.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'evt_target' } })
    expect(transaction.event.delete).toHaveBeenCalledWith({ where: { id: 'evt_target' } })
    expect(transaction.event.findUnique).toHaveBeenCalledWith({ where: { id: 'evt_target' }, select: { id: true } })
  })

  it('does not delete an event outside the authenticated account scope', async () => {
    transaction.event.findFirst.mockResolvedValue(null)
    const { DELETE } = await import('@/app/api/app/events/[eventId]/route')

    const response = await DELETE(
      new NextRequest('http://localhost/api/app/events/evt_other?account=site-stay', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationName: 'Other Account Event' }),
      }),
      { params: { eventId: 'evt_other' } },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'NOT_FOUND',
      error: 'Event not found or access denied.',
    })
    expect(transaction.event.findFirst).toHaveBeenCalledWith({
      where: { id: 'evt_other', location: { accountId: 'acct_site_stay' } },
      select: { id: true, name: true },
    })
    expect(transaction.publicSurveyLink.deleteMany).not.toHaveBeenCalled()
    expect(transaction.session.deleteMany).not.toHaveBeenCalled()
    expect(transaction.event.delete).not.toHaveBeenCalled()
  })
})
