import { beforeEach, describe, expect, it, vi } from 'vitest'

const provisionRetailMock = vi.fn()
const prismaMock = {
  testSignupToken: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/provisioning', () => ({
  provisionRetail: provisionRetailMock,
}))

describe('/api/signup/test', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('validates an unused token successfully', async () => {
    prismaMock.testSignupToken.findUnique.mockResolvedValue({
      id: 'tok_123',
      usedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    })

    const { GET } = await import('@/app/api/signup/test/route')
    const response = await GET({
      nextUrl: new URL('http://localhost/api/signup/test?token=abc123'),
    } as never)

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('rejects an expired token', async () => {
    prismaMock.testSignupToken.findUnique.mockResolvedValue({
      id: 'tok_123',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    })

    const { GET } = await import('@/app/api/signup/test/route')
    const response = await GET({
      nextUrl: new URL('http://localhost/api/signup/test?token=expired'),
    } as never)

    const json = await response.json()
    expect(response.status).toBe(410)
    expect(json.error).toContain('expired')
  })

  it('provisions an account and marks the token used on first submit', async () => {
    prismaMock.testSignupToken.findUnique.mockResolvedValue({
      id: 'tok_123',
      usedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    provisionRetailMock.mockResolvedValue({
      success: true,
      accountId: 'acct_123',
      message: 'Provisioned',
    })
    prismaMock.testSignupToken.update.mockResolvedValue({
      id: 'tok_123',
      usedAt: new Date(),
    })

    const { POST } = await import('@/app/api/signup/test/route')
    const response = await POST({
      json: async () => ({
        token: 'abc123',
        email: 'owner@example.com',
        businessName: 'Acme Coffee Co.',
        locationName: 'Downtown SF',
        plan: 'growth',
      }),
    } as never)

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(provisionRetailMock).toHaveBeenCalledWith({
      accountName: 'Acme Coffee Co.',
      accountSlug: 'acme-coffee-co',
      accountEmail: 'owner@example.com',
      ownerEmail: 'owner@example.com',
      locationName: 'Downtown SF',
      plan: 'growth',
    })
    expect(prismaMock.testSignupToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_123' },
      data: { usedAt: expect.any(Date) },
    })
    expect(json.redirectUrl).toBe('/signup/test/success?email=owner%40example.com&token=abc123')
  })

  it('rejects a token that has already been used', async () => {
    prismaMock.testSignupToken.findUnique.mockResolvedValue({
      id: 'tok_123',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })

    const { POST } = await import('@/app/api/signup/test/route')
    const response = await POST({
      json: async () => ({
        token: 'used-token',
        email: 'owner@example.com',
        businessName: 'Acme Coffee Co.',
        locationName: 'Downtown SF',
        plan: 'starter',
      }),
    } as never)

    const json = await response.json()
    expect(response.status).toBe(410)
    expect(provisionRetailMock).not.toHaveBeenCalled()
    expect(json.error).toContain('already been used')
  })
})
