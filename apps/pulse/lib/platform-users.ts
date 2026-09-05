import type { Prisma, UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  generateLoginOtpForEmail,
  resendAccountInvite,
  setAccountUserActive,
  setAccountUserRole,
} from '@/lib/account-users'
import {
  authMetadataFor,
  deriveCanonicalUserAccessState,
  loadSupabaseAuthUserMetadata,
  type CanonicalInviteStatus,
  type CanonicalUserStatus,
} from '@/lib/user-access-state'

export const CUSTOMER_ACCOUNT_ADMIN_ROLES: UserRole[] = ['ADMIN']
export const PLATFORM_ACCOUNT_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'VIEWER']

export type PlatformUserRow = {
  key: string
  kind: 'USER' | 'INVITE'
  id: string
  name: string
  hasDisplayName: boolean
  email: string
  account: { id: string; name: string; slug: string } | null
  accountIds: string[]
  accountCount: number
  role: UserRole
  status: CanonicalUserStatus
  inviteStatus: CanonicalInviteStatus
  invitedAt: string | null
  activatedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  hasActiveAccess: boolean
}

export async function listPlatformUsers(): Promise<PlatformUserRow[]> {
  const [users, provisions, authUsers] = await Promise.all([
    prisma.user.findMany({
      include: {
        account: { select: { id: true, name: true, slug: true } },
        accountMemberships: { select: { accountId: true } },
      },
      orderBy: { email: 'asc' },
    }),
    prisma.pendingProvision.findMany({
      include: { account: { select: { id: true, name: true, slug: true } } },
      orderBy: { email: 'asc' },
    }),
    loadSupabaseAuthUserMetadata(),
  ])
  const provisionByEmail = new Map(provisions.map((invite) => [invite.email.trim().toLowerCase(), invite]))
  const userEmails = new Set(users.map((user) => user.email.trim().toLowerCase()))

  const userRows: PlatformUserRow[] = users.map((user) => {
    const invite = provisionByEmail.get(user.email.trim().toLowerCase()) ?? null
    const auth = authMetadataFor(authUsers, user)
    const state = deriveCanonicalUserAccessState({
      hasUser: true,
      isActive: user.isActive,
      inviteCreatedAt: invite?.createdAt,
      inviteUsedAt: invite?.usedAt,
      auth,
    })
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    return {
      key: `user:${user.id}`,
      kind: 'USER',
      id: user.id,
      name: displayName || user.email,
      hasDisplayName: Boolean(displayName),
      email: user.email,
      account: user.account,
      accountIds: user.role === 'SUPER_ADMIN' ? [] : user.accountMemberships.map((membership) => membership.accountId),
      accountCount: user.role === 'SUPER_ADMIN' ? 0 : user.accountMemberships.length,
      role: user.role,
      status: state.status,
      inviteStatus: state.inviteStatus,
      invitedAt: invite?.createdAt.toISOString() ?? auth?.invitedAt ?? null,
      activatedAt: state.activatedAt,
      lastLoginAt: state.lastLoginAt,
      createdAt: user.createdAt.toISOString(),
      hasActiveAccess: state.hasActiveAccess,
    }
  })

  const inviteRows: PlatformUserRow[] = provisions
    .filter((invite) => !invite.usedAt && !userEmails.has(invite.email.trim().toLowerCase()))
    .map((invite) => {
      const auth = authMetadataFor(authUsers, { email: invite.email })
      const state = deriveCanonicalUserAccessState({
        hasUser: false,
        inviteCreatedAt: invite.createdAt,
        inviteUsedAt: invite.usedAt,
        auth,
      })
      return {
        key: `invite:${invite.id}`,
        kind: 'INVITE',
        id: invite.id,
        name: [invite.firstName, invite.lastName].filter(Boolean).join(' ').trim() || invite.email,
        hasDisplayName: Boolean([invite.firstName, invite.lastName].filter(Boolean).join(' ').trim()),
        email: invite.email,
        account: invite.account,
        accountIds: [invite.accountId],
        accountCount: 1,
        role: invite.role,
        status: state.status,
        inviteStatus: state.inviteStatus,
        invitedAt: invite.createdAt.toISOString(),
        activatedAt: null,
        lastLoginAt: null,
        createdAt: invite.createdAt.toISOString(),
        hasActiveAccess: false,
      }
    })

  return [...userRows, ...inviteRows].sort((a, b) => a.email.localeCompare(b.email))
}

export async function listPlatformAccounts() {
  return prisma.account.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
}

async function recordPlatformUserAction(input: {
  actorUserId: string
  action: 'OTP_GENERATED' | 'INVITE_RESENT' | 'ROLE_CHANGED' | 'USER_DEACTIVATED' | 'USER_REACTIVATED'
  targetUserId?: string | null
  targetEmail: string
  accountId?: string | null
  metadata?: Record<string, string | boolean | null>
  db?: Prisma.TransactionClient
}) {
  const { db, ...data } = input
  await (db ?? prisma).platformUserActionAudit.create({ data })
}

export async function generatePlatformUserOtp(input: { actorUserId: string; targetUserId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, email: true, accountId: true, isActive: true },
  })
  if (!user) return { ok: false as const, status: 404, message: 'User not found' }
  if (!user.isActive) return { ok: false as const, status: 400, message: 'Reactivate this user before generating an OTP' }

  const otpResult = await generateLoginOtpForEmail(user.email)
  if (!otpResult.ok) return { ok: false as const, status: otpResult.status, message: otpResult.message }
  await recordPlatformUserAction({
    actorUserId: input.actorUserId,
    action: 'OTP_GENERATED',
    targetUserId: user.id,
    targetEmail: user.email,
    accountId: user.accountId,
    metadata: { delivery: 'display_once', credentialStored: false },
  })
  return { ok: true as const, otp: otpResult.otp, email: user.email }
}

export async function resendPlatformInvite(input: { actorUserId: string; inviteId: string }) {
  const invite = await prisma.pendingProvision.findUnique({
    where: { id: input.inviteId },
    select: { id: true, email: true, accountId: true, usedAt: true, role: true },
  })
  if (!invite || invite.usedAt) return { ok: false as const, status: 404, message: 'Pending invite not found' }
  const result = await resendAccountInvite({ accountId: invite.accountId, email: invite.email })
  if (!result.ok) return result
  await recordPlatformUserAction({
    actorUserId: input.actorUserId,
    action: 'INVITE_RESENT',
    targetEmail: invite.email,
    accountId: invite.accountId,
    metadata: { role: invite.role },
  })
  return { ok: true as const }
}

export async function updatePlatformAccountUser(input: {
  actorUserId: string
  targetUserId: string
  role?: UserRole
  isActive?: boolean
}) {
  const target = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, email: true, accountId: true, role: true, isActive: true },
  })
  if (!target || !target.accountId || target.role === 'SUPER_ADMIN') {
    return { ok: false as const, status: 404, message: 'Account user not found' }
  }
  if (input.role && !PLATFORM_ACCOUNT_ROLES.includes(input.role)) {
    return { ok: false as const, status: 400, message: 'Invalid account role' }
  }
  if (input.role && input.role !== target.role) {
    const nextRole = input.role
    const roleResult = await prisma.$transaction(async (tx) => {
      const result = await setAccountUserRole({
        db: tx,
        accountId: target.accountId!,
        actorUserId: input.actorUserId,
        targetUserId: target.id,
        role: nextRole,
      })
      if (!result.ok) return result
      await recordPlatformUserAction({
        db: tx,
        actorUserId: input.actorUserId,
        action: 'ROLE_CHANGED',
        targetUserId: target.id,
        targetEmail: target.email,
        accountId: target.accountId,
        metadata: { fromRole: target.role, toRole: nextRole },
      })
      return result
    })
    if (!roleResult.ok) return roleResult
  }
  if (typeof input.isActive === 'boolean' && input.isActive !== target.isActive) {
    const result = await prisma.$transaction(async (tx) => {
      const accessResult = await setAccountUserActive({
        db: tx,
        accountId: target.accountId!,
        actorUserId: input.actorUserId,
        targetUserId: target.id,
        isActive: input.isActive!,
      })
      if (!accessResult.ok) return accessResult
      await recordPlatformUserAction({
        db: tx,
        actorUserId: input.actorUserId,
        action: input.isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
        targetUserId: target.id,
        targetEmail: target.email,
        accountId: target.accountId,
        metadata: { active: input.isActive! },
      })
      return accessResult
    })
    if (!result.ok) return result
  }
  return { ok: true as const }
}
