import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    account: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    event: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  assignPlatformEventMapping,
  assignPlatformOrganizationMapping,
  assignPlatformUserMapping,
} from './assign-mapping'
import { resolvePulseUserByPlatformUserId, resolvePulseAccountByPlatformOrganizationId, resolvePulseEventByPlatformEventId } from './identity-mapping'

const P_USER = 'bfccbd09-700c-4146-992f-8827f32aa6fd'
const P_USER_OTHER = '0ef969f2-e635-4836-aede-2261c1569ac9'
const P_ORG = '7437a82f-bdc9-425d-9f1c-5525930b43bd'
const P_ORG_OTHER = '397c111b-d2ed-4d30-9d9a-feee5ded5aa2'
const P_EVENT = 'ae9942ba-5759-486b-b591-f1b5ed223370'
const PULSE_USER = '88bbd88d-ca23-40d1-8d63-a7d3d312f783'

const eventsAccount = (o: Record<string, unknown> = {}) => ({ id: 'acct_1', slug: 'events-co', accountType: 'EVENTS', platformOrganizationId: null, ...o })
const pulseEvent = (o: Record<string, unknown> = {}, account = eventsAccount()) => ({
  id: 'event_1', name: 'Summit', platformEventId: null, location: { account }, ...o,
})
const lookupOk = vi.fn(async () => ({ id: P_EVENT, organization_id: P_ORG }))

beforeEach(() => { vi.clearAllMocks(); lookupOk.mockResolvedValue({ id: P_EVENT, organization_id: P_ORG }) })

describe('assignPlatformUserMapping', () => {
  it('assigns when the mapping is currently NULL', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: PULSE_USER, email: 'a@b.test', platformUserId: null }).mockResolvedValueOnce(null)
    prismaMock.user.update.mockResolvedValue({ id: PULSE_USER, email: 'a@b.test', platformUserId: P_USER })
    const result = await assignPlatformUserMapping({ pulseUserId: PULSE_USER, platformUserId: P_USER })
    expect(result).toEqual({ ok: true, outcome: 'ASSIGNED', value: { id: PULSE_USER, email: 'a@b.test', platformUserId: P_USER } })
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: PULSE_USER }, data: { platformUserId: P_USER } }))
  })

  it('is idempotent when already mapped to the same canonical id', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: PULSE_USER, email: 'a@b.test', platformUserId: P_USER })
    await expect(assignPlatformUserMapping({ pulseUserId: PULSE_USER, platformUserId: P_USER.toUpperCase() }))
      .resolves.toMatchObject({ ok: true, outcome: 'ALREADY_ASSIGNED' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('refuses to silently re-point an existing mapping', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: PULSE_USER, email: 'a@b.test', platformUserId: P_USER_OTHER })
    await expect(assignPlatformUserMapping({ pulseUserId: PULSE_USER, platformUserId: P_USER }))
      .resolves.toMatchObject({ ok: false, reason: 'ALREADY_MAPPED_TO_DIFFERENT_ID', detail: P_USER_OTHER })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('refuses when another Pulse user already owns that canonical id', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: PULSE_USER, email: 'a@b.test', platformUserId: null }).mockResolvedValueOnce({ id: 'other_user' })
    await expect(assignPlatformUserMapping({ pulseUserId: PULSE_USER, platformUserId: P_USER }))
      .resolves.toMatchObject({ ok: false, reason: 'PLATFORM_ID_TAKEN', detail: 'other_user' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('refuses an invalid uuid and a missing local id before touching the database', async () => {
    for (const bad of ['ali@example.com', 'events-co', 'not-a-uuid', '']) {
      await expect(assignPlatformUserMapping({ pulseUserId: PULSE_USER, platformUserId: bad })).resolves.toMatchObject({ ok: false, reason: 'INVALID_PLATFORM_ID' })
    }
    await expect(assignPlatformUserMapping({ pulseUserId: '  ', platformUserId: P_USER })).resolves.toMatchObject({ ok: false, reason: 'MISSING_PULSE_ID' })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('refuses when the local record does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    await expect(assignPlatformUserMapping({ pulseUserId: 'nope', platformUserId: P_USER })).resolves.toMatchObject({ ok: false, reason: 'PULSE_RECORD_NOT_FOUND' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('selects the local row by primary key only — never by email', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: PULSE_USER, email: 'a@b.test', platformUserId: null }).mockResolvedValueOnce(null)
    prismaMock.user.update.mockResolvedValue({ id: PULSE_USER, email: 'a@b.test', platformUserId: P_USER })
    await assignPlatformUserMapping({ pulseUserId: PULSE_USER, platformUserId: P_USER })
    expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({ id: PULSE_USER })
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
    // the write changes only the mapping column; the local id is never rewritten
    expect(Object.keys(prismaMock.user.update.mock.calls[0][0].data)).toEqual(['platformUserId'])
  })

  it('resolves through the runtime helper once assigned', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: PULSE_USER, email: 'a@b.test', role: 'SUPER_ADMIN', accountId: null, isActive: true, platformUserId: P_USER })
    await expect(resolvePulseUserByPlatformUserId(P_USER)).resolves.toMatchObject({ ok: true, value: { id: PULSE_USER } })
  })

  it('dry run reports the outcome without writing', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: PULSE_USER, email: 'a@b.test', platformUserId: null }).mockResolvedValueOnce(null)
    await expect(assignPlatformUserMapping({ pulseUserId: PULSE_USER, platformUserId: P_USER }, { dryRun: true })).resolves.toMatchObject({ ok: true, outcome: 'ASSIGNED' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})

describe('assignPlatformOrganizationMapping', () => {
  it('assigns when NULL and is idempotent on repeat', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_1', slug: 'events-co', platformOrganizationId: null })
    prismaMock.account.update.mockResolvedValue({ id: 'acct_1', slug: 'events-co', platformOrganizationId: P_ORG })
    await expect(assignPlatformOrganizationMapping({ pulseAccountId: 'acct_1', platformOrganizationId: P_ORG })).resolves.toMatchObject({ ok: true, outcome: 'ASSIGNED' })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_1', slug: 'events-co', platformOrganizationId: P_ORG })
    await expect(assignPlatformOrganizationMapping({ pulseAccountId: 'acct_1', platformOrganizationId: P_ORG })).resolves.toMatchObject({ ok: true, outcome: 'ALREADY_ASSIGNED' })
  })

  it('refuses to re-point an account to a different organization', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_1', slug: 'events-co', platformOrganizationId: P_ORG_OTHER })
    await expect(assignPlatformOrganizationMapping({ pulseAccountId: 'acct_1', platformOrganizationId: P_ORG })).resolves.toMatchObject({ ok: false, reason: 'ALREADY_MAPPED_TO_DIFFERENT_ID' })
    expect(prismaMock.account.update).not.toHaveBeenCalled()
  })

  it('allows a second Pulse Account to map to the same organization (1:N is intended)', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_2', slug: 'retail-co', platformOrganizationId: null })
    prismaMock.account.update.mockResolvedValue({ id: 'acct_2', slug: 'retail-co', platformOrganizationId: P_ORG })
    await expect(assignPlatformOrganizationMapping({ pulseAccountId: 'acct_2', platformOrganizationId: P_ORG })).resolves.toMatchObject({ ok: true, outcome: 'ASSIGNED' })
    // no "taken" pre-check exists for organizations, unlike users and events
    expect(prismaMock.account.findUnique).toHaveBeenCalledTimes(1)
  })

  it('refuses invalid uuid and missing local record, and never looks up by slug or name', async () => {
    await expect(assignPlatformOrganizationMapping({ pulseAccountId: 'acct_1', platformOrganizationId: 'events-co' })).resolves.toMatchObject({ ok: false, reason: 'INVALID_PLATFORM_ID' })
    prismaMock.account.findUnique.mockResolvedValue(null)
    await expect(assignPlatformOrganizationMapping({ pulseAccountId: 'nope', platformOrganizationId: P_ORG })).resolves.toMatchObject({ ok: false, reason: 'PULSE_RECORD_NOT_FOUND' })
    expect(prismaMock.account.findUnique.mock.calls[0][0].where).toEqual({ id: 'nope' })
    expect(prismaMock.account.findFirst).not.toHaveBeenCalled()
  })

  it('resolves through the runtime helper once assigned', async () => {
    prismaMock.account.findMany.mockResolvedValue([{ id: 'acct_1', slug: 'events-co', name: 'Events Co', accountType: 'EVENTS', isActive: true, platformOrganizationId: P_ORG }])
    await expect(resolvePulseAccountByPlatformOrganizationId(P_ORG)).resolves.toMatchObject({ ok: true, value: { id: 'acct_1' } })
  })
})

describe('assignPlatformEventMapping', () => {
  it('assigns an EVENTS-account event when NULL', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce(pulseEvent()).mockResolvedValueOnce(null)
    prismaMock.event.update.mockResolvedValue({ id: 'event_1', name: 'Summit', platformEventId: P_EVENT })
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: P_EVENT, lookupPlatformEvent: lookupOk })).resolves.toMatchObject({ ok: true, outcome: 'ASSIGNED' })
    // the owning account is unmapped, so no Platform lookup was needed
    expect(lookupOk).not.toHaveBeenCalled()
  })

  it('refuses to map a Retail campaign Event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(pulseEvent({}, eventsAccount({ slug: 'retail-co', accountType: 'RETAIL' })))
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: P_EVENT, lookupPlatformEvent: lookupOk }))
      .resolves.toMatchObject({ ok: false, reason: 'NOT_AN_EVENTS_ACCOUNT' })
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('is idempotent, and refuses to re-point or to duplicate a canonical event id', async () => {
    prismaMock.event.findUnique.mockResolvedValue(pulseEvent({ platformEventId: P_EVENT }))
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: P_EVENT, lookupPlatformEvent: lookupOk })).resolves.toMatchObject({ ok: true, outcome: 'ALREADY_ASSIGNED' })

    prismaMock.event.findUnique.mockResolvedValue(pulseEvent({ platformEventId: '11111111-1111-4111-8111-111111111111' }))
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: P_EVENT, lookupPlatformEvent: lookupOk })).resolves.toMatchObject({ ok: false, reason: 'ALREADY_MAPPED_TO_DIFFERENT_ID' })

    prismaMock.event.findUnique.mockReset()
    prismaMock.event.findUnique.mockResolvedValueOnce(pulseEvent()).mockResolvedValueOnce({ id: 'event_other' })
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: P_EVENT, lookupPlatformEvent: lookupOk })).resolves.toMatchObject({ ok: false, reason: 'PLATFORM_ID_TAKEN', detail: 'event_other' })
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('verifies the organization relationship when the account is already mapped', async () => {
    const mapped = eventsAccount({ platformOrganizationId: P_ORG })
    prismaMock.event.findUnique.mockResolvedValueOnce(pulseEvent({}, mapped)).mockResolvedValueOnce(null)
    prismaMock.event.update.mockResolvedValue({ id: 'event_1', name: 'Summit', platformEventId: P_EVENT })
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: P_EVENT, lookupPlatformEvent: lookupOk })).resolves.toMatchObject({ ok: true, outcome: 'ASSIGNED' })
    expect(lookupOk).toHaveBeenCalledWith(P_EVENT)
  })

  it('refuses when the Platform event belongs to a different organization', async () => {
    const mapped = eventsAccount({ platformOrganizationId: P_ORG_OTHER })
    prismaMock.event.findUnique.mockResolvedValueOnce(pulseEvent({}, mapped)).mockResolvedValueOnce(null)
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: P_EVENT, lookupPlatformEvent: lookupOk }))
      .resolves.toMatchObject({ ok: false, reason: 'ORGANIZATION_MISMATCH' })
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('refuses when the relationship cannot be proven', async () => {
    const mapped = eventsAccount({ platformOrganizationId: P_ORG })
    prismaMock.event.findUnique.mockResolvedValueOnce(pulseEvent({}, mapped)).mockResolvedValueOnce(null)
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: P_EVENT, lookupPlatformEvent: async () => null }))
      .resolves.toMatchObject({ ok: false, reason: 'PLATFORM_EVENT_UNVERIFIABLE' })
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('refuses an invalid uuid and a missing local event, selecting by primary key only', async () => {
    await expect(assignPlatformEventMapping({ pulseEventId: 'event_1', platformEventId: 'acme-2026', lookupPlatformEvent: lookupOk })).resolves.toMatchObject({ ok: false, reason: 'INVALID_PLATFORM_ID' })
    prismaMock.event.findUnique.mockResolvedValue(null)
    await expect(assignPlatformEventMapping({ pulseEventId: 'nope', platformEventId: P_EVENT, lookupPlatformEvent: lookupOk })).resolves.toMatchObject({ ok: false, reason: 'PULSE_RECORD_NOT_FOUND' })
    expect(prismaMock.event.findUnique.mock.calls[0][0].where).toEqual({ id: 'nope' })
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it('resolves through the runtime helper once assigned', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 'event_1', name: 'Summit', status: 'ACTIVE', isActive: true, platformEventId: P_EVENT, location: { accountId: 'acct_1', account: { id: 'acct_1', slug: 'events-co', accountType: 'EVENTS', platformOrganizationId: P_ORG } } })
    await expect(resolvePulseEventByPlatformEventId(P_EVENT)).resolves.toMatchObject({ ok: true, value: { id: 'event_1' } })
  })
})

describe('the assignment layer performs no attribute inference at all', () => {
  const sources = ['lib/platform/assign-mapping.ts', 'scripts/assign-platform-mapping.ts'].map((f) => [f, readFileSync(f, 'utf8')] as const)

  it.each(sources)('%s never queries by email, name, slug or domain', (_file, source) => {
    // Any `where` clause keyed on a human attribute would make a display value authoritative.
    for (const pattern of [/where:\s*\{[^}]*\bemail\b/, /where:\s*\{[^}]*\bname\b/, /where:\s*\{[^}]*\bslug\b/, /where:\s*\{[^}]*domain/i, /findFirst/, /findMany/, /contains:/, /startsWith:/, /mode:\s*['"]insensitive/]) {
      expect(source).not.toMatch(pattern)
    }
  })

  it.each(sources)('%s only ever selects a local row by its primary key', (_file, source) => {
    const whereClauses = [...source.matchAll(/where:\s*\{([^}]*)\}/g)].map((m) => m[1].trim())
    for (const clause of whereClauses) {
      // Either the Pulse primary key, or the canonical mapping column when checking
      // whether another row already claims it. Nothing else may select a row.
      expect(clause).toMatch(/^(id:\s*\w+|platformUserId|platformEventId)$/)
    }
  })

  it('the module really does query, so the clause check above is meaningful', () => {
    // Not named `module`: `@next/next/no-assign-module-variable` rejects that, and
    // the monorepo lints this app during `next build`.
    const assignModule = sources.find(([file]) => file.endsWith('assign-mapping.ts'))![1]
    expect([...assignModule.matchAll(/where:\s*\{([^}]*)\}/g)].length).toBeGreaterThanOrEqual(6)
    // the CLI itself issues no queries at all — the strongest form of "no inference"
    const cli = sources.find(([file]) => file.startsWith('scripts/'))![1]
    expect(cli).not.toMatch(/where:\s*\{/)
  })

  it('is never imported by application code — it is administrative tooling only', () => {
    const appSources = ['app', 'components'].flatMap((dir) => {
      const walk = (d: string): string[] => require('node:fs').readdirSync(d, { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean }) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : (/\.tsx?$/.test(e.name) ? [`${d}/${e.name}`] : []))
      return walk(dir)
    })
    const importers = appSources.filter((f) => readFileSync(f, 'utf8').includes('platform/assign-mapping'))
    expect(importers).toEqual([])
  })
})
