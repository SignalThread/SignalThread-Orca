import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/require-super-admin', () => ({ requireSuperAdminForApi: vi.fn() }))
vi.mock('@/lib/platform-users', () => ({ generatePlatformUserOtp: vi.fn() }))

import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import { generatePlatformUserOtp } from '@/lib/platform-users'
import { POST } from './route'

describe('POST /api/admin/users/:userId/otp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is platform-admin-only', async () => {
    ;(requireSuperAdminForApi as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    const response = await POST(new Request('http://localhost') as never, { params: { userId: 'user-1' } })
    expect(response.status).toBe(403)
    expect(generatePlatformUserOtp).not.toHaveBeenCalled()
  })

  it('returns the email OTP without an action-link field', async () => {
    ;(requireSuperAdminForApi as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, userId: 'platform-1' })
    ;(generatePlatformUserOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, otp: '482913', email: 'person@example.test' })
    const response = await POST(new Request('http://localhost') as never, { params: { userId: 'user-1' } })
    const body = await response.json()
    expect(body).toEqual({ success: true, data: { otp: '482913', email: 'person@example.test' } })
    expect(JSON.stringify(body)).not.toContain('action_link')
  })
})
