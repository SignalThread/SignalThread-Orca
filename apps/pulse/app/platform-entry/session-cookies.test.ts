import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Real Supabase SSR cookie handling through the actual entry route.
 *
 * Only the network edge is faked: `fetch` answers as GoTrue would. Everything
 * between -- the real `@supabase/ssr` server client, its cookie chunking and
 * options, the real `@supabase/supabase-js` admin client, `establishPulseSessionForUser`
 * and the route handler -- runs unmodified. The mapping/authorization layer is
 * replaced by a resolver double because it needs a database; its contract is
 * covered in lib/platform/handoff-entry.test.ts.
 */

const { resolvePlatformEntryMock } = vi.hoisted(() => ({ resolvePlatformEntryMock: vi.fn() }))
vi.mock('@/lib/platform/handoff-entry', () => ({ resolvePlatformEntry: resolvePlatformEntryMock }))

import { NextRequest, NextResponse } from 'next/server'
import { LAUNCH_STATE_COOKIE, createLaunchState, launchStateCorrelator, serializeLaunchState } from '@/lib/platform/launch-state'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { GET } from './route'

const SUPABASE_URL = 'https://tsoquobpingfqezolvgp.supabase.co'
const REF = 'tsoquobpingfqezolvgp'
const TOKEN = 'pkce_0123456789abcdef0123456789abcdef'
const EVENT = 'ae9942ba-5759-486b-b591-f1b5ed223370'
const MAPPED_USER = '88bbd88d-ca23-40d1-8d63-a7d3d312f783'
const MAPPED_EMAIL = 'organizer@example.com'
const VICTIM_USER = '5c1d0d3e-6b7f-4a8c-9d0e-1f2a3b4c5d6e'
const HASHED = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

const b64url = (value: string) => Buffer.from(value).toString('base64url')
function jwtFor(userId: string, email: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ sub: userId, email, aud: 'authenticated', role: 'authenticated', exp, iat: exp - 3600, session_id: 's1' }),
  )}.${b64url('sig')}`
}
function authUser(id: string, email: string) {
  return { id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
}
function sessionFor(id: string, email: string) {
  const access_token = jwtFor(id, email)
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${id.slice(0, 8)}`, user: authUser(id, email) }
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Minimal GoTrue: admin user lookup, magiclink minting, OTP verification, and bearer -> user. */
function fakeGoTrue(calls: string[]) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    const method = (init?.method ?? 'GET').toUpperCase()
    const bearer = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? (init?.headers as Record<string, string> | undefined)?.authorization ?? '')
    calls.push(`${method} ${url.pathname}`)

    if (method === 'GET' && url.pathname === `/auth/v1/admin/users/${MAPPED_USER}`) return json(200, authUser(MAPPED_USER, MAPPED_EMAIL))
    if (method === 'POST' && url.pathname === '/auth/v1/admin/generate_link') {
      const body = JSON.parse(String(init?.body))
      if (body.email !== MAPPED_EMAIL) return json(422, { msg: 'unexpected address' })
      return json(200, { ...authUser(MAPPED_USER, MAPPED_EMAIL), action_link: 'discarded', email_otp: '123456', hashed_token: HASHED, redirect_to: '', verification_type: 'magiclink' })
    }
    if (method === 'POST' && url.pathname === '/auth/v1/verify') {
      const body = JSON.parse(String(init?.body))
      if (body.token_hash !== HASHED || body.type !== 'magiclink') return json(401, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
      return json(200, sessionFor(MAPPED_USER, MAPPED_EMAIL))
    }
    if (method === 'GET' && url.pathname === '/auth/v1/user') {
      const token = bearer.replace(/^Bearer /, '')
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
        return json(200, authUser(payload.sub, payload.email))
      } catch {
        return json(401, { msg: 'invalid token' })
      }
    }
    return json(404, { msg: `unexpected ${method} ${url.pathname}` })
  })
}

function parseSetCookies(response: Response): Array<{ name: string; value: string; raw: string }> {
  const raw = response.headers.get('set-cookie')
  if (!raw) return []
  return raw.split(/,(?=\s*[A-Za-z0-9_.-]+=)/).map((c) => {
    const [pair] = c.trim().split(';')
    const eq = pair.indexOf('=')
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), raw: c.trim() }
  })
}

/** A launch this browser started: cookie plus the correlator Platform relays back. */
function bind() {
  const state = createLaunchState(EVENT)
  return {
    cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}`,
    correlator: launchStateCorrelator(state),
  }
}

function entryRequest(cookie: string, correlator?: string) {
  const params = new URLSearchParams({ handoff: TOKEN, event_id: EVENT })
  if (correlator) params.set('state', correlator)
  return new NextRequest(`https://voice.signalthread.ai/platform-entry?${params.toString()}`, {
    headers: { cookie, 'sec-fetch-dest': 'document' },
  })
}

describe('real Supabase SSR cookies through /platform-entry', () => {
  let calls: string[]

  beforeEach(() => {
    calls = []
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://voice.signalthread.ai')
    vi.stubGlobal('fetch', fakeGoTrue(calls))
    resolvePlatformEntryMock.mockResolvedValue({
      ok: true,
      pulseUserId: MAPPED_USER,
      accountId: 'acct_events_demo',
      accountSlug: 'events-demo',
      eventId: 'event_advanced_demo',
      redirectPath: '/app/events/event_advanced_demo?account=events-demo',
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('a successful handoff writes a real session for the mapped user, and a subsequent organizer request recognizes that user', async () => {
    const launch = bind()
    const response = await GET(entryRequest(launch.cookie, launch.correlator))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/app/events/event_advanced_demo?account=events-demo')

    // The minting side was addressed by id, then by that user's own address, then spent.
    expect(calls).toEqual(expect.arrayContaining([
      `GET /auth/v1/admin/users/${MAPPED_USER}`,
      'POST /auth/v1/admin/generate_link',
      'POST /auth/v1/verify',
    ]))

    const cookies = parseSetCookies(response)
    const session = cookies.filter((c) => c.name.startsWith(`sb-${REF}-auth-token`))
    expect(session.length).toBeGreaterThan(0)
    for (const c of session) {
      expect(c.raw).toMatch(/Path=\//)
      expect(c.raw).toMatch(/SameSite=lax/i)
      expect(c.raw).toMatch(/Secure/)
      expect(c.raw).not.toMatch(/Domain=/)
    }
    // The launch state is spent on the same response.
    expect(cookies.find((c) => c.name === LAUNCH_STATE_COOKIE)?.raw).toMatch(/Max-Age=0/)

    // The value the browser stores is a real @supabase/ssr session for the mapped user.
    const joined = session.sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join('')
    const stored = JSON.parse(Buffer.from(joined.replace(/^base64-/, ''), 'base64').toString('utf8'))
    expect(stored.user.id).toBe(MAPPED_USER)

    // Subsequent organizer request: the browser sends those cookies back, and the
    // real SSR client resolves the same user from them.
    const cookieHeader = session.map((c) => `${c.name}=${c.value}`).join('; ')
    const followUp = new NextRequest('https://voice.signalthread.ai/api/app/account?account=events-demo', { headers: { cookie: cookieHeader } })
    const { data, error } = await createRouteHandlerClient(followUp, NextResponse.next()).auth.getUser()
    expect(error).toBeNull()
    expect(data.user?.id).toBe(MAPPED_USER)
  })

  it('a rejected handoff emits no session cookie and leaves an existing browser session in place', async () => {
    // The browser already holds a real session for a different user.
    const existing = sessionFor(VICTIM_USER, 'victim@example.com')
    const existingCookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(existing)).toString('base64')}`

    // Case 1: no launch state (a shared link, correlator and all) -> bounced, nothing written.
    const attacker = bind()
    const bounced = await GET(entryRequest(existingCookie, attacker.correlator))
    expect(bounced.status).toBe(303)
    expect(bounced.headers.get('location')).toBe(`/platform-entry/start?event_id=${EVENT}`)
    expect(parseSetCookies(bounced).filter((c) => c.name.startsWith('sb-'))).toEqual([])
    expect(calls.filter((c) => c.includes('/auth/v1/'))).toEqual([])

    // Case 2: this browser's own state, but the handoff resolves to a different
    // user than the one it is signed in as -> conflict, nothing written, no minting.
    const own = bind()
    const conflict = await GET(entryRequest(`${existingCookie}; ${own.cookie}`, own.correlator))
    expect(conflict.status).toBe(409)
    expect(parseSetCookies(conflict).filter((c) => c.name.startsWith('sb-'))).toEqual([])
    expect(calls).not.toContain('POST /auth/v1/admin/generate_link')
    expect(calls).not.toContain('POST /auth/v1/verify')

    // The victim's session, replayed on a new request, still resolves to the victim.
    const followUp = new NextRequest('https://voice.signalthread.ai/api/app/account?account=x', { headers: { cookie: existingCookie } })
    const { data } = await createRouteHandlerClient(followUp, NextResponse.next()).auth.getUser()
    expect(data.user?.id).toBe(VICTIM_USER)

    // Case 3: Platform denies the claim -> nothing written either.
    resolvePlatformEntryMock.mockResolvedValueOnce({ ok: false, status: 401, reason: 'HANDOFF_INVALID', hint: 'used' })
    const third = bind()
    const denied = await GET(entryRequest(`${existingCookie}; ${third.cookie}`, third.correlator))
    expect(denied.status).toBe(401)
    expect(parseSetCookies(denied).filter((c) => c.name.startsWith('sb-'))).toEqual([])
  })

  it('a session minted for a different user than the mapped one is never written', async () => {
    // GoTrue answers the verification with somebody else's session.
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
      if (url.pathname === '/auth/v1/verify') return json(200, sessionFor(VICTIM_USER, 'victim@example.com'))
      return fakeGoTrue(calls)(input, init)
    }))
    const launch = bind()
    const response = await GET(entryRequest(launch.cookie, launch.correlator))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ reason: 'SESSION_ESTABLISH_FAILED' })
    expect(parseSetCookies(response).filter((c) => c.name.startsWith('sb-'))).toEqual([])
  })
})
