import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ClaimResult } from './platform-claim-client'
import { buildEventWorkspacePath, resolvePlatformEntry, type EntryDeps } from './handoff-entry'

/**
 * The entry chain from a claimed handoff to a Pulse workspace. Every dependency
 * is injected, so each rule -- all three mappings required, no fallback of any
 * kind, structural consistency between the mapped rows, and Pulse's own access
 * check running *after* mapping -- is asserted directly.
 */

const PLATFORM_USER = 'bfccbd09-700c-4146-992f-8827f32aa6fd'
const PLATFORM_ORG = '7437a82f-bdc9-425d-9f1c-5525930b43bd'
const PLATFORM_EVENT = 'ae9942ba-5759-486b-b591-f1b5ed223370'
const OTHER_ORG = '9d2a1c3e-1111-4222-8333-444455556666'
const TOKEN = 'pkce_0123456789abcdef0123456789abcdef'

const pulseUser = (o: Record<string, unknown> = {}) => ({
  id: '88bbd88d-ca23-40d1-8d63-a7d3d312f783', email: 'organizer@example.com',
  role: 'ADMIN', accountId: null, isActive: true, platformUserId: PLATFORM_USER, ...o,
})
const pulseAccount = (o: Record<string, unknown> = {}) => ({
  id: 'acct_events_demo', slug: 'events-demo', name: 'SignalThread Events Demo', accountType: 'EVENTS',
  isActive: true, platformOrganizationId: PLATFORM_ORG, ...o,
})
const pulseEvent = (o: Record<string, unknown> = {}) => ({
  id: 'event_advanced_demo', name: 'Live Experience Summit', status: 'ACTIVE', isActive: true,
  platformEventId: PLATFORM_EVENT,
  location: { accountId: 'acct_events_demo', account: { id: 'acct_events_demo', slug: 'events-demo', accountType: 'EVENTS', platformOrganizationId: PLATFORM_ORG } },
  ...o,
})

const claimed = (o: Partial<ClaimResult & { context: Record<string, string> }> = {}): ClaimResult => ({
  ok: true,
  context: { platformUserId: PLATFORM_USER, platformOrganizationId: PLATFORM_ORG, platformEventId: PLATFORM_EVENT, ...(o.context ?? {}) },
})

type Mocks = { [K in keyof EntryDeps]: Mock<any[], any> }

function makeDeps(overrides: Partial<Mocks> = {}): EntryDeps & Mocks {
  const deps: Mocks = {
    claim: vi.fn(async () => claimed()),
    resolveUser: vi.fn(async () => ({ ok: true as const, value: pulseUser() })),
    resolveAccount: vi.fn(async () => ({ ok: true as const, value: pulseAccount() })),
    resolveEvent: vi.fn(async () => ({ ok: true as const, value: pulseEvent() })),
    canAccessAccount: vi.fn(async () => true),
    ...overrides,
  }
  return deps as unknown as EntryDeps & Mocks
}

const INPUT = { handoff: TOKEN, eventId: PLATFORM_EVENT }

describe('resolvePlatformEntry', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('resolves all three mappings from a valid handoff and lands in the mapped workspace', async () => {
    const deps = makeDeps()
    const result = await resolvePlatformEntry(INPUT, deps)
    expect(result).toEqual({
      ok: true,
      pulseUserId: '88bbd88d-ca23-40d1-8d63-a7d3d312f783',
      accountId: 'acct_events_demo',
      accountSlug: 'events-demo',
      eventId: 'event_advanced_demo',
      redirectPath: '/app/events/event_advanced_demo?account=events-demo',
    })
    // Each resolver was addressed by the canonical id Platform returned, and nothing else.
    expect(deps.claim).toHaveBeenCalledWith({ handoff: TOKEN, eventId: PLATFORM_EVENT })
    expect(deps.resolveUser).toHaveBeenCalledWith(PLATFORM_USER)
    expect(deps.resolveAccount).toHaveBeenCalledWith(PLATFORM_ORG)
    expect(deps.resolveEvent).toHaveBeenCalledWith(PLATFORM_EVENT)
    // Local authorization ran for the mapped user against the mapped account.
    expect(deps.canAccessAccount).toHaveBeenCalledWith('88bbd88d-ca23-40d1-8d63-a7d3d312f783', 'acct_events_demo')
  })

  it('uses the event id Platform returned, not the one in the URL, to resolve the workspace', async () => {
    const authorized = '11111111-2222-4333-8444-555555555555'
    const deps = makeDeps({ claim: vi.fn(async () => claimed({ context: { platformEventId: authorized } })) })
    await resolvePlatformEntry({ handoff: TOKEN, eventId: PLATFORM_EVENT }, deps)
    expect(deps.resolveEvent).toHaveBeenCalledWith(authorized)
    expect(deps.resolveEvent).not.toHaveBeenCalledWith(PLATFORM_EVENT)
  })

  it('rejects a missing or malformed handoff or event id before contacting Platform', async () => {
    const deps = makeDeps()
    for (const input of [
      { handoff: null, eventId: PLATFORM_EVENT },
      { handoff: '', eventId: PLATFORM_EVENT },
      { handoff: `${TOKEN}&x`, eventId: PLATFORM_EVENT },
      { handoff: TOKEN, eventId: null },
      { handoff: TOKEN, eventId: 'acme-2026' },
      { handoff: TOKEN, eventId: 'organizer@example.com' },
    ]) {
      const result = await resolvePlatformEntry(input, deps)
      expect(result).toMatchObject({ ok: false, status: 400, reason: 'INVALID_REQUEST' })
    }
    expect(deps.claim).not.toHaveBeenCalled()
  })

  it.each([
    ['PLATFORM_NOT_CONFIGURED', 503],
    ['HANDOFF_INVALID', 401],
    ['HANDOFF_EXPIRED', 401],
    ['PLATFORM_DENIED', 403],
    ['PLATFORM_UNAVAILABLE', 502],
  ] as const)('a %s claim ends the request before any mapping is read', async (reason, status) => {
    const deps = makeDeps({ claim: vi.fn(async () => ({ ok: false as const, reason, platformReason: 'PRODUCT_NOT_ENTITLED' })) })
    const result = await resolvePlatformEntry(INPUT, deps)
    expect(result).toMatchObject({ ok: false, status, reason, platformReason: 'PRODUCT_NOT_ENTITLED' })
    expect(deps.resolveUser).not.toHaveBeenCalled()
    expect(deps.resolveAccount).not.toHaveBeenCalled()
    expect(deps.resolveEvent).not.toHaveBeenCalled()
    expect(deps.canAccessAccount).not.toHaveBeenCalled()
  })

  it('an unmapped Platform user fails, and no other resolver or fallback runs', async () => {
    const deps = makeDeps({ resolveUser: vi.fn(async () => ({ ok: false as const, reason: 'NOT_MAPPED' as const })) })
    const result = await resolvePlatformEntry(INPUT, deps)
    expect(result).toMatchObject({ ok: false, status: 403, reason: 'PLATFORM_USER_NOT_MAPPED' })
    expect(deps.resolveAccount).not.toHaveBeenCalled()
    expect(deps.canAccessAccount).not.toHaveBeenCalled()
  })

  it('a deactivated mapped user fails', async () => {
    const deps = makeDeps({ resolveUser: vi.fn(async () => ({ ok: false as const, reason: 'INACTIVE' as const })) })
    await expect(resolvePlatformEntry(INPUT, deps)).resolves.toMatchObject({ ok: false, reason: 'PULSE_USER_INACTIVE' })
  })

  it('an unmapped, ambiguous or inactive organization mapping fails', async () => {
    for (const [reason, expected] of [
      ['NOT_MAPPED', 'PLATFORM_ORGANIZATION_NOT_MAPPED'],
      ['AMBIGUOUS_MAPPING', 'PLATFORM_ORGANIZATION_AMBIGUOUS'],
      ['INACTIVE', 'PULSE_ACCOUNT_INACTIVE'],
    ] as const) {
      const deps = makeDeps({ resolveAccount: vi.fn(async () => ({ ok: false as const, reason })) })
      const result = await resolvePlatformEntry(INPUT, deps)
      expect(result).toMatchObject({ ok: false, status: 403, reason: expected })
      expect(deps.resolveEvent).not.toHaveBeenCalled()
      expect(deps.canAccessAccount).not.toHaveBeenCalled()
    }
  })

  it('an unmapped or inactive event mapping fails', async () => {
    for (const [reason, expected] of [
      ['NOT_MAPPED', 'PLATFORM_EVENT_NOT_MAPPED'],
      ['INACTIVE', 'PULSE_EVENT_INACTIVE'],
    ] as const) {
      const deps = makeDeps({ resolveEvent: vi.fn(async () => ({ ok: false as const, reason })) })
      const result = await resolvePlatformEntry(INPUT, deps)
      expect(result).toMatchObject({ ok: false, status: 403, reason: expected })
      expect(deps.canAccessAccount).not.toHaveBeenCalled()
    }
  })

  it('a mapped event owned by a different Pulse account is refused', async () => {
    const deps = makeDeps({
      resolveEvent: vi.fn(async () => ({
        ok: true as const,
        value: pulseEvent({ location: { accountId: 'acct_other', account: { id: 'acct_other', slug: 'other', accountType: 'EVENTS', platformOrganizationId: PLATFORM_ORG } } }),
      })),
    })
    const result = await resolvePlatformEntry(INPUT, deps)
    expect(result).toMatchObject({ ok: false, status: 403, reason: 'EVENT_ACCOUNT_MISMATCH' })
    expect(deps.canAccessAccount).not.toHaveBeenCalled()
  })

  it('a mapped event whose account maps to a different organization is refused', async () => {
    const deps = makeDeps({
      resolveEvent: vi.fn(async () => ({
        ok: true as const,
        value: pulseEvent({ location: { accountId: 'acct_events_demo', account: { id: 'acct_events_demo', slug: 'events-demo', accountType: 'EVENTS', platformOrganizationId: OTHER_ORG } } }),
      })),
    })
    await expect(resolvePlatformEntry(INPUT, deps)).resolves.toMatchObject({ ok: false, reason: 'EVENT_ACCOUNT_MISMATCH' })
  })

  it('a non-Events account is refused even when every mapping resolves', async () => {
    const deps = makeDeps({ resolveAccount: vi.fn(async () => ({ ok: true as const, value: pulseAccount({ accountType: 'RETAIL' }) })) })
    await expect(resolvePlatformEntry(INPUT, deps)).resolves.toMatchObject({ ok: false, reason: 'NOT_AN_EVENTS_ACCOUNT' })
    expect(deps.canAccessAccount).not.toHaveBeenCalled()
  })

  it('mapping is not authorization: a mapped user without Pulse access to the account is refused', async () => {
    const deps = makeDeps({ canAccessAccount: vi.fn(async () => false) })
    const result = await resolvePlatformEntry(INPUT, deps)
    expect(result).toMatchObject({ ok: false, status: 403, reason: 'PULSE_ACCESS_DENIED' })
    expect(deps.canAccessAccount).toHaveBeenCalledWith('88bbd88d-ca23-40d1-8d63-a7d3d312f783', 'acct_events_demo')
  })

  it('local authorization runs only after every mapping and consistency check has passed', async () => {
    const order: string[] = []
    const deps = makeDeps({
      resolveUser: vi.fn(async () => { order.push('user'); return { ok: true as const, value: pulseUser() } }),
      resolveAccount: vi.fn(async () => { order.push('account'); return { ok: true as const, value: pulseAccount() } }),
      resolveEvent: vi.fn(async () => { order.push('event'); return { ok: true as const, value: pulseEvent() } }),
      canAccessAccount: vi.fn(async () => { order.push('authorize'); return true }),
    })
    await resolvePlatformEntry(INPUT, deps)
    expect(order).toEqual(['user', 'account', 'event', 'authorize'])
  })

  it('never resolves anything by email, name, slug or contact address', async () => {
    // The resolvers receive canonical uuids and nothing else; the Pulse user's email
    // and the account's contact email are present in the rows but never used as input.
    const deps = makeDeps()
    await resolvePlatformEntry(INPUT, deps)
    for (const call of [...deps.resolveUser.mock.calls, ...deps.resolveAccount.mock.calls, ...deps.resolveEvent.mock.calls]) {
      expect(call).toHaveLength(1)
      expect(call[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    }
  })
})

describe('buildEventWorkspacePath', () => {
  it('lands on the event workspace scoped to the mapped account, URL-encoded', () => {
    expect(buildEventWorkspacePath('event_1', 'events-demo')).toBe('/app/events/event_1?account=events-demo')
    expect(buildEventWorkspacePath('ev/1', 'a b&c=d')).toBe('/app/events/ev%2F1?account=a%20b%26c%3Dd')
  })
})
