import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    accountUserMembership: { findUnique: vi.fn() },
    account: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  AccountAccessDeniedError,
  assertUserCanAccessAccount,
  canUserAccessAccount,
  getAccessibleAccountIds,
  getAccessibleAccounts,
} from './account-access'

describe('canonical account access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: true })
    prismaMock.accountUserMembership.findUnique.mockImplementation(async ({ where }) => (
      ['account_a', 'account_b'].includes(where.userId_accountId.accountId) ? { id: 'membership' } : null
    ))
  })

  it('allows a regular ADMIN into each assigned account and denies an unassigned account', async () => {
    await expect(canUserAccessAccount('admin_1', 'account_a')).resolves.toBe(true)
    await expect(canUserAccessAccount('admin_1', 'account_b')).resolves.toBe(true)
    await expect(canUserAccessAccount('admin_1', 'account_c')).resolves.toBe(false)
  })

  it('asserts cross-account denial for direct URL and API consumers', async () => {
    await expect(assertUserCanAccessAccount('admin_1', 'account_c')).rejects.toBeInstanceOf(AccountAccessDeniedError)
  })

  it('keeps Platform Admin all-account access without membership rows', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN', isActive: true })
    await expect(canUserAccessAccount('platform_1', 'account_c')).resolves.toBe(true)
    expect(prismaMock.accountUserMembership.findUnique).not.toHaveBeenCalled()
  })

  it('returns only membership-scoped accounts and IDs for a regular user', async () => {
    const accounts = [
      { id: 'account_a', name: 'A', slug: 'a', accountType: 'RETAIL' },
      { id: 'account_b', name: 'B', slug: 'b', accountType: 'EVENTS' },
    ]
    prismaMock.account.findMany.mockResolvedValue(accounts)

    await expect(getAccessibleAccounts('admin_1')).resolves.toEqual(accounts)
    await expect(getAccessibleAccountIds('admin_1')).resolves.toEqual(['account_a', 'account_b'])
    expect(prismaMock.account.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userMemberships: { some: { userId: 'admin_1' } } },
    }))
  })
})
