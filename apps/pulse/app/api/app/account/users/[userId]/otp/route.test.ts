import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireManagerMock, generateOtpMock } = vi.hoisted(() => ({
  requireManagerMock: vi.fn(),
  generateOtpMock: vi.fn(),
}))

vi.mock('@/lib/account-users', () => ({
  requireRetailAccountUserManager: requireManagerMock,
  generateAccountUserOtp: generateOtpMock,
}))

import { POST } from './route'

describe('POST /api/app/account/users/[userId]/otp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the canonical OTP helper only after account-scoped authorization', async () => {
    requireManagerMock.mockResolvedValue({ ok: true, account: { id: 'acct_123' }, userId: 'admin_123' })
    generateOtpMock.mockResolvedValue({ ok: true, email: 'member@example.com', otp: '482913' })

    const response = await POST(
      { nextUrl: new URL('http://localhost/api/app/account/users/member_123/otp?account=retail-co') } as never,
      { params: { userId: 'member_123' } },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { email: 'member@example.com', otp: '482913' } })
    expect(generateOtpMock).toHaveBeenCalledWith({ accountId: 'acct_123', targetUserId: 'member_123' })
  })

  it('does not invoke OTP generation when account authorization is rejected', async () => {
    requireManagerMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    const response = await POST(
      { nextUrl: new URL('http://localhost/api/app/account/users/member_123/otp?account=wrong-account') } as never,
      { params: { userId: 'member_123' } },
    )
    expect(response.status).toBe(403)
    expect(generateOtpMock).not.toHaveBeenCalled()
  })
})
