import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSuperAdminForApiMock = vi.fn()
const provisionRetailMock = vi.fn()

vi.mock('@/lib/auth/require-super-admin', () => ({
  requireSuperAdminForApi: requireSuperAdminForApiMock,
}))

vi.mock('@/lib/provisioning', () => ({
  provisionRetail: provisionRetailMock,
}))

describe('POST /api/admin/provision-retail', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('maps the simplified admin form payload to the existing provisionRetail input', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({ ok: true })
    provisionRetailMock.mockResolvedValue({
      success: true,
      message: 'Provisioned',
    })

    const { POST } = await import('@/app/api/admin/provision-retail/route')
    const response = await POST({
      json: async () => ({
        email: 'owner@acmecoffee.com',
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
      accountEmail: 'owner@acmecoffee.com',
      plan: 'growth',
      locationName: 'Downtown SF',
      locationAddress: undefined,
      googleReviewUrl: null,
      ownerEmail: 'owner@acmecoffee.com',
    })
    expect(json.success).toBe(true)
  })

  it('still supports the legacy admin payload shape', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({ ok: true })
    provisionRetailMock.mockResolvedValue({
      success: true,
      message: 'Provisioned',
    })

    const { POST } = await import('@/app/api/admin/provision-retail/route')
    const response = await POST({
      json: async () => ({
        accountName: 'Legacy Account',
        accountSlug: 'legacy-account',
        accountEmail: 'billing@example.com',
        ownerEmail: 'owner@example.com',
        locationName: 'Main Crew',
        locationAddress: '123 Main St',
        googleReviewUrl: 'https://example.com/review',
        plan: 'starter',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(provisionRetailMock).toHaveBeenCalledWith({
      accountName: 'Legacy Account',
      accountSlug: 'legacy-account',
      accountEmail: 'billing@example.com',
      plan: 'starter',
      locationName: 'Main Crew',
      locationAddress: '123 Main St',
      googleReviewUrl: 'https://example.com/review',
      ownerEmail: 'owner@example.com',
    })
  })
})
