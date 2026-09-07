import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, prismaMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  prismaMock: {
    account: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    accountUserMembership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
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

function request(body: unknown) {
  return {
    nextUrl: new URL('http://localhost/api/app/account/users/user_removed?account=retail-co'),
    json: vi.fn().mockResolvedValue(body),
  } as never
}

describe('PATCH /api/app/account/users/[userId]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({
      data: { user: { id: 'admin_123', email: 'admin@retail.co' } },
      error: null,
    })
    prismaMock.account.findUnique.mockResolvedValue(account)
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock))
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => where.id === 'admin_123'
      ? { accountId: 'acct_123', role: 'ADMIN', isActive: true }
      : { id: 'user_removed', accountId: 'acct_123', role: 'MANAGER', isActive: true })
    prismaMock.accountUserMembership.findUnique.mockResolvedValue({ id: 'membership_1' })
    prismaMock.accountUserMembership.findFirst.mockResolvedValue({ accountId: 'acct_other' })
    prismaMock.accountUserMembership.count.mockResolvedValue(1)
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'user_removed',
      role: 'MANAGER',
      isActive: true,
    })
    prismaMock.user.update.mockResolvedValue({
      id: 'user_removed',
      accountId: 'acct_123',
      isActive: false,
    })
  })

  it('removes only this account membership and preserves the user’s other account access', async () => {
    const { PATCH } = await import('@/app/api/app/account/users/[userId]/route')
    const response = await PATCH(
      request({ isActive: false }),
      { params: { userId: 'user_removed' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.message).toBe('Access removed')
    expect(prismaMock.accountUserMembership.delete).toHaveBeenCalledWith({
      where: { id: 'membership_1' },
    })
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_removed' },
      data: { accountId: 'acct_other' },
    })
  })

  it('changes only an account-scoped customer role and rejects platform roles at validation', async () => {
    ;(prismaMock.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user_removed', role: 'MANAGER', isActive: true })

    const { PATCH } = await import('@/app/api/app/account/users/[userId]/route')
    const response = await PATCH(request({ role: 'VIEWER' }), { params: { userId: 'user_removed' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, message: 'Role updated' })
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'user_removed' }, data: { role: 'VIEWER' } })

    const invalid = await PATCH(request({ role: 'SUPER_ADMIN' }), { params: { userId: 'user_removed' } })
    expect(invalid.status).toBe(400)
  })
})
