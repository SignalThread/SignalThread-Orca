import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { LAUNCH_STATE_COOKIE, createLaunchState, launchStateCorrelator, serializeLaunchState } from '@/lib/platform/launch-state'
import { GET } from './route'

const EVENT = 'ae9942ba-5759-486b-b591-f1b5ed223370'
const OTHER = '11111111-2222-4333-8444-555555555555'

function requestFor(query: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://voice.signalthread.ai/platform-entry/start${query}`, { headers })
}

describe('GET /platform-entry/start', () => {
  beforeEach(() => {
    vi.stubEnv('PLATFORM_APP_URL', 'https://app.signalthread.ai')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://voice.signalthread.ai')
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it('first hop: sets fresh launch state and re-enters armed, without contacting Platform', async () => {
    const response = await GET(requestFor(`?event_id=${EVENT}`))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`/platform-entry/start?event_id=${EVENT}&armed=1`)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    const cookie = response.cookies.get(LAUNCH_STATE_COOKIE)
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/platform-entry' })
    expect(cookie?.value).toContain(`.${EVENT}.`)
    // No auth cookie is ever written here.
    expect(response.headers.get('set-cookie')).not.toMatch(/sb-/)
  })

  it('second hop: with readable state, sends the browser to Platform launch carrying this browser\'s correlator', async () => {
    const state = createLaunchState(EVENT)
    const response = await GET(requestFor(`?event_id=${EVENT}&armed=1`, { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}` }))
    expect(response.status).toBe(303)
    const target = new URL(response.headers.get('location')!)
    expect(target.origin + target.pathname).toBe('https://app.signalthread.ai/api/launch/pulse')
    expect(target.searchParams.get('event_id')).toBe(EVENT)
    // What travels is SHA-256(nonce), never the nonce itself.
    expect(target.searchParams.get('state')).toBe(launchStateCorrelator(state))
    expect(response.headers.get('location')).not.toContain(state.nonce)
    // The state is kept for /platform-entry to spend.
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('a different browser gets a different correlator for the same event', () => {
    expect(launchStateCorrelator(createLaunchState(EVENT))).not.toBe(launchStateCorrelator(createLaunchState(EVENT)))
  })

  it('second hop without state fails closed instead of bouncing forever', async () => {
    const response = await GET(requestFor(`?event_id=${EVENT}&armed=1`))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ success: false, reason: 'LAUNCH_STATE_REQUIRED' })
    expect(response.headers.get('location')).toBeNull()
  })

  it('second hop with state for a different event or expired state fails closed and spends it', async () => {
    const mismatched = await GET(requestFor(`?event_id=${EVENT}&armed=1`, { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(createLaunchState(OTHER))}` }))
    expect(mismatched.status).toBe(400)
    expect(mismatched.cookies.get(LAUNCH_STATE_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    const stale = createLaunchState(EVENT, new Date(Date.now() - 10 * 60 * 1000))
    const expired = await GET(requestFor(`?event_id=${EVENT}&armed=1`, { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(stale)}` }))
    expect(expired.status).toBe(400)
  })

  it('the Platform destination comes from configuration, the canonical event id and the cookie correlator only', async () => {
    const state = createLaunchState(EVENT)
    const response = await GET(requestFor(`?event_id=${EVENT}&armed=1&return_to=https://evil.example&next=//evil.example&state=attacker`, {
      cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}`,
    }))
    expect(response.headers.get('location')).toBe(
      `https://app.signalthread.ai/api/launch/pulse?event_id=${EVENT}&state=${launchStateCorrelator(state)}`,
    )
    // A correlator supplied in the request is ignored; only the cookie's counts.
    expect(response.headers.get('location')).not.toContain('attacker')
  })

  it('refuses a non-canonical event id and non-navigation requests', async () => {
    expect((await GET(requestFor('?event_id=acme-2026'))).status).toBe(400)
    expect((await GET(requestFor(''))).status).toBe(400)
    const image = await GET(requestFor(`?event_id=${EVENT}`, { 'sec-fetch-dest': 'image' }))
    expect(image.status).toBe(403)
    await expect(image.json()).resolves.toMatchObject({ reason: 'NOT_A_NAVIGATION' })
    expect(image.headers.get('set-cookie')).toBeNull()
  })

  it('fails closed when Platform is not configured', async () => {
    vi.stubEnv('PLATFORM_APP_URL', '')
    const state = createLaunchState(EVENT)
    const response = await GET(requestFor(`?event_id=${EVENT}&armed=1`, { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}` }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ reason: 'PLATFORM_NOT_CONFIGURED' })
  })
})
