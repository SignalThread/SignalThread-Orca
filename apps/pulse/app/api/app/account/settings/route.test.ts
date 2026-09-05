import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const requireAccountMembershipMock = vi.fn()
const prismaMock = {
  account: {
    findUnique: vi.fn(),
    update: vi.fn(),
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

describe('/api/app/account/settings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireAccountMembershipMock.mockResolvedValue(membership)
  })

  it('requires account membership before returning settings', async () => {
    requireAccountMembershipMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })

    const { GET } = await import('./route')
    const response = await GET({
      url: 'http://localhost/api/app/account/settings?account=other-co',
    } as never)

    expect(response.status).toBe(403)
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled()
  })

  it('reads settings only from the authorized account id', async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      name: 'Retail Co',
      accountType: 'RETAIL',
      settingsJson: {
        branding: { logoUrl: 'https://example.com/logo.png', primaryColor: '#111111' },
        consent: { title: 'Share feedback', items: ['One'], buttonText: 'Start' },
      },
      locations: [{ name: 'Downtown' }],
    })

    const { GET } = await import('./route')
    const response = await GET({
      url: 'http://localhost/api/app/account/settings?account=retail-co',
    } as never)

    expect(response.status).toBe(200)
    expect(requireAccountMembershipMock).toHaveBeenCalledWith('retail-co', { allowSuperAdmin: true })
    expect(prismaMock.account.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acct_123' },
      }),
    )
    const json = await response.json()
    expect(json.account.accountType).toBe('RETAIL')
    expect(json.settings.businessName).toBe('Downtown')
    expect(json.settings.branding.logoUrl).toBe('https://example.com/logo.png')
    expect(json.settings.consent.bulletStyle).toBe('CHECKMARK')
    expect(json.settings.consentConfigured).toBe(true)
  })

  it('distinguishes unresolved kiosk defaults from persisted consent setup', async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123', name: 'Retail Co', accountType: 'EVENTS', settingsJson: {}, locations: [],
    })

    const { GET } = await import('./route')
    const response = await GET({ url: 'http://localhost/api/app/account/settings?account=retail-co' } as never)
    const json = await response.json()
    expect(json.settings.consent.title).toBe('SignalThread')
    expect(json.settings.consentConfigured).toBe(false)
  })

  it('patches settings only for the authorized account id', async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      settingsJson: {
        branding: { primaryColor: '#111111' },
        consent: { title: 'Old title' },
      },
    })
    prismaMock.account.update.mockResolvedValue({})

    const { PATCH } = await import('./route')
    const response = await PATCH({
      url: 'http://localhost/api/app/account/settings?account=retail-co',
      json: async () => ({
        branding: { primaryButtonColor: '#2563eb' },
        consent: { title: 'New title' },
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(requireAccountMembershipMock).toHaveBeenCalledWith('retail-co', { allowSuperAdmin: true })
    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: { id: 'acct_123' },
      select: { id: true, settingsJson: true },
    })
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: 'acct_123' },
      data: {
        settingsJson: {
          branding: { primaryColor: '#111111', primaryButtonColor: '#2563eb' },
          consent: { title: 'New title' },
        },
      },
    })
  })

  it('persists a supported consent bullet style and rejects unsupported values', async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      settingsJson: { consent: { title: 'Existing' } },
    })
    prismaMock.account.update.mockResolvedValue({})

    const { PATCH } = await import('./route')
    const saved = await PATCH({
      url: 'http://localhost/api/app/account/settings?account=retail-co',
      json: async () => ({ consent: { bulletStyle: 'STAR' } }),
    } as never)

    expect(saved.status).toBe(200)
    expect(prismaMock.account.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { settingsJson: { consent: { title: 'Existing', bulletStyle: 'STAR' } } },
    }))

    const rejected = await PATCH({
      url: 'http://localhost/api/app/account/settings?account=retail-co',
      json: async () => ({ consent: { bulletStyle: 'DIAMOND' } }),
    } as never)
    expect(rejected.status).toBe(400)
    await expect(rejected.json()).resolves.toMatchObject({ error: 'Invalid consent bullet style' })
  })
})
