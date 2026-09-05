import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAccountMembershipMock, prismaMock } = vi.hoisted(() => ({
  requireAccountMembershipMock: vi.fn(),
  prismaMock: { event: { findFirst: vi.fn() } },
}))

vi.mock('@/lib/auth/require-account-membership', () => ({
  requireAccountMembership: requireAccountMembershipMock,
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const eventsDemoAccount = {
  id: 'account_events_demo',
  slug: 'events-demo',
  name: 'Events Demo',
  accountType: 'EVENTS',
  email: 'owner@example.com',
  tier: 'enterprise',
  trialEndsAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  billingJson: null,
}

describe('requireEventsEventAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.event.findFirst.mockResolvedValue({ id: 'event_demo' })
  })

  it('provides shared product-neutral event scoping for routes used by Events and SMB', async () => {
    const retailAccount = { ...eventsDemoAccount, id: 'retail_account', slug: 'retail-co', accountType: 'RETAIL' }
    requireAccountMembershipMock.mockResolvedValue({ ok: true, userId: 'retail_member', account: retailAccount })
    prismaMock.event.findFirst.mockResolvedValue({ id: 'retail_event' })
    const { requireEventAccess } = await import('./require-events-event-access')

    const result = await requireEventAccess('retail-co', 'retail_event')

    expect(result).toMatchObject({ ok: true, account: { id: 'retail_account' }, event: { id: 'retail_event' } })
    expect(prismaMock.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'retail_event', location: { accountId: 'retail_account' } },
      select: expect.objectContaining({ id: true, name: true, status: true }),
    }))
  })

  it('allows a SUPER_ADMIN approved by the canonical membership policy to inspect events-demo', async () => {
    requireAccountMembershipMock.mockResolvedValue({
      ok: true,
      userId: 'platform_admin',
      account: eventsDemoAccount,
    })
    const { requireEventsEventAccess } = await import('./require-events-event-access')

    const result = await requireEventsEventAccess('events-demo', 'event_demo')

    expect(requireAccountMembershipMock).toHaveBeenCalledWith('events-demo', { allowSuperAdmin: true })
    expect(result).toMatchObject({ ok: true, userId: 'platform_admin', event: { id: 'event_demo' } })
  })

  it('allows an active account member to access an Event in their account', async () => {
    requireAccountMembershipMock.mockResolvedValue({ ok: true, userId: 'member_1', account: eventsDemoAccount })
    const { requireEventsEventAccess } = await import('./require-events-event-access')

    const result = await requireEventsEventAccess('events-demo', 'event_demo')

    expect(result).toMatchObject({ ok: true, userId: 'member_1', account: { id: 'account_events_demo' } })
    expect(prismaMock.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_demo', location: { accountId: 'account_events_demo' } },
      select: expect.objectContaining({ id: true, name: true, status: true }),
    }))
  })

  it.each([
    ['missing session', 401, 'Unauthorized'],
    ['another tenant', 403, 'Forbidden'],
  ])('preserves %s failures before querying the Event', async (_label, status, error) => {
    const { NextResponse } = await import('next/server')
    requireAccountMembershipMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error }, { status }),
    })
    const { requireEventsEventAccess } = await import('./require-events-event-access')

    const result = await requireEventsEventAccess('events-demo', 'event_demo')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(status)
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it('does not authorize an Event belonging to another account', async () => {
    requireAccountMembershipMock.mockResolvedValue({ ok: true, userId: 'member_1', account: eventsDemoAccount })
    prismaMock.event.findFirst.mockResolvedValue(null)
    const { requireEventsEventAccess } = await import('./require-events-event-access')

    const result = await requireEventsEventAccess('events-demo', 'other_event')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(404)
  })

  it('keeps the intelligence guard Events-only', async () => {
    requireAccountMembershipMock.mockResolvedValue({
      ok: true,
      userId: 'retail_member',
      account: { ...eventsDemoAccount, id: 'retail_account', slug: 'retail-co', accountType: 'RETAIL' },
    })
    const { requireEventsEventAccess } = await import('./require-events-event-access')

    const result = await requireEventsEventAccess('retail-co', 'retail_event')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })
})
