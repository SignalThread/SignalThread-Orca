import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, prismaMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  prismaMock: {
    account: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    accountUserMembership: {
      findUnique: vi.fn(),
    },
    pendingProvision: {
      findMany: vi.fn(),
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }) } },
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

describe('GET /api/app/account/users', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({
      data: { user: { id: 'admin_123', email: 'admin@retail.co' } },
      error: null,
    })
    prismaMock.account.findUnique.mockResolvedValue(account)
    prismaMock.user.findUnique.mockResolvedValue({ accountId: 'acct_123', role: 'ADMIN', isActive: true })
    prismaMock.accountUserMembership.findUnique.mockResolvedValue({ id: 'membership_admin' })
    prismaMock.pendingProvision.findMany.mockResolvedValue([])
  })

  it('returns account-scoped memberships with canonical access and login state', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'active_user',
        email: 'active@retail.co',
        firstName: 'Active',
        lastName: 'User',
        role: 'MANAGER',
        isActive: true,
        createdAt: new Date('2026-06-01T12:00:00.000Z'),
        updatedAt: new Date('2026-06-01T12:00:00.000Z'),
      },
    ])

    const { GET } = await import('@/app/api/app/account/users/route')
    const response = await GET({
      nextUrl: new URL('http://localhost/api/app/account/users?account=retail-co'),
    } as never)

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.data.users).toHaveLength(1)
    expect(json.data.users[0].id).toBe('active_user')
    expect(json.data.users[0].status).toBe('NEVER_LOGGED_IN')
    expect(json.data.users[0].lastLoginAt).toBeNull()
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        accountMemberships: { some: { accountId: 'acct_123' } },
      },
      select: expect.any(Object),
      orderBy: { email: 'asc' },
    })
  })
})
