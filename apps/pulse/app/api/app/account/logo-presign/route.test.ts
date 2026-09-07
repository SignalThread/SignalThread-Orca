import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { jsonRequest } from '@/tests/helpers/route'

const { requireAccountMembershipMock, presignPutMock } = vi.hoisted(() => ({
  requireAccountMembershipMock: vi.fn(),
  presignPutMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-account-membership', () => ({ requireAccountMembership: requireAccountMembershipMock }))
vi.mock('@/lib/objectStorage', () => ({
  getStorageConfig: () => ({ bucket: 'uploads', provider: 'r2' }),
  presignPut: presignPutMock,
}))

const body = { account: 'retail-co', fileName: 'Logo.PNG', fileSize: 1024, mimeType: 'image/png' }

describe('POST /api/app/account/logo-presign', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    presignPutMock.mockResolvedValue('https://signed.example/put')
  })

  it('returns the membership guard response and mints nothing for anonymous or cross-tenant callers', async () => {
    requireAccountMembershipMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    })
    const { POST } = await import('./route')
    const response = await POST(jsonRequest({ body }))
    expect(response.status).toBe(401)
    expect(requireAccountMembershipMock).toHaveBeenCalledWith('retail-co', { allowSuperAdmin: true })
    expect(presignPutMock).not.toHaveBeenCalled()
  })

  it('mints a branding key for the authorized account, never for a caller-chosen account id', async () => {
    requireAccountMembershipMock.mockResolvedValue({ ok: true, userId: 'user_1', account: { id: 'acct_authorized', slug: 'retail-co' } })
    const { POST } = await import('./route')
    const response = await POST(jsonRequest({ body }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.key).toMatch(/^branding\/acct_authorized\/logo-\d+\.png$/)
    expect(json.logoUrl).toBe(`/api/app/logo?key=${encodeURIComponent(json.key)}`)
    expect(presignPutMock).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'uploads', key: json.key, contentType: 'image/png' }))
  })
})
