import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => {
  const client = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    account: { findUnique: vi.fn(), findMany: vi.fn() },
    accountUserMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  client.$transaction.mockImplementation(async (callback: (tx: typeof client) => unknown) => callback(client))
  return { prismaMock: client }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  addPlatformAdminAccountAccess,
  removePlatformAdminAccountAccess,
  setPlatformAdminPrimaryAccount,
} from './account-memberships'

describe('Platform Admin account membership management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'admin_1', email: 'admin@example.com', firstName: 'Jane', lastName: 'Smith',
      role: 'ADMIN', accountId: 'account_a', isActive: true,
    })
    prismaMock.account.findUnique.mockResolvedValue({ id: 'account_b' })
    prismaMock.accountUserMembership.upsert.mockResolvedValue({ id: 'membership_b' })
  })

  it('adds second and third accounts idempotently without changing the existing primary', async () => {
    await expect(addPlatformAdminAccountAccess('admin_1', 'account_b')).resolves.toEqual({ ok: true })
    await expect(addPlatformAdminAccountAccess('admin_1', 'account_c')).resolves.toEqual({ ok: true })
    await expect(addPlatformAdminAccountAccess('admin_1', 'account_b')).resolves.toEqual({ ok: true })
    expect(prismaMock.accountUserMembership.upsert).toHaveBeenCalledTimes(3)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('changes primary only to an existing membership', async () => {
    prismaMock.accountUserMembership.findUnique.mockResolvedValue({ id: 'membership_b' })
    await expect(setPlatformAdminPrimaryAccount('admin_1', 'account_b')).resolves.toEqual({ ok: true })
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'admin_1' }, data: { accountId: 'account_b' } })

    prismaMock.accountUserMembership.findUnique.mockResolvedValue(null)
    await expect(setPlatformAdminPrimaryAccount('admin_1', 'account_c')).resolves.toMatchObject({
      ok: false, code: 'primary_not_member',
    })
  })

  it('removes one non-primary membership while leaving primary and other memberships intact', async () => {
    prismaMock.accountUserMembership.findUnique.mockResolvedValue({ id: 'membership_b' })
    prismaMock.accountUserMembership.findMany.mockResolvedValue([{ accountId: 'account_a' }, { accountId: 'account_c' }])
    await expect(removePlatformAdminAccountAccess({ userId: 'admin_1', accountId: 'account_b' })).resolves.toEqual({ ok: true })
    expect(prismaMock.accountUserMembership.delete).toHaveBeenCalledWith({ where: { id: 'membership_b' } })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('requires a valid replacement when removing the primary and changes it atomically', async () => {
    prismaMock.accountUserMembership.findUnique.mockResolvedValue({ id: 'membership_a' })
    prismaMock.accountUserMembership.findMany.mockResolvedValue([{ accountId: 'account_b' }])

    await expect(removePlatformAdminAccountAccess({ userId: 'admin_1', accountId: 'account_a' })).resolves.toMatchObject({
      ok: false, code: 'replacement_primary_required',
    })
    expect(prismaMock.accountUserMembership.delete).not.toHaveBeenCalled()

    await expect(removePlatformAdminAccountAccess({
      userId: 'admin_1', accountId: 'account_a', replacementPrimaryAccountId: 'account_b',
    })).resolves.toEqual({ ok: true })
    expect(prismaMock.accountUserMembership.delete).toHaveBeenCalledWith({ where: { id: 'membership_a' } })
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'admin_1' }, data: { accountId: 'account_b' } })
  })
})
