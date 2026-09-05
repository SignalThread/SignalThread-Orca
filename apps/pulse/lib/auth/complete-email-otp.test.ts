import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyOtpMock = vi.fn()
const fetchMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      verifyOtp: verifyOtpMock,
    },
  }),
}))

describe('completeEmailOtpSignIn', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('verifies the OTP and returns the link-user redirect', async () => {
    verifyOtpMock.mockResolvedValue({ error: null })
    fetchMock.mockResolvedValue({
      json: async () => ({ success: true, redirectUrl: '/app?account=acme-coffee' }),
    })

    const { completeEmailOtpSignIn } = await import('@/lib/auth/complete-email-otp')
    const result = await completeEmailOtpSignIn('Owner@Example.com', '12-34 56')

    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: 'owner@example.com',
      token: '123456',
      type: 'email',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/link-user', { method: 'POST' })
    expect(result).toEqual({
      success: true,
      redirectUrl: '/app?account=acme-coffee',
    })
  })

  it('returns the Supabase error when verification fails', async () => {
    verifyOtpMock.mockResolvedValue({
      error: { message: 'Invalid or expired verification code' },
    })

    const { completeEmailOtpSignIn } = await import('@/lib/auth/complete-email-otp')
    const result = await completeEmailOtpSignIn('owner@example.com', '123456')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      error: 'Invalid or expired verification code',
    })
  })
})
