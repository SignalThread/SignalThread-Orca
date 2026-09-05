import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, prismaMock, buildEventsHomeMetricsMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  buildEventsHomeMetricsMock: vi.fn(),
  prismaMock: {
    account: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    accountUserMembership: {
      findUnique: vi.fn(),
    },
    response: {
      count: vi.fn(),
    },
    answerAnalysis: {
      aggregate: vi.fn(),
    },
  },
}))

vi.mock('@/lib/events-home-metrics', () => ({
  buildEventsHomeMetrics: buildEventsHomeMetricsMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const membershipAccount = {
  id: 'acct_123',
  slug: 'retail-co',
  name: 'Retail Co',
  email: 'owner@retail.co',
  tier: 'starter',
  trialEndsAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  billingJson: null,
}

const fullAccount = {
  ...membershipAccount,
  accountType: 'RETAIL',
  settingsJson: null,
  locations: [],
}

describe('GET /api/app/account', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user_123', email: 'user@retail.co' } },
      error: null,
    })
    prismaMock.accountUserMembership.findUnique.mockResolvedValue({ id: 'membership_1' })
  })

  it('rejects a removed retail user even when they pass the old account slug', async () => {
    prismaMock.account.findUnique.mockResolvedValue(membershipAccount)
    prismaMock.user.findUnique.mockResolvedValue({
      accountId: null,
      role: 'MANAGER',
      isActive: false,
    })

    const { GET } = await import('@/app/api/app/account/route')
    const response = await GET({
      url: 'http://localhost/api/app/account?account=retail-co',
    } as never)

    const json = await response.json()
    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
    expect(json.account?.branding).toBeUndefined()
    expect(prismaMock.response.count).not.toHaveBeenCalled()
    expect(prismaMock.answerAnalysis.aggregate).not.toHaveBeenCalled()
  })

  it('allows an active retail user assigned to the requested account', async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce(membershipAccount)
      .mockResolvedValueOnce(fullAccount)
    prismaMock.user.findUnique.mockResolvedValue({
      accountId: 'acct_123',
      role: 'MANAGER',
      isActive: true,
    })

    const { GET } = await import('@/app/api/app/account/route')
    const response = await GET({
      url: 'http://localhost/api/app/account?account=retail-co',
    } as never)

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.account).toMatchObject({
      id: 'acct_123',
      name: 'Retail Co',
      accountType: 'RETAIL',
    })
  })

  it('returns lightweight account context without Events Home metrics', async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce({ ...membershipAccount, accountType: 'EVENTS' })
      .mockResolvedValueOnce({
        settingsJson: {
          branding: {
            logoUrl: '/events-logo.png',
            primaryColor: '#123456',
            primaryButtonColor: '#654321',
          },
        },
      })
    prismaMock.user.findUnique.mockResolvedValue({
      accountId: 'acct_123',
      role: 'MANAGER',
      isActive: true,
    })

    const { GET } = await import('@/app/api/app/account/route')
    const response = await GET({
      url: 'http://localhost/api/app/account?account=retail-co&scope=context',
    } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      account: {
        id: 'acct_123',
        accountType: 'EVENTS',
        branding: {
          logoUrl: '/events-logo.png',
          primaryColor: '#123456',
          primaryButtonColor: '#654321',
        },
      },
    })
    expect(buildEventsHomeMetricsMock).not.toHaveBeenCalled()
    expect(prismaMock.response.count).not.toHaveBeenCalled()
    expect(prismaMock.answerAnalysis.aggregate).not.toHaveBeenCalled()
  })

  it('returns event-scoped Home metrics for EVENTS accounts', async () => {
    const eventsAccount = {
      ...membershipAccount,
      slug: 'live-co',
      accountType: 'EVENTS',
      settingsJson: {
        branding: {
          logoUrl: '/api/app/logo?key=events-logo',
          primaryColor: '#123456',
          primaryButtonColor: '#654321',
        },
      },
      locations: [
        {
          id: 'loc_1',
          name: 'Main Venue',
          city: 'NYC',
          state: 'NY',
          isActive: true,
          events: [
            {
              id: 'evt_live',
              name: 'Summit 2026',
              status: 'ACTIVE',
              eventType: 'CONFERENCE',
              startDate: new Date('2026-07-01T09:00:00.000Z'),
              endDate: new Date('2026-07-03T23:00:00.000Z'),
              isActive: true,
              questions: [],
            },
          ],
        },
      ],
    }

    prismaMock.account.findUnique
      .mockResolvedValueOnce({ ...membershipAccount, slug: 'live-co' })
      .mockResolvedValueOnce(eventsAccount)
    prismaMock.user.findUnique.mockResolvedValue({
      accountId: 'acct_123',
      role: 'MANAGER',
      isActive: true,
    })
    prismaMock.response.count.mockResolvedValue(130)
    prismaMock.answerAnalysis.aggregate.mockResolvedValue({ _avg: { sentimentScore: 0.2 } })
    buildEventsHomeMetricsMock.mockResolvedValue({
      summary: { liveCount: 1, responsesToday: 7, needActionCount: 2 },
      events: {
        evt_live: {
          responses: 40,
          responsesToday: 7,
          surveyCount: 5,
          openAttentionCount: 2,
          satisfaction: { scorePercent: 72, totalAnalyzed: 30, favorableCount: 22, buckets: [], confidence: 'ok' },
          topOpenIssue: { id: 'c1', title: 'Long lines', summary: null, priorityLevel: 'Immediate' },
        },
      },
    })

    const { GET } = await import('@/app/api/app/account/route')
    const response = await GET({
      url: 'http://localhost/api/app/account?account=live-co',
    } as never)

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(buildEventsHomeMetricsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct_123',
        accountSlug: 'live-co',
        accountType: 'EVENTS',
        events: [{
          id: 'evt_live',
          status: 'ACTIVE',
          isActive: true,
          startDate: new Date('2026-07-01T09:00:00.000Z'),
          endDate: new Date('2026-07-03T23:00:00.000Z'),
        }],
      }),
    )
    // Account-wide all-time responses stay as before…
    expect(json.metrics.totalResponses).toBe(130)
    // …and today's responses / need-action come from the event-scoped helper.
    expect(json.metrics.responsesToday).toBe(7)
    expect(json.metrics.needActionCount).toBe(2)
    expect(json.metrics.liveCount).toBe(1)
    expect(json.eventMetrics.evt_live.responses).toBe(40)
    expect(json.eventMetrics.evt_live.surveyCount).toBe(5)
    expect(json.eventMetrics.evt_live.satisfaction.scorePercent).toBe(72)
    expect(json.account.branding).toEqual({
      logoUrl: '/api/app/logo?key=events-logo',
      primaryColor: '#123456',
      primaryButtonColor: '#654321',
    })
  })

  it('does not compute event-scoped Home metrics for retail accounts', async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce(membershipAccount)
      .mockResolvedValueOnce(fullAccount)
    prismaMock.user.findUnique.mockResolvedValue({
      accountId: 'acct_123',
      role: 'MANAGER',
      isActive: true,
    })

    const { GET } = await import('@/app/api/app/account/route')
    const response = await GET({
      url: 'http://localhost/api/app/account?account=retail-co',
    } as never)

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(buildEventsHomeMetricsMock).not.toHaveBeenCalled()
    expect(json.eventMetrics).toEqual({})
    expect(json.metrics.responsesToday).toBe(0)
  })

  it('allows SUPER_ADMIN access to account data without account membership', async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce(membershipAccount)
      .mockResolvedValueOnce(fullAccount)
    prismaMock.user.findUnique.mockResolvedValue({
      accountId: null,
      role: 'SUPER_ADMIN',
      isActive: true,
    })

    const { GET } = await import('@/app/api/app/account/route')
    const response = await GET({
      url: 'http://localhost/api/app/account?account=retail-co',
    } as never)

    expect(response.status).toBe(200)
  })
})
