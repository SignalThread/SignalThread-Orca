import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, prismaMock, canUserAccessAccountMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  canUserAccessAccountMock: vi.fn(),
  prismaMock: {
    user: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth/account-access', () => ({ canUserAccessAccount: canUserAccessAccountMock }))

import { requireLegacyEventReportingAccess } from './require-legacy-event-reporting-access'

const event = { id: 'event_1', location: { accountId: 'account_a' } }

describe('requireLegacyEventReportingAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SUPER_ADMIN_EMAILS
    getUserMock.mockResolvedValue({ data: { user: { id: 'user_1', email: 'member@a.test' } }, error: null })
    prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: true })
    prismaMock.event.findUnique.mockResolvedValue(event)
    canUserAccessAccountMock.mockResolvedValue(true)
  })

  it('rejects anonymous callers with 401 before touching the database', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })
    const result = await requireLegacyEventReportingAccess('event_1')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(401)
    expect(result.response.status).toBe(401)
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled()
  })

  it('allows an active member of the account that owns the event', async () => {
    const result = await requireLegacyEventReportingAccess('event_1')
    expect(result).toEqual({ ok: true, userId: 'user_1', accountId: 'account_a', isSuperAdmin: false })
    expect(canUserAccessAccountMock).toHaveBeenCalledWith('user_1', 'account_a')
  })

  it('denies an authenticated user from another account with a non-enumerating 404', async () => {
    canUserAccessAccountMock.mockResolvedValue(false)
    const result = await requireLegacyEventReportingAccess('event_1')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(404)
    await expect(result.response.json()).resolves.toEqual({ success: false, error: 'Event not found or access denied' })
  })

  it('denies a deactivated user even with a membership row', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: false })
    const result = await requireLegacyEventReportingAccess('event_1')
    expect(result.ok).toBe(false)
    expect(canUserAccessAccountMock).not.toHaveBeenCalled()
  })

  it('denies a session with no Pulse User row', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const result = await requireLegacyEventReportingAccess('event_1')
    expect(result.ok).toBe(false)
    expect(canUserAccessAccountMock).not.toHaveBeenCalled()
  })

  it('answers 404 for a missing event and for a blank eventId', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null)
    await expect(requireLegacyEventReportingAccess('missing')).resolves.toMatchObject({ ok: false, status: 404 })
    await expect(requireLegacyEventReportingAccess('  ')).resolves.toMatchObject({ ok: false, status: 404 })
  })

  it('keeps platform super admins on any account without a membership lookup', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN', isActive: true })
    const result = await requireLegacyEventReportingAccess('event_1')
    expect(result).toEqual({ ok: true, userId: 'user_1', accountId: 'account_a', isSuperAdmin: true })
    expect(canUserAccessAccountMock).not.toHaveBeenCalled()
  })
})
