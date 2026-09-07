import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const requireAccountMembershipMock = vi.fn()
const prismaMock = {
  location: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
}

vi.mock('@/lib/auth/require-account-membership', () => ({
  requireAccountMembership: requireAccountMembershipMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

function membership(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    userId: 'user_123',
    account: {
      id: 'acct_123',
      slug: 'retail-co',
      name: 'Retail Co',
      email: 'owner@retail.co',
      tier: 'starter',
      trialEndsAt: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      billingJson: null,
      ...overrides,
    },
  }
}

describe('/api/app/locations', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireAccountMembershipMock.mockResolvedValue(membership())
  })

  it('requires account membership before listing locations', async () => {
    requireAccountMembershipMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })

    const { GET } = await import('./route')
    const response = await GET({
      nextUrl: new URL('http://localhost/api/app/locations?account=other-co'),
    } as never)

    expect(response.status).toBe(403)
    expect(prismaMock.location.findMany).not.toHaveBeenCalled()
  })

  it('lists only locations for the authorized account', async () => {
    prismaMock.location.findMany.mockResolvedValue([{ id: 'loc_123', accountId: 'acct_123' }])

    const { GET } = await import('./route')
    const response = await GET({
      nextUrl: new URL('http://localhost/api/app/locations?account=retail-co'),
    } as never)

    expect(response.status).toBe(200)
    expect(prismaMock.location.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acct_123' },
      }),
    )
  })

  it('enforces starter location limits server-side for the authorized account', async () => {
    prismaMock.location.count.mockResolvedValue(1)

    const { POST } = await import('./route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/locations?account=retail-co'),
      json: async () => ({ name: 'Second Team' }),
    } as never)

    expect(response.status).toBe(400)
    expect(prismaMock.location.count).toHaveBeenCalledWith({
      where: { accountId: 'acct_123' },
    })
    expect(prismaMock.location.create).not.toHaveBeenCalled()
  })

  it('creates locations under the authorized account only', async () => {
    requireAccountMembershipMock.mockResolvedValue(membership({ tier: 'growth' }))
    prismaMock.location.count.mockResolvedValue(0)
    prismaMock.location.create.mockResolvedValue({ id: 'loc_new', accountId: 'acct_123', name: 'New Team' })

    const { POST } = await import('./route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/locations?account=retail-co'),
      json: async () => ({
        name: ' New Team ',
        city: ' New York ',
        googleReviewUrl: ' https://example.com/review ',
      }),
    } as never)

    expect(response.status).toBe(201)
    expect(prismaMock.location.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acct_123',
        name: 'New Team',
        slug: 'new-team',
        city: 'New York',
        googleReviewUrl: 'https://example.com/review',
      }),
    })
  })
})
