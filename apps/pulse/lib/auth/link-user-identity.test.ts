import { Prisma, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthIdentityConflictError,
  linkAuthenticatedUser,
} from '@/lib/auth/link-user-identity'

const canonicalUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'auth_user',
  email: 'owner@example.com',
  firstName: null,
  lastName: null,
  role: UserRole.ADMIN,
  accountId: 'account_1',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  account: { slug: 'events-demo' },
  ...overrides,
})

function databaseMock() {
  const tx = {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    pendingProvision: { findUnique: vi.fn(), update: vi.fn() },
    admin: { findUnique: vi.fn() },
    account: { findUnique: vi.fn() },
    accountUserMembership: { upsert: vi.fn() },
    eventIssueCluster: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    eventActionHistory: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    eventActionUpdate: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    eventActionAssignmentDelivery: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    eventAlertNote: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  }
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  }
  return { prisma, tx }
}

describe('linkAuthenticatedUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an existing authenticated ID without creating another row', async () => {
    const { prisma, tx } = databaseMock()
    const existing = canonicalUser()
    tx.user.findUnique.mockResolvedValueOnce(existing).mockResolvedValueOnce(existing)

    const result = await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: 'owner@example.com', isSuperAdmin: false,
    })

    expect(result).toBe(existing)
    expect(tx.user.create).not.toHaveBeenCalled()
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('normalizes casing and whitespace and creates a brand-new user once', async () => {
    const { prisma, tx } = databaseMock()
    tx.user.findUnique.mockResolvedValue(null)
    tx.pendingProvision.findUnique.mockResolvedValue(null)
    tx.admin.findUnique.mockResolvedValue(null)
    tx.user.create.mockResolvedValue(canonicalUser())

    await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: '  Owner@Example.COM  ', isSuperAdmin: false,
    })

    expect(tx.user.findUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { email: 'owner@example.com' },
    }))
    expect(tx.user.create).toHaveBeenCalledTimes(1)
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: 'auth_user', email: 'owner@example.com' }),
    }))
  })

  it('consumes PendingProvision transactionally and preserves its account, role, and profile', async () => {
    const { prisma, tx } = databaseMock()
    tx.user.findUnique.mockResolvedValue(null)
    tx.pendingProvision.findUnique.mockResolvedValue({
      id: 'provision_1', accountId: 'account_1', usedAt: null,
      role: UserRole.MANAGER, firstName: 'Jamie', lastName: 'Owner',
    })
    tx.user.create.mockResolvedValue(canonicalUser({ role: UserRole.MANAGER }))

    await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: 'owner@example.com', isSuperAdmin: false,
    })

    expect(tx.pendingProvision.update).toHaveBeenCalledWith({
      where: { id: 'provision_1' }, data: { usedAt: expect.any(Date) },
    })
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        accountId: 'account_1', role: UserRole.MANAGER,
        firstName: 'Jamie', lastName: 'Owner',
        accountMemberships: { create: { accountId: 'account_1' } },
      }),
    }))
  })

  it('reconciles one stale email row and preserves account and role', async () => {
    const { prisma, tx } = databaseMock()
    const stale = canonicalUser({ id: 'stale_user', role: UserRole.MANAGER })
    const reconciled = canonicalUser({ role: UserRole.MANAGER })
    tx.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(stale)
    tx.user.update.mockResolvedValue(reconciled)

    const result = await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: 'owner@example.com', isSuperAdmin: false,
    })

    expect(result.accountId).toBe('account_1')
    expect(result.role).toBe(UserRole.MANAGER)
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'stale_user' },
      data: { id: 'auth_user', email: 'owner@example.com' },
    }))
  })

  it('rewrites every non-foreign-key user reference during reconciliation', async () => {
    const { prisma, tx } = databaseMock()
    tx.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(canonicalUser({ id: 'stale_user' }))
    tx.user.update.mockResolvedValue(canonicalUser())

    await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: 'owner@example.com', isSuperAdmin: false,
    })

    expect(tx.eventIssueCluster.updateMany).toHaveBeenCalledTimes(8)
    expect(tx.eventActionHistory.updateMany).toHaveBeenCalledWith({
      where: { actorUserId: 'stale_user' }, data: { actorUserId: 'auth_user' },
    })
    expect(tx.eventActionUpdate.updateMany).toHaveBeenCalledWith({
      where: { authorUserId: 'stale_user' }, data: { authorUserId: 'auth_user' },
    })
    expect(tx.eventActionAssignmentDelivery.updateMany).toHaveBeenCalledTimes(2)
    expect(tx.eventAlertNote.updateMany).toHaveBeenCalledWith({
      where: { authorUserId: 'stale_user' }, data: { authorUserId: 'auth_user' },
    })
  })

  it('returns an explicit conflict when ID and email resolve to separate rows', async () => {
    const { prisma, tx } = databaseMock()
    tx.user.findUnique
      .mockResolvedValueOnce(canonicalUser({ id: 'auth_user', email: 'old@example.com' }))
      .mockResolvedValueOnce(canonicalUser({ id: 'other_user' }))

    await expect(linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: 'owner@example.com', isSuperAdmin: false,
    })).rejects.toBeInstanceOf(AuthIdentityConflictError)
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('updates a safely changed normalized email for the canonical ID', async () => {
    const { prisma, tx } = databaseMock()
    tx.user.findUnique
      .mockResolvedValueOnce(canonicalUser({ email: 'old@example.com' }))
      .mockResolvedValueOnce(null)
    tx.user.update.mockResolvedValue(canonicalUser())

    await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: ' OWNER@EXAMPLE.COM ', isSuperAdmin: false,
    })

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'auth_user' }, data: { email: 'owner@example.com' },
    }))
  })

  it('re-reads the canonical user after a create race instead of surfacing P2002', async () => {
    const { prisma, tx } = databaseMock()
    const canonical = canonicalUser()
    tx.user.findUnique
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(canonical).mockResolvedValueOnce(canonical)
    tx.pendingProvision.findUnique.mockResolvedValue(null)
    tx.admin.findUnique.mockResolvedValue(null)
    tx.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique email', {
      code: 'P2002', clientVersion: '5.22.0', meta: { target: ['email'] },
    }))

    const result = await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: 'owner@example.com', isSuperAdmin: false,
    })

    expect(result).toBe(canonical)
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(tx.user.create).toHaveBeenCalledTimes(1)
  })

  it('is idempotent when a retried request sees the row created by the first request', async () => {
    const { prisma, tx } = databaseMock()
    const canonical = canonicalUser()
    tx.user.findUnique.mockResolvedValue(canonical)

    const first = await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: 'owner@example.com', isSuperAdmin: false,
    })
    const retry = await linkAuthenticatedUser(prisma as never, {
      authUserId: 'auth_user', email: 'owner@example.com', isSuperAdmin: false,
    })

    expect(first).toBe(canonical)
    expect(retry).toBe(canonical)
    expect(tx.user.create).not.toHaveBeenCalled()
  })
})
