import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listUsersMock, resendAccountInviteMock, setAccountUserActiveMock, setAccountUserRoleMock, generateLoginOtpForEmailMock } = vi.hoisted(() => ({
  listUsersMock: vi.fn(),
  resendAccountInviteMock: vi.fn(),
  setAccountUserActiveMock: vi.fn(),
  setAccountUserRoleMock: vi.fn(),
  generateLoginOtpForEmailMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    user: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    pendingProvision: { findMany: vi.fn(), findUnique: vi.fn() },
    platformUserActionAudit: { create: vi.fn() },
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { listUsers: listUsersMock } } }),
}))
vi.mock('@/lib/account-users', () => ({
  generateLoginOtpForEmail: generateLoginOtpForEmailMock,
  resendAccountInvite: resendAccountInviteMock,
  setAccountUserActive: setAccountUserActiveMock,
  setAccountUserRole: setAccountUserRoleMock,
}))

import { prisma } from '@/lib/prisma'
import { CUSTOMER_ACCOUNT_ADMIN_ROLES, generatePlatformUserOtp, listPlatformUsers, resendPlatformInvite, updatePlatformAccountUser } from './platform-users'

describe('platform user service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null })
    ;(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.pendingProvision.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.platformUserActionAudit.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'audit-1' })
    ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => callback(prisma))
  })

  it('uses User ADMIN membership as the single customer-account admin definition', () => {
    expect(CUSTOMER_ACCOUNT_ADMIN_ROLES).toEqual(['ADMIN'])
  })

  it('loads users across accounts and derives last login from Supabase Auth', async () => {
    const account = { id: 'account-1', name: 'Club Ichi', slug: 'club-ichi' }
    ;(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'user-1', email: 'one@ichi.test', firstName: 'One', lastName: 'Admin', role: 'ADMIN', accountId: account.id, account, accountMemberships: [{ accountId: account.id }], isActive: true, createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01') },
      { id: 'user-2', email: 'two@ichi.test', firstName: 'Two', lastName: 'Admin', role: 'ADMIN', accountId: account.id, account, accountMemberships: [{ accountId: account.id }], isActive: true, createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01') },
    ])
    listUsersMock.mockResolvedValue({ data: { users: [
      { id: 'user-1', email: 'one@ichi.test', created_at: '2026-08-01T00:00:00Z', last_sign_in_at: '2026-08-14T12:00:00Z', email_confirmed_at: '2026-08-01T00:00:00Z' },
      { id: 'user-2', email: 'two@ichi.test', created_at: '2026-08-01T00:00:00Z', last_sign_in_at: null, email_confirmed_at: '2026-08-01T00:00:00Z' },
    ] }, error: null })

    const rows = await listPlatformUsers()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ account, status: 'ACTIVE', lastLoginAt: '2026-08-14T12:00:00Z' })
    expect(rows[1]).toMatchObject({ account, status: 'NEVER_LOGGED_IN', lastLoginAt: null })
    expect(rows[0].hasDisplayName).toBe(true)
  })

  it('marks an email fallback so the table can avoid rendering the same value twice', async () => {
    ;(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'user-1', email: 'only-email@ichi.test', firstName: null, lastName: null, role: 'ADMIN', accountId: 'account-1', account: { id: 'account-1', name: 'Club Ichi', slug: 'club-ichi' }, accountMemberships: [{ accountId: 'account-1' }], isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ])
    const [row] = await listPlatformUsers()
    expect(row).toMatchObject({ name: 'only-email@ichi.test', hasDisplayName: false })
  })

  it('does not show an accepted invite as a duplicate pending row', async () => {
    const account = { id: 'account-1', name: 'Club Ichi', slug: 'club-ichi' }
    ;(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'user-1', email: 'accepted@ichi.test', firstName: null, lastName: null, role: 'ADMIN', accountId: account.id, account, accountMemberships: [{ accountId: account.id }], isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ])
    ;(prisma.pendingProvision.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'invite-1', email: 'accepted@ichi.test', firstName: null, lastName: null, role: 'ADMIN', accountId: account.id, account, createdAt: new Date(), usedAt: new Date() },
    ])
    expect(await listPlatformUsers()).toHaveLength(1)
  })

  it('returns only the email OTP and writes audit metadata without the credential or link', async () => {
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', email: 'admin@ichi.test', accountId: 'account-1', isActive: true })
    generateLoginOtpForEmailMock.mockResolvedValue({ ok: true, otp: '482913' })

    const result = await generatePlatformUserOtp({ actorUserId: 'platform-1', targetUserId: 'user-1' })
    expect(result).toEqual({ ok: true, otp: '482913', email: 'admin@ichi.test' })
    expect(prisma.platformUserActionAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'OTP_GENERATED', metadata: { delivery: 'display_once', credentialStored: false },
    }) })
    expect(JSON.stringify((prisma.platformUserActionAudit.create as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('482913')
    expect(generateLoginOtpForEmailMock).toHaveBeenCalledWith('admin@ichi.test')
  })

  it('resends an existing canonical invite without creating a membership or provision', async () => {
    ;(prisma.pendingProvision.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'invite-1', email: 'new@ichi.test', accountId: 'account-1', usedAt: null, role: 'MANAGER' })
    resendAccountInviteMock.mockResolvedValue({ ok: true, kind: 'invite_resent' })
    await expect(resendPlatformInvite({ actorUserId: 'platform-1', inviteId: 'invite-1' })).resolves.toEqual({ ok: true })
    expect(resendAccountInviteMock).toHaveBeenCalledWith({ accountId: 'account-1', email: 'new@ichi.test' })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('rejects customer-role mutations for platform users and enforces account role scope', async () => {
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'platform-2', email: 'staff@signalthread.test', accountId: null, role: 'SUPER_ADMIN', isActive: true })
    await expect(updatePlatformAccountUser({ actorUserId: 'platform-1', targetUserId: 'platform-2', role: 'ADMIN' })).resolves.toMatchObject({ ok: false, status: 404 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('changes a customer role transactionally with the support audit record', async () => {
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', email: 'person@ichi.test', accountId: 'account-1', role: 'MANAGER', isActive: true })
    setAccountUserRoleMock.mockResolvedValue({ ok: true })
    await expect(updatePlatformAccountUser({ actorUserId: 'platform-1', targetUserId: 'user-1', role: 'VIEWER' })).resolves.toEqual({ ok: true })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(setAccountUserRoleMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account-1', targetUserId: 'user-1', role: 'VIEWER', db: prisma }))
    expect(prisma.platformUserActionAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'ROLE_CHANGED', metadata: { fromRole: 'MANAGER', toRole: 'VIEWER' } }) })
  })

  it('deactivates account access through the canonical access mutation and audits it atomically', async () => {
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', email: 'person@ichi.test', accountId: 'account-1', role: 'MANAGER', isActive: true })
    setAccountUserActiveMock.mockResolvedValue({ ok: true })
    await expect(updatePlatformAccountUser({ actorUserId: 'platform-1', targetUserId: 'user-1', isActive: false })).resolves.toEqual({ ok: true })
    expect(setAccountUserActiveMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account-1', targetUserId: 'user-1', isActive: false, db: prisma }))
    expect(prisma.platformUserActionAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'USER_DEACTIVATED', metadata: { active: false } }) })
  })
})
