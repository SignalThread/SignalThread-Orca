import { createHash } from 'node:crypto'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'

const linkedUserInclude = {
  account: {
    select: { slug: true },
  },
} satisfies Prisma.UserInclude

export type LinkedUser = Prisma.UserGetPayload<{
  include: typeof linkedUserInclude
}>

export type LinkAuthenticatedUserInput = {
  authUserId: string
  email: string
  isSuperAdmin: boolean
}

export class AuthIdentityConflictError extends Error {
  readonly code = 'AUTH_IDENTITY_CONFLICT'

  constructor() {
    super('Authenticated identity conflicts with an existing user')
    this.name = 'AuthIdentityConflictError'
  }
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function safeIdentityContext(input: { authUserId: string; email: string }, prismaUserId?: string) {
  return {
    authUserIdPrefix: input.authUserId.slice(0, 8),
    prismaUserIdPrefix: prismaUserId?.slice(0, 8),
    emailFingerprint: createHash('sha256').update(normalizeAuthEmail(input.email)).digest('hex').slice(0, 12),
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2002'
}

async function updateUnconstrainedUserReferences(
  tx: Prisma.TransactionClient,
  previousUserId: string,
  authUserId: string,
): Promise<void> {
  await tx.eventIssueCluster.updateMany({ where: { ownerUserId: previousUserId }, data: { ownerUserId: authUserId } })
  await tx.eventIssueCluster.updateMany({ where: { ownerAssignedByUserId: previousUserId }, data: { ownerAssignedByUserId: authUserId } })
  await tx.eventIssueCluster.updateMany({ where: { acknowledgedByUserId: previousUserId }, data: { acknowledgedByUserId: authUserId } })
  await tx.eventIssueCluster.updateMany({ where: { actingByUserId: previousUserId }, data: { actingByUserId: authUserId } })
  await tx.eventIssueCluster.updateMany({ where: { resolvedByUserId: previousUserId }, data: { resolvedByUserId: authUserId } })
  await tx.eventIssueCluster.updateMany({ where: { dismissedByUserId: previousUserId }, data: { dismissedByUserId: authUserId } })
  await tx.eventIssueCluster.updateMany({ where: { reopenedByUserId: previousUserId }, data: { reopenedByUserId: authUserId } })
  await tx.eventIssueCluster.updateMany({ where: { actionConvertedByUserId: previousUserId }, data: { actionConvertedByUserId: authUserId } })
  await tx.eventActionHistory.updateMany({ where: { actorUserId: previousUserId }, data: { actorUserId: authUserId } })
  await tx.eventActionUpdate.updateMany({ where: { authorUserId: previousUserId }, data: { authorUserId: authUserId } })
  await tx.eventActionAssignmentDelivery.updateMany({ where: { recipientUserId: previousUserId }, data: { recipientUserId: authUserId } })
  await tx.eventActionAssignmentDelivery.updateMany({ where: { assignedByUserId: previousUserId }, data: { assignedByUserId: authUserId } })
  await tx.eventAlertNote.updateMany({ where: { authorUserId: previousUserId }, data: { authorUserId: authUserId } })
}

async function resolveNewUserAccess(
  tx: Prisma.TransactionClient,
  normalizedEmail: string,
  isSuperAdmin: boolean,
): Promise<{
  accountId: string | null
  role: UserRole
  firstName?: string
  lastName?: string
}> {
  if (isSuperAdmin) {
    return { accountId: null, role: UserRole.SUPER_ADMIN }
  }

  const pendingProvision = await tx.pendingProvision.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      accountId: true,
      usedAt: true,
      role: true,
      firstName: true,
      lastName: true,
    },
  })

  if (pendingProvision && !pendingProvision.usedAt) {
    await tx.pendingProvision.update({
      where: { id: pendingProvision.id },
      data: { usedAt: new Date() },
    })
    return {
      accountId: pendingProvision.accountId,
      role: pendingProvision.role,
      firstName: pendingProvision.firstName ?? undefined,
      lastName: pendingProvision.lastName ?? undefined,
    }
  }

  const legacyAdmin = await tx.admin.findUnique({
    where: { email: normalizedEmail },
    select: { accountId: true },
  })
  if (legacyAdmin?.accountId) {
    return { accountId: legacyAdmin.accountId, role: UserRole.ADMIN }
  }

  const emailDomain = normalizedEmail.split('@')[1]
  const fallbackSlug = emailDomain === 'acmecoffee.com'
    ? 'acme-coffee'
    : emailDomain === 'techconf.io'
      ? 'techconf-events'
      : null
  if (!fallbackSlug) {
    return { accountId: null, role: UserRole.ADMIN }
  }

  const account = await tx.account.findUnique({
    where: { slug: fallbackSlug },
    select: { id: true },
  })
  return { accountId: account?.id ?? null, role: UserRole.ADMIN }
}

async function applyPendingMembershipToExistingAdmin(
  tx: Prisma.TransactionClient,
  normalizedEmail: string,
  user: LinkedUser,
): Promise<LinkedUser> {
  if (user.role !== UserRole.ADMIN) return user
  const pending = await tx.pendingProvision.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, accountId: true, role: true, usedAt: true },
  })
  if (!pending || pending.usedAt || pending.role !== UserRole.ADMIN) return user

  await tx.accountUserMembership.upsert({
    where: { userId_accountId: { userId: user.id, accountId: pending.accountId } },
    create: { userId: user.id, accountId: pending.accountId },
    update: {},
  })
  await tx.pendingProvision.update({ where: { id: pending.id }, data: { usedAt: new Date() } })
  if (user.accountId) return user
  return tx.user.update({
    where: { id: user.id },
    data: { accountId: pending.accountId },
    include: linkedUserInclude,
  })
}

async function reconcileInTransaction(
  tx: Prisma.TransactionClient,
  input: LinkAuthenticatedUserInput,
): Promise<LinkedUser> {
  const normalizedEmail = normalizeAuthEmail(input.email)
  if (!normalizedEmail) {
    throw new Error('Authenticated user is missing an email address')
  }

  const byId = await tx.user.findUnique({
    where: { id: input.authUserId },
    include: linkedUserInclude,
  })
  const byEmail = await tx.user.findUnique({
    where: { email: normalizedEmail },
    include: linkedUserInclude,
  })

  if (byId && byEmail && byId.id !== byEmail.id) {
    console.error('[link-user] Identity conflict', safeIdentityContext(input, byEmail.id))
    throw new AuthIdentityConflictError()
  }

  if (byId) {
    if (byId.email === normalizedEmail) {
      return applyPendingMembershipToExistingAdmin(tx, normalizedEmail, byId)
    }
    const updated = await tx.user.update({
      where: { id: byId.id },
      data: { email: normalizedEmail },
      include: linkedUserInclude,
    })
    return applyPendingMembershipToExistingAdmin(tx, normalizedEmail, updated)
  }

  if (byEmail) {
    await updateUnconstrainedUserReferences(tx, byEmail.id, input.authUserId)
    const reconciled = await tx.user.update({
      where: { id: byEmail.id },
      data: { id: input.authUserId, email: normalizedEmail },
      include: linkedUserInclude,
    })
    console.info('[link-user] Reconciled stale user identity', safeIdentityContext(input, byEmail.id))
    return applyPendingMembershipToExistingAdmin(tx, normalizedEmail, reconciled)
  }

  const access = await resolveNewUserAccess(tx, normalizedEmail, input.isSuperAdmin)
  const created = await tx.user.create({
    data: {
      id: input.authUserId,
      email: normalizedEmail,
      firstName: access.firstName,
      lastName: access.lastName,
      role: access.role,
      accountId: access.accountId,
      accountMemberships: access.accountId && access.role !== UserRole.SUPER_ADMIN
        ? { create: { accountId: access.accountId } }
        : undefined,
    },
    include: linkedUserInclude,
  })
  console.info('[link-user] Created user identity', safeIdentityContext(input))
  return created
}

export async function linkAuthenticatedUser(
  prisma: PrismaClient,
  input: LinkAuthenticatedUserInput,
): Promise<LinkedUser> {
  try {
    return await prisma.$transaction((tx) => reconcileInTransaction(tx, input))
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error

    // A concurrent retry may have created the canonical row after our initial
    // reads. Re-read in a fresh transaction instead of surfacing raw P2002.
    return prisma.$transaction((tx) => reconcileInTransaction(tx, input))
  }
}
