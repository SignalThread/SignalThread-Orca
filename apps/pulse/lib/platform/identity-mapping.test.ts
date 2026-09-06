import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    account: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    event: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  eventBelongsToPlatformOrganization,
  isCanonicalPlatformId,
  resolvePulseAccountByPlatformOrganizationId,
  resolvePulseEventByPlatformEventId,
  resolvePulseUserByPlatformUserId,
} from './identity-mapping'

const PLATFORM_USER = '3f1c8b6e-9a1d-4f7a-88b1-0c2d5e6f7a81'
const PLATFORM_ORG = '7c9e2a41-5b6d-4e3f-9a2b-1d4c6e8f0a52'
const PLATFORM_EVENT = 'b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d44'

const pulseUser = (o: Record<string, unknown> = {}) => ({
  id: 'a0000000-0000-4000-8000-000000000001', email: 'organizer@example.com',
  role: 'ADMIN', accountId: 'acct_1', isActive: true, platformUserId: PLATFORM_USER, ...o,
})
const pulseAccount = (o: Record<string, unknown> = {}) => ({
  id: 'acct_1', slug: 'events-co', name: 'Events Co', accountType: 'EVENTS',
  isActive: true, platformOrganizationId: PLATFORM_ORG, ...o,
})
const pulseEvent = (o: Record<string, unknown> = {}) => ({
  id: 'event_1', name: 'Spring Summit', status: 'ACTIVE', isActive: true,
  platformEventId: PLATFORM_EVENT,
  location: { accountId: 'acct_1', account: { id: 'acct_1', slug: 'events-co', accountType: 'EVENTS', platformOrganizationId: PLATFORM_ORG } },
  ...o,
})

describe('canonical platform id validation', () => {
  it('accepts a canonical uuid and rejects everything that is not one', () => {
    expect(isCanonicalPlatformId(PLATFORM_USER)).toBe(true)
    for (const bad of [
      'organizer@example.com', 'events-co', 'Events Co', 'example.com',
      'cmtop6rfk0002npf2doevktfb', '', '   ', null, undefined, 42, {},
      '3f1c8b6e9a1d4f7a88b10c2d5e6f7a81', '3f1c8b6e-9a1d-4f7a-88b1-0c2d5e6f7a8',
    ]) expect(isCanonicalPlatformId(bad as unknown)).toBe(false)
  })
})

describe('resolvePulseUserByPlatformUserId', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('resolves a mapped user by canonical id only', async () => {
    prismaMock.user.findUnique.mockResolvedValue(pulseUser())
    const result = await resolvePulseUserByPlatformUserId(PLATFORM_USER)
    expect(result).toEqual({ ok: true, value: pulseUser() })
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platformUserId: PLATFORM_USER } }),
    )
  })

  it('never falls back to email for an unmapped canonical user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    await expect(resolvePulseUserByPlatformUserId(PLATFORM_USER)).resolves.toEqual({ ok: false, reason: 'NOT_MAPPED' })
    // The lookup key is the canonical id and nothing else — no email predicate, and no
    // second query that could widen the search after the mapping misses.
    expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({ platformUserId: PLATFORM_USER })
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it('rejects a non-uuid identifier before touching the database', async () => {
    for (const bad of ['organizer@example.com', 'events-co', 'cmtop6rfk0002npf2doevktfb', null]) {
      await expect(resolvePulseUserByPlatformUserId(bad as unknown)).resolves.toEqual({ ok: false, reason: 'INVALID_PLATFORM_ID' })
    }
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('reports a deactivated mapped user instead of returning it', async () => {
    prismaMock.user.findUnique.mockResolvedValue(pulseUser({ isActive: false }))
    await expect(resolvePulseUserByPlatformUserId(PLATFORM_USER)).resolves.toEqual({ ok: false, reason: 'INACTIVE' })
  })

  it('normalizes casing and surrounding whitespace rather than treating them as new ids', async () => {
    prismaMock.user.findUnique.mockResolvedValue(pulseUser())
    await resolvePulseUserByPlatformUserId(`  ${PLATFORM_USER.toUpperCase()}  `)
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platformUserId: PLATFORM_USER } }),
    )
  })
})

describe('resolvePulseAccountByPlatformOrganizationId', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('resolves a mapped account by canonical organization id only', async () => {
    prismaMock.account.findMany.mockResolvedValue([pulseAccount()])
    await expect(resolvePulseAccountByPlatformOrganizationId(PLATFORM_ORG)).resolves.toEqual({ ok: true, value: pulseAccount() })
    expect(prismaMock.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platformOrganizationId: PLATFORM_ORG } }),
    )
  })

  it('never falls back to account name, slug or contact email when unmapped', async () => {
    prismaMock.account.findMany.mockResolvedValue([])
    await expect(resolvePulseAccountByPlatformOrganizationId(PLATFORM_ORG)).resolves.toEqual({ ok: false, reason: 'NOT_MAPPED' })
    expect(prismaMock.account.findMany.mock.calls[0][0].where).toEqual({ platformOrganizationId: PLATFORM_ORG })
    expect(prismaMock.account.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.account.findFirst).not.toHaveBeenCalled()
  })

  it('reports AMBIGUOUS_MAPPING instead of picking one of several accounts', async () => {
    // The column is intentionally not unique: an organization may own several Pulse
    // Accounts, so this is a real state and must never resolve silently.
    prismaMock.account.findMany.mockResolvedValue([pulseAccount(), pulseAccount({ id: 'acct_2', slug: 'retail-co', accountType: 'RETAIL' })])
    await expect(resolvePulseAccountByPlatformOrganizationId(PLATFORM_ORG)).resolves.toEqual({ ok: false, reason: 'AMBIGUOUS_MAPPING' })
  })

  it('rejects a non-uuid organization identifier before touching the database', async () => {
    await expect(resolvePulseAccountByPlatformOrganizationId('events-co')).resolves.toEqual({ ok: false, reason: 'INVALID_PLATFORM_ID' })
    expect(prismaMock.account.findMany).not.toHaveBeenCalled()
  })

  it('reports a deactivated mapped account instead of returning it', async () => {
    prismaMock.account.findMany.mockResolvedValue([pulseAccount({ isActive: false })])
    await expect(resolvePulseAccountByPlatformOrganizationId(PLATFORM_ORG)).resolves.toEqual({ ok: false, reason: 'INACTIVE' })
  })
})

describe('resolvePulseEventByPlatformEventId', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('resolves a mapped Events-product workspace with its owning account', async () => {
    prismaMock.event.findUnique.mockResolvedValue(pulseEvent())
    const result = await resolvePulseEventByPlatformEventId(PLATFORM_EVENT)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value.id).toBe('event_1')
    expect(result.value.location.account.accountType).toBe('EVENTS')
    expect(prismaMock.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platformEventId: PLATFORM_EVENT } }),
    )
  })

  it('leaves a Retail campaign Event unmapped without treating it as an error state', async () => {
    // Retail rows share the Event table and never receive a canonical id. Resolution by a
    // canonical id simply finds nothing; the Retail row itself is untouched and usable.
    prismaMock.event.findUnique.mockResolvedValue(null)
    await expect(resolvePulseEventByPlatformEventId(PLATFORM_EVENT)).resolves.toEqual({ ok: false, reason: 'NOT_MAPPED' })
    // Nothing about the account type narrows the lookup: Retail rows are excluded by
    // never being assigned a canonical id, not by a query filter.
    expect(prismaMock.event.findUnique.mock.calls[0][0].where).toEqual({ platformEventId: PLATFORM_EVENT })
  })

  it('never falls back to event name or slug when unmapped', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null)
    await resolvePulseEventByPlatformEventId(PLATFORM_EVENT)
    expect(prismaMock.event.findUnique.mock.calls[0][0].where).toEqual({ platformEventId: PLATFORM_EVENT })
    expect(prismaMock.event.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.event.findMany).not.toHaveBeenCalled()
  })

  it('rejects a non-uuid event identifier before touching the database', async () => {
    await expect(resolvePulseEventByPlatformEventId('event_advanced_demo_20260903195512_42b377cc')).resolves.toEqual({ ok: false, reason: 'INVALID_PLATFORM_ID' })
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled()
  })

  it('reports an archived mapped event instead of returning it', async () => {
    prismaMock.event.findUnique.mockResolvedValue(pulseEvent({ isActive: false }))
    await expect(resolvePulseEventByPlatformEventId(PLATFORM_EVENT)).resolves.toEqual({ ok: false, reason: 'INACTIVE' })
  })
})

describe('eventBelongsToPlatformOrganization', () => {
  it('confirms an event owned by the caller organization and refuses a foreign one', () => {
    expect(eventBelongsToPlatformOrganization(pulseEvent() as never, PLATFORM_ORG)).toBe(true)
    expect(eventBelongsToPlatformOrganization(pulseEvent() as never, PLATFORM_ORG.toUpperCase())).toBe(true)
    expect(eventBelongsToPlatformOrganization(pulseEvent() as never, '00000000-0000-4000-8000-000000000999')).toBe(false)
  })

  it('refuses when either side is unmapped, rather than treating null as a match', () => {
    const unmappedOwner = pulseEvent({ location: { accountId: 'acct_1', account: { id: 'acct_1', slug: 'retail-co', accountType: 'RETAIL', platformOrganizationId: null } } })
    expect(eventBelongsToPlatformOrganization(unmappedOwner as never, PLATFORM_ORG)).toBe(false)
    expect(eventBelongsToPlatformOrganization(pulseEvent() as never, null)).toBe(false)
    expect(eventBelongsToPlatformOrganization(pulseEvent() as never, 'events-co')).toBe(false)
  })
})
