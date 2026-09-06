import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { claimPlatformHandoff } from '@/lib/platform/platform-claim-client'

/**
 * Replay / expiry / tamper / wrong-product / context-substitution coverage against
 * the REAL Platform claim implementation (`POST /api/launch/pulse/claim`) and the
 * real Platform Core Auth project, through Pulse's real claim client.
 *
 * This is a test harness, not runtime code: the Platform Core service-role key is
 * used here only to mint handoffs the way Platform's launch endpoint does. Pulse's
 * runtime never sees it. Skipped unless the harness is configured:
 *
 *   PLATFORM_HANDOFF_INTEGRATION=1
 *   PLATFORM_APP_URL                            a running Platform (e.g. http://platform.localtest.me:3001)
 *   HARNESS_PLATFORM_CORE_SUPABASE_URL          Platform Core project URL
 *   HARNESS_PLATFORM_CORE_SERVICE_ROLE_KEY      Platform Core service-role key (minting only)
 *   HARNESS_PLATFORM_USER_ID                    a Platform user with an ACTIVE `pulse` entitlement
 *   HARNESS_PLATFORM_EVENT_ID                   an ACTIVE event owned by that user's organization
 *   HARNESS_HANDOFF_MAX_AGE_SECONDS             the HANDOFF_MAX_AGE_SECONDS the Platform was started
 *                                               with; the expiry case runs only when it is <= 10
 */
const enabled = process.env.PLATFORM_HANDOFF_INTEGRATION === '1'
const describeHarness = enabled ? describe : describe.skip

const env = () => ({ PLATFORM_APP_URL: process.env.PLATFORM_APP_URL, NODE_ENV: 'test' }) as unknown as NodeJS.ProcessEnv
const platformUrl = () => (process.env.PLATFORM_APP_URL ?? '').replace(/\/$/, '')

describeHarness('Platform claim path (real Platform + Platform Core Auth)', () => {
  const userId = process.env.HARNESS_PLATFORM_USER_ID ?? ''
  const eventId = process.env.HARNESS_PLATFORM_EVENT_ID ?? ''
  const maxAge = Number(process.env.HARNESS_HANDOFF_MAX_AGE_SECONDS ?? '300')
  let email = ''
  let admin: ReturnType<typeof createClient>

  /** Exactly what Platform's launch endpoint does after authorizing: mint a magiclink hashed_token. */
  async function mintHandoff(): Promise<string> {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (error || !data.properties?.hashed_token) throw new Error('mint failed')
    return data.properties.hashed_token
  }

  async function rawClaim(product: string, handoff: string, event: string) {
    const response = await fetch(`${platformUrl()}/api/launch/${product}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoff, event_id: event }),
    })
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null }
  }

  beforeAll(async () => {
    const url = process.env.HARNESS_PLATFORM_CORE_SUPABASE_URL
    const key = process.env.HARNESS_PLATFORM_CORE_SERVICE_ROLE_KEY
    if (!url || !key || !userId || !eventId) throw new Error('harness not configured')
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user?.email) throw new Error('harness user lookup failed')
    email = data.user.email
  }, 30_000)

  it('first valid claim succeeds and returns the canonical context; a replay of the same token fails', async () => {
    const handoff = await mintHandoff()
    const first = await claimPlatformHandoff({ handoff, eventId }, { env: env() })
    expect(first).toMatchObject({ ok: true, context: { platformUserId: userId, platformEventId: eventId } })
    expect(first.ok && first.context.platformOrganizationId).toMatch(/^[0-9a-f-]{36}$/)

    const replay = await claimPlatformHandoff({ handoff, eventId }, { env: env() })
    expect(replay).toEqual({ ok: false, reason: 'HANDOFF_INVALID', platformReason: 'HANDOFF_INVALID' })
  }, 30_000)

  it('a tampered token fails and does not consume the real one', async () => {
    const handoff = await mintHandoff()
    const tampered = handoff.slice(0, -1) + (handoff.endsWith('a') ? 'b' : 'a')
    expect(await claimPlatformHandoff({ handoff: tampered, eventId }, { env: env() })).toMatchObject({ ok: false, reason: 'HANDOFF_INVALID' })
    expect(await claimPlatformHandoff({ handoff: `${handoff}&x=1`, eventId }, { env: env() })).toMatchObject({ ok: false })
    // The genuine token is still intact and redeemable exactly once.
    expect((await claimPlatformHandoff({ handoff, eventId }, { env: env() })).ok).toBe(true)
  }, 30_000)

  it('a wrong product cannot consume the token, and the refusal happens before any exchange', async () => {
    const handoff = await mintHandoff()
    expect(await rawClaim('orca', handoff, eventId)).toMatchObject({ status: 400, body: { reason: 'INVALID_REQUEST' } })
    expect(await rawClaim('housing', handoff, eventId)).toMatchObject({ status: 400, body: { reason: 'INVALID_REQUEST' } })
    // Still redeemable for Pulse afterwards, then spent.
    expect((await claimPlatformHandoff({ handoff, eventId }, { env: env() })).ok).toBe(true)
    expect(await rawClaim('pulse', handoff, eventId)).toMatchObject({ status: 401, body: { reason: 'HANDOFF_INVALID' } })
  }, 30_000)

  it('event/context substitution is refused by Platform re-authorization and spends the token', async () => {
    const handoff = await mintHandoff()
    const foreign = '11111111-2222-4333-8444-555555555555'
    const swapped = await claimPlatformHandoff({ handoff, eventId: foreign }, { env: env() })
    expect(swapped).toEqual({ ok: false, reason: 'PLATFORM_DENIED', platformReason: 'EVENT_NOT_FOUND' })
    // The token was verified (and therefore consumed) before authorization denied it.
    expect(await claimPlatformHandoff({ handoff, eventId }, { env: env() })).toMatchObject({ ok: false, reason: 'HANDOFF_INVALID' })
  }, 30_000)

  it('an organization id in the claim body is ignored', async () => {
    const handoff = await mintHandoff()
    const response = await fetch(`${platformUrl()}/api/launch/pulse/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoff, event_id: eventId, organization_id: '9d2a1c3e-1111-4222-8333-444455556666', product: 'orca' }),
    })
    const body = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(body.product).toBe('pulse')
    expect(body.organization_id).not.toBe('9d2a1c3e-1111-4222-8333-444455556666')
  }, 30_000)

  const expiryIt = maxAge <= 10 ? it : it.skip
  expiryIt('an expired token (older than the Platform freshness bound) fails even though it was never used', async () => {
    const handoff = await mintHandoff()
    await new Promise((resolve) => setTimeout(resolve, (maxAge + 1) * 1000))
    const late = await claimPlatformHandoff({ handoff, eventId }, { env: env() })
    expect(late).toEqual({ ok: false, reason: 'HANDOFF_EXPIRED', platformReason: 'HANDOFF_EXPIRED' })
  }, 60_000)
})
