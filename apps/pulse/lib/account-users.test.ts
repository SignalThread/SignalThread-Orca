import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithOtpMock = vi.fn()
const listAuthUsersMock = vi.fn()
const generateLinkMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOtp: signInWithOtpMock,
    },
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: (() => {
    const client = {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    pendingProvision: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
      accountUserMembership: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), delete: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(),
    }
    client.$transaction.mockImplementation(async (callback: (tx: typeof client) => unknown) => callback(client))
    return client
  })(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: listAuthUsersMock,
        generateLink: generateLinkMock,
      },
    },
  })),
}))

import { prisma } from '@/lib/prisma'
import {
  isAllowedInviteRole,
  listRetailAccountUsersAndInvites,
  normalizeInviteEmail,
  ACCOUNT_INVITE_ROLES,
  removeRetailAccountUserAccess,
  generateAccountUserOtp,
  generateLoginOtpForEmail,
  inviteOrResendAccountUser,
  sendEmailOtpCode,
  setAccountUserRole,
} from './account-users'

describe('account invite helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.accountUserMembership.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)
    listAuthUsersMock.mockResolvedValue({ data: { users: [] }, error: null })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('normalizes email', () => {
    expect(normalizeInviteEmail('  Test@EXAMPLE.com ')).toBe('test@example.com')
  })

  it('allows only account-scoped roles for invites', () => {
    expect(ACCOUNT_INVITE_ROLES).toEqual(['ADMIN', 'MANAGER', 'VIEWER'])
    expect(isAllowedInviteRole('ADMIN')).toBe(true)
    expect(isAllowedInviteRole('VIEWER')).toBe(true)
    expect(isAllowedInviteRole('SUPER_ADMIN')).toBe(false)
  })

  it('sends a verification code via Supabase OTP with normalized email', async () => {
    signInWithOtpMock.mockResolvedValue({ error: null })

    const result = await sendEmailOtpCode({
      email: '  Owner@Example.com ',
      shouldCreateUser: true,
    })

    expect(result).toEqual({ ok: true })
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'owner@example.com',
      options: {
        shouldCreateUser: true,
      },
    })
  })

  it('returns a stable error when Supabase OTP delivery fails', async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { message: 'Rate limit exceeded' },
    })

    const result = await sendEmailOtpCode({
      email: 'owner@example.com',
      shouldCreateUser: true,
    })

    expect(result).toEqual({
      ok: false,
      status: 400,
      code: 'otp_send_failed',
      message: 'Rate limit exceeded',
    })
  })

  it('returns only a Supabase email OTP and never an action link', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: { email_otp: '482913', action_link: 'https://secret.example' } },
      error: null,
    })

    const result = await generateLoginOtpForEmail(' Owner@Example.com ')
    expect(result).toEqual({ ok: true, otp: '482913' })
    expect(JSON.stringify(result)).not.toContain('secret.example')
    expect(generateLinkMock).toHaveBeenCalledWith({ type: 'magiclink', email: 'owner@example.com' })
  })
})

describe('retail account user access helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists only users with a current membership in the account', async () => {
    ;(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.pendingProvision.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await listRetailAccountUsersAndInvites('acct_123')

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        accountMemberships: { some: { accountId: 'acct_123' } },
      },
      select: expect.any(Object),
      orderBy: { email: 'asc' },
    })
  })

  it('uses Supabase last login and suppresses an accepted invite from pending invites', async () => {
    ;(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'user_accepted', email: 'accepted@example.com', firstName: 'Accepted', lastName: 'User',
      role: 'MANAGER', isActive: true, createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'),
    }])
    ;(prisma.pendingProvision.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'invite_accepted', email: 'accepted@example.com', firstName: 'Accepted', lastName: 'User', role: 'MANAGER',
      createdAt: new Date('2026-07-31T12:00:00Z'), usedAt: new Date('2026-08-01T12:00:00Z'),
    }])
    listAuthUsersMock.mockResolvedValue({ data: { users: [{
      id: 'user_accepted', email: 'accepted@example.com', email_confirmed_at: '2026-08-01T12:00:00Z',
      last_sign_in_at: '2026-08-14T12:00:00Z', created_at: '2026-08-01T12:00:00Z',
    }] }, error: null })

    const result = await listRetailAccountUsersAndInvites('acct_123')
    expect(result.pendingInvites).toEqual([])
    expect(result.users[0]).toMatchObject({
      status: 'ACTIVE', inviteStatus: 'ACCEPTED', invitedAt: '2026-07-31T12:00:00.000Z',
      joinedAt: '2026-08-01T12:00:00.000Z', lastLoginAt: '2026-08-14T12:00:00Z',
    })
  })

  it('reuses an existing ADMIN identity when adding a second account', async () => {
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'admin_existing', accountId: 'acct_1', role: 'ADMIN', isActive: true,
    })
    ;(prisma.accountUserMembership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await expect(inviteOrResendAccountUser({
      accountId: 'acct_2', email: 'admin@example.com', firstName: 'Jane', lastName: 'Smith', role: 'ADMIN',
    })).resolves.toEqual({ ok: true, kind: 'access_added' })

    expect(prisma.accountUserMembership.upsert).toHaveBeenCalledWith({
      where: { userId_accountId: { userId: 'admin_existing', accountId: 'acct_2' } },
      create: { userId: 'admin_existing', accountId: 'acct_2' },
      update: {},
    })
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.pendingProvision.create).not.toHaveBeenCalled()
  })

  it('removing a retail user deletes only this membership and preserves global activation', async () => {
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user_removed',
      role: 'MANAGER',
      isActive: true,
      accountId: 'acct_123',
    })
    ;(prisma.accountUserMembership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'membership_1' })
    ;(prisma.accountUserMembership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ accountId: 'acct_other' })

    const result = await removeRetailAccountUserAccess({
      accountId: 'acct_123',
      actorUserId: 'user_admin',
      targetUserId: 'user_removed',
    })

    expect(result).toEqual({ ok: true })
    expect(prisma.accountUserMembership.delete).toHaveBeenCalledWith({
      where: { id: 'membership_1' },
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_removed' },
      data: { accountId: 'acct_other' },
    })
  })

  it("does not remove another retail account's user", async () => {
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.accountUserMembership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const result = await removeRetailAccountUserAccess({
      accountId: 'acct_123',
      actorUserId: 'user_admin',
      targetUserId: 'user_other_account',
    })

    expect(result).toMatchObject({ ok: false, status: 404, code: 'not_found' })
    expect(prisma.accountUserMembership.delete).not.toHaveBeenCalled()
  })

  it('enforces account scope and the last-admin guard for role changes', async () => {
    ;(prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user_admin', role: 'ADMIN', isActive: true })
    ;(prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

    await expect(setAccountUserRole({
      accountId: 'acct_123', actorUserId: 'user_owner', targetUserId: 'user_admin', role: 'MANAGER',
    })).resolves.toMatchObject({ ok: false, code: 'last_admin' })
    expect(prisma.user.update).not.toHaveBeenCalled()

    await expect(setAccountUserRole({
      accountId: 'acct_123', actorUserId: 'user_owner', targetUserId: 'user_admin', role: 'SUPER_ADMIN',
    })).resolves.toMatchObject({ ok: false, code: 'invalid_role' })

    await expect(setAccountUserRole({
      accountId: 'acct_123', actorUserId: 'user_owner', targetUserId: 'user_owner', role: 'VIEWER',
    })).resolves.toMatchObject({ ok: false, code: 'cannot_self' })
  })

  it('does not let an account admin globally change the role of a multi-account ADMIN', async () => {
    ;(prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'admin_multi', role: 'ADMIN', isActive: true })
    ;(prisma.accountUserMembership.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)

    await expect(setAccountUserRole({
      accountId: 'acct_123', actorUserId: 'user_owner', targetUserId: 'admin_multi', role: 'VIEWER',
    })).resolves.toMatchObject({ ok: false, code: 'multi_account_role_change_forbidden' })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('generates an OTP only after finding an active user in the current account', async () => {
    ;(prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ email: 'member@example.com', isActive: true })
    generateLinkMock.mockResolvedValue({ data: { properties: { email_otp: '734821' } }, error: null })

    await expect(generateAccountUserOtp({ accountId: 'acct_123', targetUserId: 'member_123' })).resolves.toEqual({
      ok: true, email: 'member@example.com', otp: '734821',
    })
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'member_123', accountMemberships: { some: { accountId: 'acct_123' } } },
      select: { email: true, isActive: true },
    })
  })
})
