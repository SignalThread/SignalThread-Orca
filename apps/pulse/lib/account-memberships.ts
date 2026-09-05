import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type MembershipDb = typeof prisma | Prisma.TransactionClient

const accountSummarySelect = {
  id: true,
  name: true,
  slug: true,
  accountType: true,
} satisfies Prisma.AccountSelect

async function findManageableAdmin(userId: string, db: MembershipDb) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      accountId: true,
      isActive: true,
    },
  })
}

function notManageable() {
  return { ok: false as const, status: 404, code: 'not_found', message: 'Regular admin user not found' }
}

export async function getPlatformAdminAccountAccess(userId: string) {
  const user = await findManageableAdmin(userId, prisma)
  if (!user || user.role !== 'ADMIN') return notManageable()

  const [memberships, accounts] = await Promise.all([
    prisma.accountUserMembership.findMany({
      where: { userId },
      select: {
        account: { select: accountSummarySelect },
        createdAt: true,
      },
      orderBy: [{ account: { name: 'asc' } }, { accountId: 'asc' }],
    }),
    prisma.account.findMany({
      select: accountSummarySelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
  ])

  return {
    ok: true as const,
    user: {
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      email: user.email,
      role: user.role,
      primaryAccountId: user.accountId,
      isActive: user.isActive,
    },
    memberships: memberships.map((membership) => ({
      ...membership.account,
      isPrimary: membership.account.id === user.accountId,
      createdAt: membership.createdAt.toISOString(),
    })),
    accounts,
  }
}

export async function addPlatformAdminAccountAccess(userId: string, accountId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await findManageableAdmin(userId, tx)
    if (!user || user.role !== 'ADMIN') return notManageable()

    const account = await tx.account.findUnique({ where: { id: accountId }, select: { id: true } })
    if (!account) {
      return { ok: false as const, status: 400, code: 'invalid_account', message: 'Selected account does not exist' }
    }

    await tx.accountUserMembership.upsert({
      where: { userId_accountId: { userId, accountId } },
      create: { userId, accountId },
      update: {},
    })
    if (!user.accountId) {
      await tx.user.update({ where: { id: userId }, data: { accountId } })
    }
    return { ok: true as const }
  })
}

export async function setPlatformAdminPrimaryAccount(userId: string, accountId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await findManageableAdmin(userId, tx)
    if (!user || user.role !== 'ADMIN') return notManageable()

    const membership = await tx.accountUserMembership.findUnique({
      where: { userId_accountId: { userId, accountId } },
      select: { id: true },
    })
    if (!membership) {
      return {
        ok: false as const,
        status: 400,
        code: 'primary_not_member',
        message: 'Primary account must be one of the user’s assigned accounts',
      }
    }

    await tx.user.update({ where: { id: userId }, data: { accountId } })
    return { ok: true as const }
  })
}

export async function removePlatformAdminAccountAccess(input: {
  userId: string
  accountId: string
  replacementPrimaryAccountId?: string
}) {
  return prisma.$transaction(async (tx) => {
    const user = await findManageableAdmin(input.userId, tx)
    if (!user || user.role !== 'ADMIN') return notManageable()

    const membership = await tx.accountUserMembership.findUnique({
      where: { userId_accountId: { userId: input.userId, accountId: input.accountId } },
      select: { id: true },
    })
    if (!membership) return { ok: true as const }

    const remaining = await tx.accountUserMembership.findMany({
      where: { userId: input.userId, accountId: { not: input.accountId } },
      select: { accountId: true },
      orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }],
    })

    let nextPrimaryId = user.accountId
    if (user.accountId === input.accountId) {
      if (remaining.length > 0) {
        const requested = input.replacementPrimaryAccountId
        if (!requested || !remaining.some((row) => row.accountId === requested)) {
          return {
            ok: false as const,
            status: 400,
            code: 'replacement_primary_required',
            message: 'Choose another assigned account as primary before removing the current primary account',
          }
        }
        nextPrimaryId = requested
      } else {
        nextPrimaryId = null
      }
    }

    await tx.accountUserMembership.delete({ where: { id: membership.id } })
    if (nextPrimaryId !== user.accountId) {
      await tx.user.update({ where: { id: input.userId }, data: { accountId: nextPrimaryId } })
    }
    return { ok: true as const }
  })
}
