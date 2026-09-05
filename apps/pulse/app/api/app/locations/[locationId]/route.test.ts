import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const requireAccountMembershipMock = vi.fn()
const prismaMock = {
  location: {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}

vi.mock('@/lib/auth/require-account-membership', () => ({
  requireAccountMembership: requireAccountMembershipMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const membership = {
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
  },
}

describe('/api/app/locations/[locationId]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireAccountMembershipMock.mockResolvedValue(membership)
  })

  it('requires account membership before reading a location', async () => {
    requireAccountMembershipMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })

    const { GET } = await import('./route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/locations/loc_123?account=other-co') } as never,
      { params: { locationId: 'loc_123' } },
    )

    expect(response.status).toBe(403)
    expect(prismaMock.location.findFirst).not.toHaveBeenCalled()
  })

  it('scopes read, update, and delete checks to the authorized account', async () => {
    prismaMock.location.findFirst.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123', _count: { events: 0 } })
    prismaMock.location.update.mockResolvedValue({ id: 'loc_123', name: 'Updated Team' })
    prismaMock.location.delete.mockResolvedValue({})

    const { GET, PATCH, DELETE } = await import('./route')

    await GET(
      { nextUrl: new URL('http://localhost/api/app/locations/loc_123?account=retail-co') } as never,
      { params: { locationId: 'loc_123' } },
    )
    expect(prismaMock.location.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'loc_123', accountId: 'acct_123' },
      }),
    )

    const patch = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/locations/loc_123?account=retail-co'),
        json: async () => ({ name: ' Updated Team ', googleReviewUrl: 'https://example.com/review' }),
      } as never,
      { params: { locationId: 'loc_123' } },
    )
    expect(patch.status).toBe(200)
    expect(prismaMock.location.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loc_123' },
        data: expect.objectContaining({ name: 'Updated Team' }),
      }),
    )

    const deleted = await DELETE(
      { nextUrl: new URL('http://localhost/api/app/locations/loc_123?account=retail-co') } as never,
      { params: { locationId: 'loc_123' } },
    )
    expect(deleted.status).toBe(200)
    expect(prismaMock.location.delete).toHaveBeenCalledWith({ where: { id: 'loc_123' } })
  })

  it('rejects unsafe Google review URLs before update', async () => {
    prismaMock.location.findFirst.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })

    const { PATCH } = await import('./route')
    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/locations/loc_123?account=retail-co'),
        json: async () => ({ googleReviewUrl: 'http://example.com/review' }),
      } as never,
      { params: { locationId: 'loc_123' } },
    )

    expect(response.status).toBe(400)
    expect(prismaMock.location.update).not.toHaveBeenCalled()
  })
})
