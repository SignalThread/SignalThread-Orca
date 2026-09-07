import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSuperAdminForApiMock = vi.fn()
const deleteAccountAsSuperAdminMock = vi.fn()

const prismaMock = {
  account: {
    update: vi.fn(),
  },
}

vi.mock('@/lib/auth/require-super-admin', () => ({
  requireSuperAdminForApi: requireSuperAdminForApiMock,
}))

vi.mock('@/lib/account-deletion', () => ({
  deleteAccountAsSuperAdmin: deleteAccountAsSuperAdminMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('PATCH /api/admin/accounts/[accountId]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('updates account type successfully for a super admin', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({ ok: true, userId: 'user_super' })
    prismaMock.account.update.mockResolvedValue({
      id: 'acct_123',
      accountType: 'RETAIL',
      tier: 'starter',
    })

    const { PATCH } = await import('@/app/api/admin/accounts/[accountId]/route')
    const response = await PATCH(
      {
        json: async () => ({ accountType: 'RETAIL' }),
      } as never,
      { params: { accountId: 'acct_123' } }
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: 'acct_123' },
      data: { accountType: 'RETAIL' },
      select: {
        id: true,
        accountType: true,
        tier: true,
      },
    })
    expect(json.account.accountType).toBe('RETAIL')
  })

  it('updates tier successfully for a super admin', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({ ok: true, userId: 'user_super' })
    prismaMock.account.update.mockResolvedValue({
      id: 'acct_123',
      accountType: 'EVENTS',
      tier: 'growth',
    })

    const { PATCH } = await import('@/app/api/admin/accounts/[accountId]/route')
    const response = await PATCH(
      {
        json: async () => ({ tier: 'growth' }),
      } as never,
      { params: { accountId: 'acct_123' } }
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: 'acct_123' },
      data: { tier: 'growth' },
      select: {
        id: true,
        accountType: true,
        tier: true,
      },
    })
    expect(json.account.tier).toBe('growth')
  })

  it('rejects invalid enum values', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({ ok: true, userId: 'user_super' })

    const { PATCH } = await import('@/app/api/admin/accounts/[accountId]/route')
    const response = await PATCH(
      {
        json: async () => ({ accountType: 'INVALID_TYPE' }),
      } as never,
      { params: { accountId: 'acct_123' } }
    )

    const json = await response.json()
    expect(response.status).toBe(400)
    expect(prismaMock.account.update).not.toHaveBeenCalled()
    expect(json.message).toBe('Invalid account type')
  })

  it('rejects non-super-admin callers', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const { PATCH } = await import('@/app/api/admin/accounts/[accountId]/route')
    const response = await PATCH(
      {
        json: async () => ({ tier: 'starter' }),
      } as never,
      { params: { accountId: 'acct_123' } }
    )

    expect(response.status).toBe(403)
    expect(prismaMock.account.update).not.toHaveBeenCalled()
  })
})
