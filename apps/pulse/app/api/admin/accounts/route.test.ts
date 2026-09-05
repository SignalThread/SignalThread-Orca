import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/require-super-admin', () => ({
  requireSuperAdminForApi: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { account: { findMany: vi.fn() } } }))

import { prisma } from '@/lib/prisma'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'

describe('GET /api/admin/accounts canonical admin count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(requireSuperAdminForApi as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, userId: 'platform-1' })
  })

  it.each([0, 1, 2])('returns %i active User ADMIN memberships without legacy Admin double-counting', async (admins) => {
    ;(prisma.account.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'account-1', name: 'Club Ichi', slug: 'club-ichi', accountType: 'EVENTS', tier: 'growth',
      isActive: true, email: null, createdAt: new Date('2026-08-01'), _count: { locations: 1, users: admins },
    }])
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/admin/accounts') as never)
    const body = await response.json()
    expect(body.accounts[0]._count.admins).toBe(admins)
    expect(prisma.account.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({
      _count: { select: { locations: true, users: { where: { isActive: true, role: { in: ['ADMIN'] } } } } },
    }) }))
  })
})
