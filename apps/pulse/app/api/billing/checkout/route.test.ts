import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionsCreateMock = vi.fn()
const stripeConstructorMock = vi.fn(() => ({
  checkout: {
    sessions: {
      create: sessionsCreateMock,
    },
  },
}))

const txMock = {
  account: {
    create: vi.fn(),
  },
}

const prismaMock = {
  account: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}

vi.mock('stripe', () => ({
  default: stripeConstructorMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/provisioning', () => ({
  createPrimaryLocationForAccount: vi.fn(),
}))

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    process.env.STRIPE_PRICE_STARTER = 'price_starter'
    process.env.STRIPE_PRICE_GROWTH = 'price_growth'
    process.env.NEXT_PUBLIC_APP_URL = 'https://voice.signalthread.ai'
    process.env.MARKETING_SITE_URL = 'https://www.signalthread.ai'

    prismaMock.account.findUnique.mockResolvedValue(null)
    txMock.account.create.mockResolvedValue({
      id: 'acct_123',
      name: 'Acme Coffee',
      email: 'owner@example.com',
    })
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock))
    sessionsCreateMock.mockResolvedValue({ url: 'https://checkout.stripe.com/c/session_123' })
  })

  it('returns a Stripe checkout URL and sends successful checkout to Voice-owned OTP onboarding', async () => {
    const { POST } = await import('@/app/api/billing/checkout/route')
    const response = await POST({
      json: async () => ({
        email: 'owner@example.com',
        businessName: 'Acme Coffee',
        locationName: 'Downtown',
        plan: 'growth',
      }),
    } as never)

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.url).toBe('https://checkout.stripe.com/c/session_123')
    expect(sessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'https://voice.signalthread.ai/signup/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://www.signalthread.ai/#pricing',
        metadata: { accountId: 'acct_123' },
      }),
    )
    expect(sessionsCreateMock.mock.calls[0][0].success_url).not.toContain('www.signalthread.ai/signup/success')
  })
})
