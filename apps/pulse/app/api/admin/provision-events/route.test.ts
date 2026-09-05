import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSuperAdminForApiMock = vi.fn()
const provisionEventsWorkspaceMock = vi.fn()

vi.mock('@/lib/auth/require-super-admin', () => ({
  requireSuperAdminForApi: requireSuperAdminForApiMock,
}))

vi.mock('@/lib/provisioning', () => ({
  provisionEventsWorkspace: provisionEventsWorkspaceMock,
}))

describe('POST /api/admin/provision-events', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('requires super admin authorization', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })

    const { POST } = await import('@/app/api/admin/provision-events/route')
    const response = await POST({
      json: async () => ({
        email: 'owner@example.com',
        businessName: 'TechConf',
        locationName: 'Conference Team',
        plan: 'growth',
      }),
    } as never)

    expect(response.status).toBe(401)
    expect(provisionEventsWorkspaceMock).not.toHaveBeenCalled()
  })

  it('validates required simplified form fields', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({ ok: true })

    const { POST } = await import('@/app/api/admin/provision-events/route')
    const response = await POST({
      json: async () => ({
        email: '',
        businessName: 'TechConf',
        locationName: '',
        plan: 'starter',
      }),
    } as never)

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json).toMatchObject({
      success: false,
      error: 'Missing required fields',
    })
    expect(provisionEventsWorkspaceMock).not.toHaveBeenCalled()
  })

  it('maps the admin form payload to provisionEventsWorkspace and returns token kiosk path', async () => {
    requireSuperAdminForApiMock.mockResolvedValue({ ok: true })
    provisionEventsWorkspaceMock.mockResolvedValue({
      success: true,
      accountId: 'acct_123',
      locationId: 'loc_123',
      eventId: 'evt_123',
      targetId: 'target_123',
      surveyId: 'survey_123',
      publicLinkId: 'link_123',
      publicLink: {
        id: 'link_123',
        token: 'public-token',
        kioskPath: '/kiosk?token=public-token',
      },
      message: 'Provisioned events account',
    })

    const { POST } = await import('@/app/api/admin/provision-events/route')
    const response = await POST({
      json: async () => ({
        email: 'owner@techconf.io',
        businessName: 'TechConf Events',
        locationName: 'Conference Team',
        plan: 'growth',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(provisionEventsWorkspaceMock).toHaveBeenCalledWith({
      accountName: 'TechConf Events',
      accountSlug: 'techconf-events',
      accountEmail: 'owner@techconf.io',
      plan: 'growth',
      locationName: 'Conference Team',
      locationAddress: undefined,
      eventName: undefined,
      eventDescription: undefined,
      surveyName: undefined,
      surveyDescription: undefined,
      targetName: undefined,
      targetDescription: undefined,
      questions: undefined,
      ownerEmail: 'owner@techconf.io',
    })

    const json = await response.json()
    expect(json).toMatchObject({
      success: true,
      accountId: 'acct_123',
      locationId: 'loc_123',
      eventId: 'evt_123',
      targetId: 'target_123',
      surveyId: 'survey_123',
      publicLink: {
        kioskPath: '/kiosk?token=public-token',
      },
    })
  })
})
