import type { Prisma, UserRole } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAccountAdmin, type AccountAdminResult } from '@/lib/auth/require-account-admin'
import {
  authMetadataFor,
  deriveCanonicalUserAccessState,
  loadSupabaseAuthUserMetadata,
} from '@/lib/user-access-state'

/** Roles allowed for account team invites (no platform SUPER_ADMIN). */
export const ACCOUNT_INVITE_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'VIEWER']

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isAllowedInviteRole(role: UserRole): boolean {
  return ACCOUNT_INVITE_ROLES.includes(role)
}

export async function sendEmailOtpCode(params: {
  email: string
  shouldCreateUser?: boolean
}): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  const email = normalizeInviteEmail(params.email)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return {
      ok: false,
      status: 503,
      code: 'otp_unconfigured',
      message:
        'Email verification code delivery is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the server.',
    }
  }

  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: params.shouldCreateUser ?? true,
    },
  })

  if (error) {
    return {
      ok: false,
      status: 400,
      code: 'otp_send_failed',
      message: error.message || 'Could not send verification code',
    }
  }

  return { ok: true }
}

/**
 * Generates a display-once email OTP through the Supabase Admin API. The
 * caller is responsible for authorizing the target user and must never log or
 * persist the returned credential.
 */
export async function generateLoginOtpForEmail(email: string): Promise<
  | { ok: true; otp: string }
  | { ok: false; status: number; code: string; message: string }
> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return {
      ok: false,
      status: 503,
      code: 'otp_unconfigured',
      message: 'Login code generation is not configured.',
    }
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: normalizeInviteEmail(email),
  })
  if (error || !data?.properties?.email_otp) {
    return {
      ok: false,
      status: 400,
      code: 'otp_generate_failed',
      message: error?.message || 'Supabase did not return an email OTP',
    }
  }

  return { ok: true, otp: data.properties.email_otp }
}

export async function requireRetailAccountUserManager(accountSlug: string | null): Promise<AccountAdminResult> {
  return requireAccountAdmin(accountSlug)
}

export async function listRetailAccountUsersAndInvites(accountId: string) {
  const [users, provisions, authUsers] = await Promise.all([
    prisma.user.findMany({
      where: { accountMemberships: { some: { accountId } } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { email: 'asc' },
    }),
    prisma.pendingProvision.findMany({
      where: { accountId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        usedAt: true,
      },
      orderBy: { email: 'asc' },
    }),
    loadSupabaseAuthUserMetadata(),
  ])
  const provisionByEmail = new Map(provisions.map((invite) => [normalizeInviteEmail(invite.email), invite]))
  const userEmails = new Set(users.map((user) => normalizeInviteEmail(user.email)))

  return {
    users: users.map((user) => {
      const invite = provisionByEmail.get(normalizeInviteEmail(user.email)) ?? null
      const state = deriveCanonicalUserAccessState({
        hasUser: true,
        isActive: user.isActive,
        inviteCreatedAt: invite?.createdAt,
        inviteUsedAt: invite?.usedAt,
        auth: authMetadataFor(authUsers, user),
      })
      return {
        ...user,
        status: state.status,
        inviteStatus: state.inviteStatus,
        invitedAt: invite?.createdAt.toISOString() ?? null,
        joinedAt: state.activatedAt,
        lastLoginAt: state.lastLoginAt,
      }
    }),
    pendingInvites: provisions
      .filter((invite) => !invite.usedAt && !userEmails.has(normalizeInviteEmail(invite.email)))
      .map((invite) => {
        const state = deriveCanonicalUserAccessState({
          hasUser: false,
          inviteCreatedAt: invite.createdAt,
          inviteUsedAt: invite.usedAt,
          auth: authMetadataFor(authUsers, { email: invite.email }),
        })
        return {
          ...invite,
          status: state.status,
          inviteStatus: state.inviteStatus,
          invitedAt: invite.createdAt.toISOString(),
          joinedAt: null,
          lastLoginAt: null,
        }
      }),
  }
}

export const listAccountUsersAndInvites = listRetailAccountUsersAndInvites

async function findAuthUserByEmail(email: string) {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return null
  }
  const normalized = normalizeInviteEmail(email)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized)
    if (match) return match
    if (data.users.length < 1000) break
  }
  return null
}

export type InviteAccountUserResult =
  | { ok: true; kind: 'invited' | 'invite_resent' | 'access_added' }
  | { ok: false; status: number; code: string; message: string }

/**
 * Creates or updates PendingProvision and sends Supabase invite (same pattern as provisioning).
 */
export async function inviteOrResendAccountUser(params: {
  accountId: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
}): Promise<InviteAccountUserResult> {
  const { accountId, firstName, lastName } = params
  const email = normalizeInviteEmail(params.email)
  const role = params.role

  if (!email || !email.includes('@')) {
    return { ok: false, status: 400, code: 'invalid_email', message: 'Valid email is required' }
  }
  if (!isAllowedInviteRole(role)) {
    return { ok: false, status: 400, code: 'invalid_role', message: 'Invalid role for account users' }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, accountId: true, role: true, isActive: true },
  })

  if (existingUser) {
    if (existingUser.role === 'SUPER_ADMIN') {
      return {
        ok: false,
        status: 409,
        code: 'email_reserved',
        message: 'This email cannot be invited as an account user',
      }
    }
    if (existingUser.role !== 'ADMIN' || role !== 'ADMIN') {
      return {
        ok: false,
        status: 409,
        code: 'multi_account_role_unsupported',
        message: 'Only existing Admin users can be added to another account',
      }
    }
    if (!existingUser.isActive) {
      return {
        ok: false,
        status: 409,
        code: 'user_inactive',
        message: 'This user is globally deactivated. A Platform Admin must reactivate them first.',
      }
    }

    const existingMembership = await prisma.accountUserMembership.findUnique({
      where: { userId_accountId: { userId: existingUser.id, accountId } },
      select: { id: true },
    })
    if (existingMembership) {
      return {
        ok: false,
        status: 409,
        code: 'duplicate_user',
        message: 'This person is already a user on your account',
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.accountUserMembership.upsert({
        where: { userId_accountId: { userId: existingUser.id, accountId } },
        create: { userId: existingUser.id, accountId },
        update: {},
      })
      if (!existingUser.accountId) {
        await tx.user.update({ where: { id: existingUser.id }, data: { accountId } })
      }
    })
    return { ok: true, kind: 'access_added' }
  }

  const pending = await prisma.pendingProvision.findUnique({
    where: { email },
    select: { id: true, accountId: true, usedAt: true },
  })

  if (pending) {
    if (pending.accountId !== accountId) {
      return {
        ok: false,
        status: 409,
        code: 'email_pending_elsewhere',
        message: 'This email has a pending invite for another account',
      }
    }
    if (pending.usedAt) {
      return {
        ok: false,
        status: 409,
        code: 'duplicate_user',
        message: 'This person is already a user on your account',
      }
    }
  }

  const fn = firstName.trim()
  const ln = lastName.trim()
  if (pending && !pending.usedAt && pending.accountId === accountId) {
    await prisma.pendingProvision.update({
      where: { email },
      data: {
        role,
        firstName: fn || null,
        lastName: ln || null,
      },
    })
    const otpResult = await sendEmailOtpCode({
      email,
      shouldCreateUser: true,
    })
    if (!otpResult.ok) {
      return {
        ok: false,
        status: otpResult.status,
        code: otpResult.code,
        message: otpResult.message,
      }
    }
    return { ok: true, kind: 'invite_resent' }
  }

  await prisma.pendingProvision.create({
    data: {
      email,
      accountId,
      role,
      firstName: fn || null,
      lastName: ln || null,
    },
  })

  const otpResult = await sendEmailOtpCode({
    email,
    shouldCreateUser: true,
  })
  if (!otpResult.ok) {
    await prisma.pendingProvision.deleteMany({ where: { email, accountId, usedAt: null } }).catch(() => {})
    const authUser = await findAuthUserByEmail(email)
    if (authUser && otpResult.code === 'otp_send_failed') {
      return {
        ok: false,
        status: 409,
        code: 'email_exists_auth',
        message:
          'This email already has a login. If they should join this account, contact support.',
      }
    }
    return {
      ok: false,
      status: otpResult.status,
      code: otpResult.code,
      message: otpResult.message,
    }
  }

  return { ok: true, kind: 'invited' }
}

export async function resendAccountInvite(params: {
  accountId: string
  email: string
}): Promise<InviteAccountUserResult> {
  const email = normalizeInviteEmail(params.email)
  const row = await prisma.pendingProvision.findUnique({
    where: { email },
    select: { accountId: true, usedAt: true, firstName: true, lastName: true },
  })
  if (!row || row.accountId !== params.accountId || row.usedAt) {
    return {
      ok: false,
      status: 404,
      code: 'invite_not_found',
      message: 'No pending invite found for this email',
    }
  }
  const otpResult = await sendEmailOtpCode({
    email,
    shouldCreateUser: true,
  })
  if (!otpResult.ok) {
    return {
      ok: false,
      status: otpResult.status,
      code: otpResult.code,
      message: otpResult.message,
    }
  }
  return { ok: true, kind: 'invite_resent' }
}

export async function revokeAccountInvite(params: { accountId: string; email: string }) {
  const email = normalizeInviteEmail(params.email)
  const row = await prisma.pendingProvision.findUnique({
    where: { email },
    select: { accountId: true, usedAt: true },
  })
  if (!row || row.accountId !== params.accountId || row.usedAt) {
    return { ok: false as const, status: 404, message: 'No pending invite to revoke' }
  }
  await prisma.pendingProvision.delete({ where: { email } })
  return { ok: true as const }
}

export async function setAccountUserActive(params: {
  accountId: string
  actorUserId: string
  targetUserId: string
  isActive: boolean
  db?: Prisma.TransactionClient
}): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  if (params.targetUserId === params.actorUserId) {
    return { ok: false, status: 400, code: 'cannot_self', message: 'You cannot change your own access here' }
  }

  const db = params.db ?? prisma
  const target = await db.user.findFirst({
    where: { id: params.targetUserId, accountMemberships: { some: { accountId: params.accountId } } },
    select: { id: true, role: true, isActive: true },
  })
  if (!target) {
    return { ok: false, status: 404, code: 'not_found', message: 'User not found' }
  }

  if (params.isActive === false && target.role === 'ADMIN') {
    const otherAdmins = await db.user.count({
      where: {
        accountMemberships: { some: { accountId: params.accountId } },
        role: 'ADMIN',
        isActive: true,
        id: { not: params.targetUserId },
      },
    })
    if (otherAdmins === 0) {
      return {
        ok: false,
        status: 400,
        code: 'last_admin',
        message: 'Cannot remove the last active admin on the account',
      }
    }
  }

  await db.user.update({
    where: { id: params.targetUserId },
    data: { isActive: params.isActive },
  })
  return { ok: true }
}

/** Shared account-role mutation for both account and platform management. */
export async function setAccountUserRole(params: {
  accountId: string
  actorUserId: string
  targetUserId: string
  role: UserRole
  db?: Prisma.TransactionClient
}): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  if (!isAllowedInviteRole(params.role)) {
    return { ok: false, status: 400, code: 'invalid_role', message: 'Invalid role for account users' }
  }
  if (params.targetUserId === params.actorUserId) {
    return { ok: false, status: 400, code: 'cannot_self', message: 'You cannot change your own role here' }
  }

  const db = params.db ?? prisma
  const target = await db.user.findFirst({
    where: { id: params.targetUserId, accountMemberships: { some: { accountId: params.accountId } } },
    select: { id: true, role: true, isActive: true },
  })
  if (!target) {
    return { ok: false, status: 404, code: 'not_found', message: 'User not found' }
  }
  if (target.role === params.role) return { ok: true }

  const membershipCount = await db.accountUserMembership.count({
    where: { userId: params.targetUserId },
  })
  if (membershipCount > 1) {
    return {
      ok: false,
      status: 409,
      code: 'multi_account_role_change_forbidden',
      message: 'Remove the user’s other account access before changing their global role',
    }
  }

  if (target.role === 'ADMIN' && params.role !== 'ADMIN' && target.isActive) {
    const otherAdmins = await db.user.count({
      where: {
        accountMemberships: { some: { accountId: params.accountId } },
        role: 'ADMIN',
        isActive: true,
        id: { not: params.targetUserId },
      },
    })
    if (otherAdmins === 0) {
      return {
        ok: false,
        status: 400,
        code: 'last_admin',
        message: 'Cannot demote the last active admin on the account',
      }
    }
  }

  await db.user.update({ where: { id: params.targetUserId }, data: { role: params.role } })
  return { ok: true }
}

export async function generateAccountUserOtp(params: {
  accountId: string
  targetUserId: string
}): Promise<
  | { ok: true; otp: string; email: string }
  | { ok: false; status: number; code: string; message: string }
> {
  const target = await prisma.user.findFirst({
    where: { id: params.targetUserId, accountMemberships: { some: { accountId: params.accountId } } },
    select: { email: true, isActive: true },
  })
  if (!target) return { ok: false, status: 404, code: 'not_found', message: 'User not found' }
  if (!target.isActive) {
    return { ok: false, status: 400, code: 'user_inactive', message: 'Reactivate this user before generating a login code' }
  }

  const result = await generateLoginOtpForEmail(target.email)
  if (!result.ok) return result
  return { ok: true, otp: result.otp, email: target.email }
}

export async function removeRetailAccountUserAccess(params: {
  accountId: string
  actorUserId: string
  targetUserId: string
}): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  if (params.targetUserId === params.actorUserId) {
    return { ok: false, status: 400, code: 'cannot_self', message: 'You cannot remove your own access here' }
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: params.targetUserId },
      select: { id: true, role: true, isActive: true, accountId: true },
    })
    const membership = await tx.accountUserMembership.findUnique({
      where: { userId_accountId: { userId: params.targetUserId, accountId: params.accountId } },
      select: { id: true },
    })
    if (!target || !membership) {
      return { ok: false as const, status: 404, code: 'not_found', message: 'User not found' }
    }

    if (target.role === 'ADMIN' && target.isActive) {
      const otherAdmins = await tx.user.count({
        where: {
          role: 'ADMIN',
          isActive: true,
          id: { not: params.targetUserId },
          accountMemberships: { some: { accountId: params.accountId } },
        },
      })
      if (otherAdmins === 0) {
        return {
          ok: false as const,
          status: 400,
          code: 'last_admin',
          message: 'Cannot remove the last active admin on the account',
        }
      }
    }

    const replacement = target.accountId === params.accountId
      ? await tx.accountUserMembership.findFirst({
          where: { userId: params.targetUserId, accountId: { not: params.accountId } },
          select: { accountId: true },
          orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }],
        })
      : null

    await tx.accountUserMembership.delete({ where: { id: membership.id } })
    if (target.accountId === params.accountId) {
      await tx.user.update({
        where: { id: params.targetUserId },
        data: { accountId: replacement?.accountId ?? null },
      })
    }
    return { ok: true as const }
  })
}
