import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, deleteAuthUserMock } = vi.hoisted(() => {
  const client = {
    account: { findUnique: vi.fn(), delete: vi.fn() },
    user: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    location: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
    answer: { findMany: vi.fn() },
    session: { findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  }
  client.$transaction.mockImplementation(async (callback: (tx: typeof client) => unknown) => callback(client))
  return { prismaMock: client, deleteAuthUserMock: vi.fn() }
})

vi.mock('./prisma', () => ({ prisma: prismaMock }))
vi.mock('./supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser: deleteAuthUserMock } } }),
}))
vi.mock('./objectStorage', () => ({ getS3Client: vi.fn() }))

import { deleteAccountAsSuperAdmin } from './account-deletion'

describe('multi-account safe account deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.account.findUnique.mockResolvedValue({
      id: 'account_a', name: 'Account A', stripeCustomerId: null, stripeSubscriptionId: null,
    })
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'multi_admin', accountId: 'account_a',
        accountMemberships: [{ accountId: 'account_b' }, { accountId: 'account_c' }],
      },
      { id: 'sole_user', accountId: 'account_a', accountMemberships: [] },
    ])
    prismaMock.location.findMany.mockResolvedValue([])
    deleteAuthUserMock.mockResolvedValue({ error: null })
  })

  it('preserves a multi-account identity, reassigns its primary, and deletes only final-membership identities', async () => {
    await expect(deleteAccountAsSuperAdmin('account_a', 'Account A')).resolves.toEqual({ ok: true })

    expect(deleteAuthUserMock).toHaveBeenCalledTimes(1)
    expect(deleteAuthUserMock).toHaveBeenCalledWith('sole_user')
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'multi_admin' }, data: { accountId: 'account_b' },
    })
    expect(prismaMock.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['sole_user'] } } })
    expect(prismaMock.account.delete).toHaveBeenCalledWith({ where: { id: 'account_a' } })
  })
})
