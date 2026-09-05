import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSuperAdminForApiMock = vi.fn()
const prismaMock = {
  testSignupToken: {
    create: vi.fn(),
  },
}

vi.mock('@/lib/auth/require-super-admin', () => ({
  requireSuperAdminForApi: requireSuperAdminForApiMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('POST /api/admin/provision-test-link', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('creates a hashed single-use signup token and returns a test signup URL', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({ ok: true, userId: 'user_super' })
    prismaMock.testSignupToken.create.mockResolvedValue({ id: 'tok_123' })

    const { POST } = await import('@/app/api/admin/provision-test-link/route')
    const response = await POST({
      url: 'http://localhost/api/admin/provision-test-link',
    } as never)

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(prismaMock.testSignupToken.create).toHaveBeenCalledTimes(1)

    const createArg = prismaMock.testSignupToken.create.mock.calls[0][0]
    expect(createArg.data.createdByUserId).toBe('user_super')
    expect(createArg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(createArg.data.expiresAt).toBeInstanceOf(Date)
    expect(json.success).toBe(true)
    expect(json.url).toMatch(/^http:\/\/localhost\/signup\/test\?token=/)
  })
})
