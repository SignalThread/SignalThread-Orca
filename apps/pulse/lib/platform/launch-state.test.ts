import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  LAUNCH_STATE_COOKIE,
  LAUNCH_STATE_TTL_SECONDS,
  clearLaunchStateCookie,
  createLaunchState,
  isTopLevelNavigation,
  launchStateCookieSecure,
  launchStateCorrelator,
  launchStateCorrelatorMatches,
  launchStateMatches,
  parseLaunchState,
  readLaunchState,
  serializeLaunchState,
  setLaunchStateCookie,
} from './launch-state'

const EVENT = 'ae9942ba-5759-486b-b591-f1b5ed223370'
const OTHER = '11111111-2222-4333-8444-555555555555'
const NOW = new Date('2026-09-05T12:00:00.000Z')

describe('launch state', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('is unpredictable: 256-bit nonce, unique per launch', () => {
    const a = createLaunchState(EVENT, NOW)
    const b = createLaunchState(EVENT, NOW)
    expect(a.nonce).toMatch(/^[0-9a-f]{64}$/)
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.eventId).toBe(EVENT)
    expect(a.expiresAt).toBe(Math.floor(NOW.getTime() / 1000) + LAUNCH_STATE_TTL_SECONDS)
  })

  it('is short-lived and the expiry is enforced from the embedded timestamp, not the cookie', () => {
    const state = createLaunchState(EVENT, NOW)
    const raw = serializeLaunchState(state)
    expect(parseLaunchState(raw, NOW)).toEqual({ status: 'PRESENT', state })
    expect(parseLaunchState(raw, new Date(NOW.getTime() + (LAUNCH_STATE_TTL_SECONDS - 1) * 1000))).toMatchObject({ status: 'PRESENT' })
    expect(parseLaunchState(raw, new Date(NOW.getTime() + LAUNCH_STATE_TTL_SECONDS * 1000))).toMatchObject({ status: 'EXPIRED' })
    expect(LAUNCH_STATE_TTL_SECONDS).toBeLessThanOrEqual(120)
  })

  it('treats absent, malformed, forged or non-canonical state as unusable', () => {
    const state = createLaunchState(EVENT, NOW)
    expect(parseLaunchState(undefined, NOW)).toEqual({ status: 'MISSING' })
    expect(parseLaunchState('', NOW)).toEqual({ status: 'MISSING' })
    for (const bad of [
      'v0.' + serializeLaunchState(state).slice(3),
      `v1.deadbeef.${EVENT}.${state.expiresAt}`,
      `v1.${state.nonce}.acme-2026.${state.expiresAt}`,
      `v1.${state.nonce}.${EVENT}.later`,
      `v1.${state.nonce}.${EVENT}`,
      serializeLaunchState(state) + '.extra',
    ]) {
      expect(parseLaunchState(bad, NOW), bad).toEqual({ status: 'INVALID' })
    }
  })

  it('is bound to the event the browser launched', () => {
    const state = createLaunchState(EVENT, NOW)
    expect(launchStateMatches(state, EVENT)).toBe(true)
    expect(launchStateMatches(state, EVENT.toUpperCase())).toBe(true)
    expect(launchStateMatches(state, OTHER)).toBe(false)
  })

  it('is written HttpOnly, SameSite=Lax, scoped to /platform-entry, with a short Max-Age', () => {
    const response = new NextResponse(null)
    setLaunchStateCookie(response, createLaunchState(EVENT, NOW))
    const cookie = response.cookies.get(LAUNCH_STATE_COOKIE)
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/platform-entry', maxAge: LAUNCH_STATE_TTL_SECONDS })
    expect(cookie?.value).toMatch(/^v1\.[0-9a-f]{64}\./)
  })

  it('is Secure on HTTPS deployments and clears with the same scope it was written with', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://voice.signalthread.ai')
    expect(launchStateCookieSecure()).toBe(true)
    const response = new NextResponse(null)
    clearLaunchStateCookie(response)
    expect(response.cookies.get(LAUNCH_STATE_COOKIE)).toMatchObject({ value: '', maxAge: 0, path: '/platform-entry', httpOnly: true, secure: true })
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://pulse.localtest.me:3002')
    vi.stubEnv('NODE_ENV', 'development')
    expect(launchStateCookieSecure()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(launchStateCookieSecure()).toBe(true)
  })

  it('reads the state from the request cookie only', () => {
    const state = createLaunchState(EVENT, NOW)
    const withCookie = new NextRequest('https://voice.signalthread.ai/platform-entry', {
      headers: { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}` },
    })
    expect(readLaunchState(withCookie, NOW)).toEqual({ status: 'PRESENT', state })
    const viaQuery = new NextRequest(`https://voice.signalthread.ai/platform-entry?${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}`)
    expect(readLaunchState(viaQuery, NOW)).toEqual({ status: 'MISSING' })
  })

  it('accepts only top-level navigations when the browser says what the request is', () => {
    const nav = (dest?: string) =>
      new NextRequest('https://voice.signalthread.ai/platform-entry', { headers: dest ? { 'sec-fetch-dest': dest } : {} })
    expect(isTopLevelNavigation(nav('document'))).toBe(true)
    expect(isTopLevelNavigation(nav())).toBe(true)
    for (const dest of ['image', 'iframe', 'empty', 'script', 'frame', 'object']) {
      expect(isTopLevelNavigation(nav(dest)), dest).toBe(false)
    }
  })

  describe('the relayed correlator', () => {
    it('is a one-way function of the nonce, so the secret never has to travel', () => {
      const state = createLaunchState(EVENT, NOW)
      const correlator = launchStateCorrelator(state)
      expect(correlator).toMatch(/^[0-9a-f]{64}$/)
      expect(correlator).not.toBe(state.nonce)
      // Stable for the same state, different for another launch.
      expect(launchStateCorrelator(state)).toBe(correlator)
      expect(launchStateCorrelator(createLaunchState(EVENT, NOW))).not.toBe(correlator)
      // It is exactly SHA-256(nonce): Platform relays this value verbatim.
      expect(correlator).toBe(createHash('sha256').update(state.nonce, 'utf8').digest('hex'))
    })

    it('matches only the correlator of that exact state', () => {
      const state = createLaunchState(EVENT, NOW)
      const other = createLaunchState(EVENT, NOW)
      expect(launchStateCorrelatorMatches(state, launchStateCorrelator(state))).toBe(true)
      expect(launchStateCorrelatorMatches(state, launchStateCorrelator(state).toUpperCase())).toBe(true)
      expect(launchStateCorrelatorMatches(state, ` ${launchStateCorrelator(state)} `)).toBe(true)
      expect(launchStateCorrelatorMatches(state, launchStateCorrelator(other))).toBe(false)
    })

    it('refuses the raw nonce, truncations, extensions and anything non-hex', () => {
      const state = createLaunchState(EVENT, NOW)
      const correlator = launchStateCorrelator(state)
      for (const bad of [
        state.nonce,
        correlator.slice(0, 63),
        `${correlator}0`,
        correlator.replace(/^./, 'z'),
        '',
        '   ',
        null,
        undefined,
        42 as unknown as string,
      ]) {
        expect(launchStateCorrelatorMatches(state, bad as string | null | undefined), String(bad)).toBe(false)
      }
    })
  })
})
