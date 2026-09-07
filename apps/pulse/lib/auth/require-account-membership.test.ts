import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, prismaMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  prismaMock: {
    account: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    accountUserMembership: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const account = {
  id: 'acct_123',
  slug: 'retail-co',
  name: 'Retail Co',
  email: 'owner@retail.co',
  tier: 'starter',
  trialEndsAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  billingJson: null,
}

describe('requireAccountMembership', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.SUPER_ADMIN_EMAILS
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user_123', email: 'owner@retail.co' } },
      error: null,
    })
    prismaMock.account.findUnique.mockResolvedValue(account)
  })

  it('rejects a removed retail user even if they know the old account slug', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      accountId: null,
      role: 'MANAGER',
      isActive: false,
    })

    const { requireAccountMembership } = await import('./require-account-membership')
    const result = await requireAccountMembership('retail-co')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
    }
  })

  it('allows an active user assigned to the requested retail account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      role: 'MANAGER',
      isActive: true,
    })
    prismaMock.accountUserMembership.findUnique.mockResolvedValue({ id: 'membership_1' })

    const { requireAccountMembership } = await import('./require-account-membership')
    const result = await requireAccountMembership('retail-co')

    expect(result).toMatchObject({
      ok: true,
      userId: 'user_123',
      account: {
        id: 'acct_123',
        slug: 'retail-co',
      },
    })
  })

  it('rejects an active user without a membership in the requested retail account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      role: 'MANAGER',
      isActive: true,
    })
    prismaMock.accountUserMembership.findUnique.mockResolvedValue(null)

    const { requireAccountMembership } = await import('./require-account-membership')
    const result = await requireAccountMembership('retail-co')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
    }
  })

  it('keeps SUPER_ADMIN blocked by default but allows it when a route opts in', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      accountId: null,
      role: 'SUPER_ADMIN',
      isActive: true,
    })

    const { requireAccountMembership } = await import('./require-account-membership')
    const blocked = await requireAccountMembership('retail-co')
    const allowed = await requireAccountMembership('retail-co', { allowSuperAdmin: true })

    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.response.status).toBe(403)
    }
    expect(allowed).toMatchObject({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123' },
    })
  })
})
