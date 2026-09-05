import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type AccountAccessDb = typeof prisma | Prisma.TransactionClient

export const accessibleAccountSelect = {
  id: true,
  name: true,
  slug: true,
  accountType: true,
} satisfies Prisma.AccountSelect

export type AccessibleAccount = Prisma.AccountGetPayload<{
  select: typeof accessibleAccountSelect
}>

export class AccountAccessDeniedError extends Error {
  readonly code = 'ACCOUNT_ACCESS_DENIED'

  constructor() {
    super('User cannot access this account')
    this.name = 'AccountAccessDeniedError'
  }
}

/**
 * Canonical server-side tenant authorization.
 *
 * SUPER_ADMIN keeps its existing all-account access and intentionally does not
 * need membership rows. For every regular user, AccountUserMembership is the
 * complete access source; User.accountId is only the primary/default account.
 */
export async function canUserAccessAccount(
  userId: string,
  accountId: string,
  db: AccountAccessDb = prisma,
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  })
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true
  if (!user.isActive) return false

  const membership = await db.accountUserMembership.findUnique({
    where: { userId_accountId: { userId, accountId } },
    select: { id: true },
  })
  return Boolean(membership)
}

export async function assertUserCanAccessAccount(
  userId: string,
  accountId: string,
  db: AccountAccessDb = prisma,
): Promise<void> {
  if (!await canUserAccessAccount(userId, accountId, db)) {
    throw new AccountAccessDeniedError()
  }
}

export async function getAccessibleAccounts(
  userId: string,
  db: AccountAccessDb = prisma,
): Promise<AccessibleAccount[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  })
  if (!user || (!user.isActive && user.role !== 'SUPER_ADMIN')) return []

  return db.account.findMany({
    where: user.role === 'SUPER_ADMIN'
      ? undefined
      : { userMemberships: { some: { userId } } },
    select: accessibleAccountSelect,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
}

export async function getAccessibleAccountIds(
  userId: string,
  db: AccountAccessDb = prisma,
): Promise<string[]> {
  const accounts = await getAccessibleAccounts(userId, db)
  return accounts.map((account) => account.id)
}
