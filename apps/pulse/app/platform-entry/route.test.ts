import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { resolvePlatformEntryMock, establishSessionMock, existingSessionMock } = vi.hoisted(() => ({
  resolvePlatformEntryMock: vi.fn(),
  establishSessionMock: vi.fn(),
  existingSessionMock: vi.fn(),
}))

vi.mock('@/lib/platform/handoff-entry', () => ({ resolvePlatformEntry: resolvePlatformEntryMock }))
vi.mock('@/lib/platform/establish-session', () => ({ establishPulseSessionForUser: establishSessionMock }))
vi.mock('@/lib/platform/existing-session', () => ({ readExistingPulseSessionUserId: existingSessionMock }))

import { NextRequest } from 'next/server'
import { LAUNCH_STATE_COOKIE, createLaunchState, launchStateCorrelator, serializeLaunchState } from '@/lib/platform/launch-state'
import { GET } from './route'

const TOKEN = 'pkce_0123456789abcdef0123456789abcdef'
const EVENT = 'ae9942ba-5759-486b-b591-f1b5ed223370'
const OTHER_EVENT = '11111111-2222-4333-8444-555555555555'
const PULSE_USER = '88bbd88d-ca23-40d1-8d63-a7d3d312f783'
const VICTIM_USER = '5c1d0d3e-6b7f-4a8c-9d0e-1f2a3b4c5d6e'
/** A pre-existing Pulse session cookie, as a victim browser would hold. */
const VICTIM_SESSION_COOKIE = 'sb-tsoquobpingfqezolvgp-auth-token=base64-victimsession'

/**
 * One launch, as a browser holds it: the secret nonce in the cookie, and the
 * correlator that travels to Platform and comes back on the redirect.
 */
function bind(eventId = EVENT, at = new Date()) {
  const state = createLaunchState(eventId, at)
  return {
    cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}`,
    correlator: launchStateCorrelator(state),
  }
}

function query(correlator?: string | null, eventId = EVENT) {
  const params = new URLSearchParams({ handoff: TOKEN, event_id: eventId })
  if (correlator) params.set('state', correlator)
  return `?${params.toString()}`
}

function requestFor(queryString: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://voice.signalthread.ai/platform-entry${queryString}`, { headers })
}

/** Set-Cookie headers of a response, split into individual cookies. */
function setCookies(response: Response): string[] {
  const raw = response.headers.get('set-cookie')
  return raw ? raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/).map((c) => c.trim()) : []
}
const authCookies = (response: Response) => setCookies(response).filter((c) => /^sb-/.test(c))

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('GET /platform-entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://voice.signalthread.ai')
    resolvePlatformEntryMock.mockResolvedValue({
      ok: true,
      pulseUserId: PULSE_USER,
      accountId: 'acct_events_demo',
      accountSlug: 'events-demo',
      eventId: 'event_advanced_demo',
      redirectPath: '/app/events/event_advanced_demo?account=events-demo',
    })
    establishSessionMock.mockResolvedValue({ ok: true, userId: PULSE_USER })
    existingSessionMock.mockResolvedValue(null)
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it('1. normal launch: matching cookie and relayed correlator → claim, session for the mapped user, state spent, redirect', async () => {
    const launch = bind()
    const response = await GET(requestFor(query(launch.correlator), { cookie: launch.cookie, 'sec-fetch-dest': 'document' }))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/app/events/event_advanced_demo?account=events-demo')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(resolvePlatformEntryMock).toHaveBeenCalledWith({ handoff: TOKEN, eventId: EVENT })
    expect(establishSessionMock).toHaveBeenCalledWith(PULSE_USER, expect.anything(), response)
    expect(response.cookies.get(LAUNCH_STATE_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
  })

  describe('login CSRF / session replacement: only the browser that started the launch may redeem it', () => {
    it('2. attacker A\'s valid handoff AND correlator, opened in browser B: rejected, B\'s session preserved, no auth cookies', async () => {
      // A completed a real launch, so A holds a genuine handoff and the genuine
      // correlator Platform relayed. A sends that whole URL to B. B has its own
      // Pulse session and no launch state for it.
      const attacker = bind()
      const response = await GET(requestFor(query(attacker.correlator), { cookie: VICTIM_SESSION_COOKIE, 'sec-fetch-dest': 'document' }))

      expect(response.headers.get('location')).toBe(`/platform-entry/start?event_id=${EVENT}`)
      expect(response.headers.get('location')?.startsWith('/app')).toBe(false)
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
      expect(establishSessionMock).not.toHaveBeenCalled()
      expect(authCookies(response)).toEqual([])
      expect(setCookies(response).every((c) => c.startsWith(`${LAUNCH_STATE_COOKIE}=`))).toBe(true)
    })

    it('3. wrong state: B holds its own launch state, but the relayed correlator is A\'s', async () => {
      const victim = bind()
      const attacker = bind()
      expect(attacker.correlator).not.toBe(victim.correlator)
      const response = await GET(requestFor(query(attacker.correlator), { cookie: `${VICTIM_SESSION_COOKIE}; ${victim.cookie}`, 'sec-fetch-dest': 'document' }))
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({ success: false, reason: 'LAUNCH_STATE_MISMATCH' })
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
      expect(establishSessionMock).not.toHaveBeenCalled()
      expect(authCookies(response)).toEqual([])
      expect(response.cookies.get(LAUNCH_STATE_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    })

    it('3b. a correlator that is close but not equal, or malformed, is refused', async () => {
      const launch = bind()
      const flipped = launch.correlator.slice(0, -1) + (launch.correlator.endsWith('a') ? 'b' : 'a')
      for (const candidate of [flipped, launch.correlator.slice(0, 63), `${launch.correlator}0`, launch.correlator.toUpperCase().slice(0, 32), 'not-hex']) {
        const response = await GET(requestFor(query(candidate), { cookie: launch.cookie }))
        expect(response.status, candidate).toBe(403)
        await expect(response.json()).resolves.toMatchObject({ reason: 'LAUNCH_STATE_MISMATCH' })
      }
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
    })

    it('4. missing state: a handoff with no relayed correlator is refused even with a valid cookie', async () => {
      const launch = bind()
      const response = await GET(requestFor(query(null), { cookie: `${VICTIM_SESSION_COOKIE}; ${launch.cookie}`, 'sec-fetch-dest': 'document' }))
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({ success: false, reason: 'LAUNCH_STATE_MISSING' })
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
      expect(establishSessionMock).not.toHaveBeenCalled()
      expect(authCookies(response)).toEqual([])
      expect(response.cookies.get(LAUNCH_STATE_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    })

    it('5. expired state: a correct correlator does not help once the cookie has aged out', async () => {
      const stale = bind(EVENT, new Date(Date.now() - 10 * 60 * 1000))
      const response = await GET(requestFor(query(stale.correlator), { cookie: stale.cookie, 'sec-fetch-dest': 'document' }))
      expect(response.headers.get('location')).toBe(`/platform-entry/start?event_id=${EVENT}`)
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
      expect(authCookies(response)).toEqual([])
    })

    it('6. replay: the same URL a second time, after the state cookie was spent, redeems nothing', async () => {
      const launch = bind()
      const first = await GET(requestFor(query(launch.correlator), { cookie: launch.cookie, 'sec-fetch-dest': 'document' }))
      expect(first.status).toBe(303)
      expect(first.cookies.get(LAUNCH_STATE_COOKIE)).toMatchObject({ value: '', maxAge: 0 })

      // The browser honoured Max-Age=0, so the replay arrives with no state.
      vi.clearAllMocks()
      const replay = await GET(requestFor(query(launch.correlator), { 'sec-fetch-dest': 'document' }))
      expect(replay.headers.get('location')).toBe(`/platform-entry/start?event_id=${EVENT}`)
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
      expect(establishSessionMock).not.toHaveBeenCalled()
      expect(authCookies(replay)).toEqual([])
    })

    it('6b. even if a browser retained the state cookie, the one-time handoff itself is already spent', async () => {
      // Platform answers a replayed token with HANDOFF_INVALID; Pulse surfaces it
      // without touching a session.
      resolvePlatformEntryMock.mockResolvedValue({ ok: false, status: 401, reason: 'HANDOFF_INVALID', hint: 'used', platformReason: 'HANDOFF_INVALID' })
      const launch = bind()
      const response = await GET(requestFor(query(launch.correlator), { cookie: launch.cookie }))
      expect(response.status).toBe(401)
      expect(establishSessionMock).not.toHaveBeenCalled()
      expect(authCookies(response)).toEqual([])
    })

    it('state cannot arrive from anywhere but the cookie plus the relayed parameter', async () => {
      const launch = bind()
      // A correlator in the URL with no cookie: bounced, never redeemed.
      const noCookie = await GET(requestFor(query(launch.correlator)))
      expect(noCookie.headers.get('location')).toBe(`/platform-entry/start?event_id=${EVENT}`)
      // The raw nonce is never accepted in place of the correlator.
      const state = createLaunchState(EVENT)
      const rawNonce = await GET(requestFor(query(state.nonce), { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}` }))
      expect(rawNonce.status).toBe(403)
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
    })

    it('state for another event is refused even when the correlator matches that state', async () => {
      const other = bind(OTHER_EVENT)
      const response = await GET(requestFor(query(other.correlator), { cookie: other.cookie }))
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({ reason: 'LAUNCH_STATE_MISMATCH' })
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
    })

    it('forged cookie state is refused', async () => {
      const response = await GET(requestFor(query('0'.repeat(64)), { cookie: `${LAUNCH_STATE_COOKIE}=v1.notahexnonce.${EVENT}.9999999999` }))
      expect(response.status).toBe(403)
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
    })

    it('a subresource request (image/iframe/fetch) can neither redeem nor plant state', async () => {
      const launch = bind()
      for (const dest of ['image', 'iframe', 'empty']) {
        const response = await GET(requestFor(query(launch.correlator), { cookie: launch.cookie, 'sec-fetch-dest': dest }))
        expect(response.status, dest).toBe(403)
        await expect(response.json()).resolves.toMatchObject({ reason: 'NOT_A_NAVIGATION' })
        expect(response.headers.get('set-cookie')).toBeNull()
      }
      expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
    })

    it('never silently replaces a different user\'s live Pulse session', async () => {
      existingSessionMock.mockResolvedValue(VICTIM_USER)
      const launch = bind()
      const response = await GET(requestFor(query(launch.correlator), { cookie: `${VICTIM_SESSION_COOKIE}; ${launch.cookie}` }))
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Conflict', reason: 'SESSION_CONFLICT' })
      expect(establishSessionMock).not.toHaveBeenCalled()
      expect(authCookies(response)).toEqual([])
    })

    it('re-launching as the same user the browser already holds proceeds', async () => {
      existingSessionMock.mockResolvedValue(PULSE_USER)
      const launch = bind()
      const response = await GET(requestFor(query(launch.correlator), { cookie: launch.cookie }))
      expect(response.status).toBe(303)
      expect(establishSessionMock).toHaveBeenCalled()
    })

    it('9. the relayed state never influences which user, org, event or product is used', async () => {
      // Whatever correlator is presented, the only thing Pulse acts on is the
      // handoff and the canonical event; the claim call is byte-identical.
      const launch = bind()
      await GET(requestFor(query(launch.correlator), { cookie: launch.cookie }))
      expect(resolvePlatformEntryMock).toHaveBeenCalledWith({ handoff: TOKEN, eventId: EVENT })
      expect(resolvePlatformEntryMock).toHaveBeenCalledTimes(1)
      const call = resolvePlatformEntryMock.mock.calls[0][0] as Record<string, unknown>
      expect(Object.keys(call).sort()).toEqual(['eventId', 'handoff'])
      expect(JSON.stringify(call)).not.toContain(launch.correlator)
    })
  })

  it('returns the resolver denial verbatim, spends the state, and opens no session', async () => {
    resolvePlatformEntryMock.mockResolvedValue({ ok: false, status: 403, reason: 'PLATFORM_USER_NOT_MAPPED', hint: 'not linked' })
    const launch = bind()
    const response = await GET(requestFor(query(launch.correlator), { cookie: `${VICTIM_SESSION_COOKIE}; ${launch.cookie}` }))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Forbidden', reason: 'PLATFORM_USER_NOT_MAPPED', hint: 'not linked' })
    expect(response.headers.get('location')).toBeNull()
    expect(establishSessionMock).not.toHaveBeenCalled()
    expect(authCookies(response)).toEqual([])
    expect(response.cookies.get(LAUNCH_STATE_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
  })

  it('surfaces an invalid, expired or replayed handoff as 401 with no redirect to the legacy login', async () => {
    resolvePlatformEntryMock.mockResolvedValue({ ok: false, status: 401, reason: 'HANDOFF_INVALID', hint: 'used', platformReason: 'HANDOFF_INVALID' })
    const launch = bind()
    const response = await GET(requestFor(query(launch.correlator), { cookie: launch.cookie }))
    expect(response.status).toBe(401)
    expect(response.headers.get('location')).toBeNull()
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized', reason: 'HANDOFF_INVALID', platformReason: 'HANDOFF_INVALID' })
  })

  it('fails closed when the Pulse session cannot be opened for the resolved user', async () => {
    establishSessionMock.mockResolvedValue({ ok: false, reason: 'AUTH_IDENTITY_MISSING' })
    const launch = bind()
    const response = await GET(requestFor(query(launch.correlator), { cookie: launch.cookie }))
    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
    await expect(response.json()).resolves.toMatchObject({ success: false, reason: 'AUTH_IDENTITY_MISSING' })
    expect(authCookies(response)).toEqual([])
  })

  it('rejects missing or malformed parameters before touching state or Platform', async () => {
    const launch = bind()
    for (const queryString of ['', `?handoff=${TOKEN}`, `?event_id=${EVENT}`, `?handoff=${TOKEN}&event_id=acme-2026`]) {
      const response = await GET(requestFor(queryString, { cookie: launch.cookie }))
      expect(response.status, queryString).toBe(400)
      expect(response.headers.get('set-cookie')).toBeNull()
    }
    expect(resolvePlatformEntryMock).not.toHaveBeenCalled()
  })

  describe('exception boundary: unexpected failures fail closed, sanitized, cookie-free', () => {
    const cases: Array<[string, () => void]> = [
      ['mapping resolver throws', () => resolvePlatformEntryMock.mockRejectedValue(new Error('PrismaClientKnownRequestError: connect ECONNREFUSED db.internal:5432 password=hunter2'))],
      ['claim client throws', () => resolvePlatformEntryMock.mockRejectedValue(new TypeError('fetch failed: getaddrinfo ENOTFOUND app.signalthread.ai'))],
      ['Pulse session creation throws', () => establishSessionMock.mockRejectedValue(new Error('AuthApiError: service_role key rejected'))],
      ['existing-session reader throws', () => existingSessionMock.mockRejectedValue(new Error('cookie parse failure'))],
    ]
    it.each(cases)('%s', async (_label, arrange) => {
      arrange()
      const launch = bind()
      const response = await GET(requestFor(query(launch.correlator), { cookie: `${VICTIM_SESSION_COOKIE}; ${launch.cookie}` }))
      expect(response.status).toBe(500)
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(response.headers.get('referrer-policy')).toBe('no-referrer')
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('set-cookie')).toBeNull()
      const body = await response.text()
      expect(JSON.parse(body)).toEqual({
        success: false,
        error: 'Unavailable',
        reason: 'INTERNAL_ERROR',
        hint: 'Pulse could not complete this launch. Open Pulse from Platform again.',
      })
      expect(body).not.toMatch(/Prisma|ECONNREFUSED|hunter2|ENOTFOUND|service_role|AuthApiError|parse failure|stack/i)
    })
  })
})

describe('Platform entry boundaries (source guard)', () => {
  const ROUTE = read('app/platform-entry/route.ts')
  const START = read('app/platform-entry/start/route.ts')
  const ENTRY = read('lib/platform/handoff-entry.ts')
  const CLIENT = read('lib/platform/platform-claim-client.ts')
  const SESSION = read('lib/platform/establish-session.ts')
  const STATE = read('lib/platform/launch-state.ts')
  const EXISTING = read('lib/platform/existing-session.ts')

  const codeOnly = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')

  it('has no fallback to email, name, slug, contact address or the legacy link-user flow', () => {
    for (const source of [ROUTE, START, ENTRY]) {
      const code = codeOnly(source)
      expect(code).not.toMatch(/linkAuthenticatedUser|link-user|PendingProvision|pendingProvision|SUPER_ADMIN_EMAILS|emailsMatch/)
      expect(code).not.toMatch(/where:\s*\{\s*(email|slug|name)\b/)
      expect(code).not.toMatch(/\/login/)
    }
    expect(ENTRY).toContain('resolvePulseUserByPlatformUserId')
    expect(ENTRY).toContain('resolvePulseAccountByPlatformOrganizationId')
    expect(ENTRY).toContain('resolvePulseEventByPlatformEventId')
    expect(ENTRY).toContain("from '@/lib/auth/account-access'")
    expect(ENTRY).toMatch(/canAccessAccount\(user\.value\.id, account\.value\.id\)/)
  })

  it('never touches Platform Core credentials or Platform data directly', () => {
    for (const source of [ROUTE, START, ENTRY, CLIENT, SESSION, STATE, EXISTING]) {
      expect(source).not.toMatch(/PLATFORM_CORE_SERVICE_ROLE_KEY|PLATFORM_CORE_SUPABASE|wtbnpeluwhjjqccdofxd/)
      expect(source).not.toMatch(/organization_memberships|organization_product_entitlements/)
    }
    expect(CLIENT).toMatch(/\/api\/launch\/\$\{PULSE_PRODUCT_KEY\}\/claim/)
  })

  it('keeps the service-role key server-side and binds the session to the user id, not the address', () => {
    expect(SESSION).toContain("from '@/lib/supabase/admin'")
    expect(SESSION).toMatch(/getUserById\(userId\)/)
    expect(SESSION).toMatch(/link\.user\?\.id !== userId/)
    expect(SESSION).toMatch(/session\.user\?\.id !== userId/)
    expect(codeOnly(SESSION)).not.toMatch(/createUser|inviteUserByEmail|updateUserById/)
    expect(codeOnly(ROUTE + START + ENTRY + CLIENT + SESSION + STATE + EXISTING)).not.toMatch(/console\.(log|info|warn|error|debug)/)
  })

  it('only the correlator ever leaves the server; the nonce stays in the cookie', () => {
    // The launch URL is built from the correlator, never from the raw nonce.
    expect(START).toMatch(/buildPlatformLaunchUrl\(canonicalEventId, launchStateCorrelator\(launch\.state\)\)/)
    expect(codeOnly(START)).not.toMatch(/\.nonce/)
    expect(codeOnly(ROUTE)).not.toMatch(/\.nonce/)
    // The correlator is a one-way function of the nonce, compared in constant time.
    expect(STATE).toMatch(/createHash\('sha256'\)/)
    expect(STATE).toMatch(/timingSafeEqual/)
  })

  it('checks browser state and the relayed correlator before claiming, and opens the session last', () => {
    const stateAt = ROUTE.indexOf('readLaunchState(request)')
    const correlatorAt = ROUTE.indexOf('launchStateCorrelatorMatches(')
    const resolveAt = ROUTE.indexOf('resolvePlatformEntry(')
    const denyAt = ROUTE.indexOf('if (!entry.ok)')
    const conflictAt = ROUTE.indexOf('readExistingPulseSessionUserId(request)')
    const sessionAt = ROUTE.indexOf('establishPulseSessionForUser(')
    expect(stateAt).toBeGreaterThan(0)
    expect(correlatorAt).toBeGreaterThan(stateAt)
    expect(resolveAt).toBeGreaterThan(correlatorAt)
    expect(denyAt).toBeGreaterThan(resolveAt)
    expect(conflictAt).toBeGreaterThan(denyAt)
    expect(sessionAt).toBeGreaterThan(conflictAt)
    expect(ROUTE).toMatch(/return await handle\(request\)/)
    expect(ROUTE).toMatch(/INTERNAL_ERROR/)
    expect(START).toMatch(/INTERNAL_ERROR/)
  })

  it('redirects only to relative product paths or the configured Platform launch, never to request-supplied targets', () => {
    expect(codeOnly(ROUTE)).not.toMatch(/searchParams\.get\(['"](next|return_to|redirect|returnTo)['"]\)/)
    expect(codeOnly(START)).not.toMatch(/searchParams\.get\(['"](next|return_to|redirect|returnTo)['"]\)/)
    expect(ENTRY).toMatch(/\/app\/events\/\$\{encodeURIComponent\(eventId\)\}/)
  })

  it('the existing-session reader can never write a cookie', () => {
    expect(EXISTING).toMatch(/set\(\)\s*\{[^}]*\}/)
    expect(codeOnly(EXISTING)).not.toMatch(/response\.cookies|cookies\(\)/)
  })

  it('leaves every public attendee capability independent of the Platform handoff', () => {
    const publicRoutes = [
      'app/api/response/create/route.ts',
      'app/api/response/[responseId]/complete/route.ts',
      'app/api/kiosk/event-details/route.ts',
      'app/api/answer/presign/route.ts',
      'app/api/answer/complete/route.ts',
      'app/api/answer/confirm/route.ts',
      'app/api/answer/text/route.ts',
      'app/api/answer/structured/route.ts',
      'app/api/tts/route.ts',
      'app/api/app/logo/route.ts',
      'app/kiosk/page.tsx',
      'middleware.ts',
    ]
    for (const relativePath of publicRoutes) {
      const source = read(relativePath)
      expect(source, `${relativePath} must not depend on the Platform handoff`).not.toMatch(/@\/lib\/platform\/|platform-entry|PLATFORM_APP_URL/)
    }
  })
})
