import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { constructEventMock, prismaMock } = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  prismaMock: { account: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, location: { count: vi.fn() } },
}))

vi.mock('stripe', () => ({
  default: class Stripe {
    webhooks = { constructEvent: constructEventMock }
    subscriptions = { retrieve: vi.fn() }
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/provisioning', () => ({
  createPrimaryLocationForAccount: vi.fn(),
  sendStripeCheckoutProvisionInvite: vi.fn(),
}))

function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/webhooks/stripe', { method: 'POST', body, headers })
}

describe('POST /api/webhooks/stripe (provider callback boundary)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('rejects a request without a Stripe signature and never touches the database', async () => {
    const { POST } = await import('./route')
    const response = await POST(post('{}'))
    expect(response.status).toBe(400)
    expect(constructEventMock).not.toHaveBeenCalled()
    expect(prismaMock.account.update).not.toHaveBeenCalled()
  })

  it('rejects a forged signature', async () => {
    constructEventMock.mockImplementation(() => { throw new Error('No signatures found matching the expected signature for payload') })
    const { POST } = await import('./route')
    const response = await POST(post('{"type":"checkout.session.completed"}', { 'stripe-signature': 't=1,v1=bad' }))
    expect(response.status).toBe(400)
    expect(prismaMock.account.update).not.toHaveBeenCalled()
  })

  it('accepts a signed event with no organizer session (provider callbacks stay unauthenticated by design)', async () => {
    constructEventMock.mockReturnValue({ type: 'invoice.payment_succeeded', data: { object: {} } })
    const { POST } = await import('./route')
    const response = await POST(post('{"type":"invoice.payment_succeeded"}', { 'stripe-signature': 't=1,v1=good' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ received: true })
    expect(constructEventMock).toHaveBeenCalledWith('{"type":"invoice.payment_succeeded"}', 't=1,v1=good', 'whsec_test')
  })
})
