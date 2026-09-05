import { beforeEach, describe, expect, it, vi } from 'vitest'

const resendAccountInviteMock = vi.fn()
const prismaMock = {
  testSignupToken: {
    findUnique: vi.fn(),
  },
  pendingProvision: {
    findUnique: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/account-users', () => ({
  resendAccountInvite: resendAccountInviteMock,
}))

describe('POST /api/signup/test/resend', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('resends the invite when the token is valid and the pending provision is still unused', async () => {
    prismaMock.testSignupToken.findUnique.mockResolvedValue({
      id: 'tok_123',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    prismaMock.pendingProvision.findUnique.mockResolvedValue({
      accountId: 'acct_123',
      usedAt: null,
    })
    resendAccountInviteMock.mockResolvedValue({ ok: true, kind: 'invite_resent' })

    const { POST } = await import('@/app/api/signup/test/resend/route')
    const response = await POST({
      json: async () => ({
        token: 'abc123',
        email: 'owner@example.com',
      }),
    } as never)

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(resendAccountInviteMock).toHaveBeenCalledWith({
      accountId: 'acct_123',
      email: 'owner@example.com',
    })
    expect(json.success).toBe(true)
  })

  it('returns 404 when there is no pending invite for that email anymore', async () => {
    prismaMock.testSignupToken.findUnique.mockResolvedValue({
      id: 'tok_123',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    prismaMock.pendingProvision.findUnique.mockResolvedValue(null)

    const { POST } = await import('@/app/api/signup/test/resend/route')
    const response = await POST({
      json: async () => ({
        token: 'abc123',
        email: 'owner@example.com',
      }),
    } as never)

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.error).toContain('No pending invite')
  })
})
