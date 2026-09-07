import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, prismaMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  prismaMock: { user: { findUnique: vi.fn() } },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { requireAuthenticatedPulseUser } from './require-authenticated-user'

describe('requireAuthenticatedPulseUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SUPER_ADMIN_EMAILS
    getUserMock.mockResolvedValue({ data: { user: { id: 'user_1', email: 'owner@a.test' } }, error: null })
    prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: true })
  })

  it('returns 401 without a session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })
    const result = await requireAuthenticatedPulseUser()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(401)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns 403 for a Supabase Auth identity that is not a Pulse user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const result = await requireAuthenticatedPulseUser()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(403)
  })

  it('returns 403 for a deactivated Pulse user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'MANAGER', isActive: false })
    const result = await requireAuthenticatedPulseUser()
    expect(result.ok).toBe(false)
  })

  it('accepts an active Pulse user and a platform super admin', async () => {
    await expect(requireAuthenticatedPulseUser()).resolves.toEqual({
      ok: true, userId: 'user_1', email: 'owner@a.test', isSuperAdmin: false,
    })
    prismaMock.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN', isActive: true })
    await expect(requireAuthenticatedPulseUser()).resolves.toMatchObject({ ok: true, isSuperAdmin: true })
  })
})
