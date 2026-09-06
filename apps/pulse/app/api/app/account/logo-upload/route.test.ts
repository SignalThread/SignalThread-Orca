import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { formDataRequest } from '@/tests/helpers/route'

const { requireAccountMembershipMock, sendMock } = vi.hoisted(() => ({
  requireAccountMembershipMock: vi.fn(),
  sendMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-account-membership', () => ({ requireAccountMembership: requireAccountMembershipMock }))
vi.mock('@/lib/objectStorage', () => ({
  getStorageConfig: () => ({ bucket: 'uploads', provider: 'r2' }),
  getS3Client: () => ({ send: sendMock }),
}))

function upload() {
  const formData = new FormData()
  formData.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }))
  formData.append('account', 'retail-co')
  return formDataRequest('http://localhost/api/app/account/logo-upload', formData)
}

describe('POST /api/app/account/logo-upload', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sendMock.mockResolvedValue({})
  })

  it('returns the membership guard response and uploads nothing for anonymous or cross-tenant callers', async () => {
    requireAccountMembershipMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })
    const { POST } = await import('./route')
    const response = await POST(upload())
    expect(response.status).toBe(403)
    expect(requireAccountMembershipMock).toHaveBeenCalledWith('retail-co', { allowSuperAdmin: true })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('stores the logo under the authorized account only', async () => {
    requireAccountMembershipMock.mockResolvedValue({ ok: true, userId: 'user_1', account: { id: 'acct_authorized', slug: 'retail-co' } })
    const { POST } = await import('./route')
    const response = await POST(upload())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.key).toMatch(/^branding\/acct_authorized\/logo-\d+\.png$/)
    expect(sendMock.mock.calls[0][0].input).toMatchObject({ Bucket: 'uploads', Key: json.key, ContentType: 'image/png' })
  })
})
