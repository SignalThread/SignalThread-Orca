import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { isCanonicalPlatformId } from '@/lib/platform/identity-mapping'

/**
 * Browser-bound launch state for the Platform -> Pulse handoff.
 *
 * A Platform handoff is a bearer token: whoever redeems it gets a Pulse session
 * for the user it was minted for. Without a browser binding that is a login-CSRF /
 * session-replacement vector: user A obtains a valid handoff for A's own account,
 * sends the URL to user B, and B's browser silently becomes A. This module makes
 * redemption conditional on state that *this browser* established before the
 * handoff was accepted:
 *
 *   /platform-entry (no state)        -> 303 /platform-entry/start?event_id=…
 *   /platform-entry/start             -> set state cookie; 303 …&armed=1
 *   /platform-entry/start?armed=1     -> cookie readable; 303 Platform launch ?…&state=<correlator>
 *   Platform authorizes, mints a NEW handoff, echoes the correlator back unchanged
 *   /platform-entry (state + handoff) -> correlator must match this browser's cookie, then redeem
 *
 * Two values, deliberately: the **secret** (`nonce`) never leaves the HttpOnly
 * cookie, and what travels through Platform and back in URLs is the **correlator**
 * `SHA-256(nonce)`. A leaked launch URL therefore reveals nothing that would let
 * anyone construct matching browser state, and Platform -- which sees only the
 * correlator -- could not forge one either. The comparison on return is
 * length-checked and timing-safe.
 *
 * Properties:
 *   - unpredictable: a 256-bit nonce per launch
 *   - short-lived: 120 seconds, enforced server-side from the embedded expiry,
 *     independent of the cookie's own Max-Age
 *   - bound to the event the browser launched, which Platform echoes back after
 *     re-authorizing it
 *   - one-time: cleared on every terminal response (redeem, reject, re-arm)
 *   - HttpOnly, SameSite=Lax, Secure on HTTPS deployments, scoped to /platform-entry
 *   - only navigations may create or spend it: a request whose Sec-Fetch-Dest is
 *     not `document` (image, iframe, fetch) is refused, so a cross-site page cannot
 *     plant or consume launch state through a subresource
 *
 * What it does NOT do: it carries no authority. Query-string secrecy is not relied
 * upon anywhere -- the handoff still has to be verified by Platform, mapped, and
 * authorized by Pulse -- and a valid state cookie without a valid handoff opens
 * nothing.
 */

export const LAUNCH_STATE_COOKIE = 'pulse_platform_launch'
export const LAUNCH_STATE_PATH = '/platform-entry'
export const LAUNCH_STATE_TTL_SECONDS = 120
const STATE_VERSION = 'v1'
const NONCE_HEX = /^[0-9a-f]{64}$/

export type LaunchState = { nonce: string; eventId: string; expiresAt: number }

export type LaunchStateRead =
  | { status: 'PRESENT'; state: LaunchState }
  | { status: 'MISSING' }
  | { status: 'EXPIRED'; state: LaunchState }
  | { status: 'INVALID' }

export function createLaunchState(eventId: string, now: Date = new Date()): LaunchState {
  return {
    nonce: randomBytes(32).toString('hex'),
    eventId: eventId.trim().toLowerCase(),
    expiresAt: Math.floor(now.getTime() / 1000) + LAUNCH_STATE_TTL_SECONDS,
  }
}

export function serializeLaunchState(state: LaunchState): string {
  return [STATE_VERSION, state.nonce, state.eventId, String(state.expiresAt)].join('.')
}

export function parseLaunchState(raw: string | undefined | null, now: Date = new Date()): LaunchStateRead {
  if (raw === undefined || raw === null || raw === '') return { status: 'MISSING' }
  const parts = raw.split('.')
  if (parts.length !== 4 || parts[0] !== STATE_VERSION) return { status: 'INVALID' }
  const [, nonce, eventId, expires] = parts
  if (!NONCE_HEX.test(nonce) || !isCanonicalPlatformId(eventId) || !/^\d{1,12}$/.test(expires)) {
    return { status: 'INVALID' }
  }
  const state: LaunchState = { nonce, eventId: eventId.toLowerCase(), expiresAt: Number(expires) }
  if (state.expiresAt * 1000 <= now.getTime()) return { status: 'EXPIRED', state }
  return { status: 'PRESENT', state }
}

/**
 * Secure when the deployment is served over HTTPS. Derived from the app's own URL
 * rather than NODE_ENV alone so a local production build over plain HTTP still
 * receives a usable cookie; production is HTTPS and always gets Secure.
 */
export function launchStateCookieSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) {
    try {
      return new URL(appUrl).protocol === 'https:'
    } catch {
      // Malformed: fall through to the environment check.
    }
  }
  return env.NODE_ENV === 'production'
}

export function setLaunchStateCookie(response: NextResponse, state: LaunchState): void {
  response.cookies.set({
    name: LAUNCH_STATE_COOKIE,
    value: serializeLaunchState(state),
    path: LAUNCH_STATE_PATH,
    httpOnly: true,
    sameSite: 'lax',
    secure: launchStateCookieSecure(),
    maxAge: LAUNCH_STATE_TTL_SECONDS,
  })
}

/** One-time: spend or discard the state with exactly the scope it was written with. */
export function clearLaunchStateCookie(response: NextResponse): void {
  response.cookies.set({
    name: LAUNCH_STATE_COOKIE,
    value: '',
    path: LAUNCH_STATE_PATH,
    httpOnly: true,
    sameSite: 'lax',
    secure: launchStateCookieSecure(),
    maxAge: 0,
  })
}

export function readLaunchState(request: NextRequest, now: Date = new Date()): LaunchStateRead {
  return parseLaunchState(request.cookies.get(LAUNCH_STATE_COOKIE)?.value, now)
}

/**
 * True only for top-level navigations. Modern browsers send Sec-Fetch-Dest on
 * every request; a value other than `document` means an <img>, <iframe>, fetch()
 * or similar, none of which may create or spend launch state. Clients that do not
 * send the header at all (older browsers, curl) are allowed through: the header is
 * a defence a browser opts into, not a credential.
 */
export function isTopLevelNavigation(request: NextRequest): boolean {
  const dest = request.headers.get('sec-fetch-dest')
  return dest === null || dest.toLowerCase() === 'document'
}

/** The state matches this redemption only if it was created for the same event and is unexpired. */
export function launchStateMatches(state: LaunchState, eventId: string): boolean {
  return state.eventId === eventId.trim().toLowerCase()
}

/**
 * The public correlator for a launch: `SHA-256(nonce)`, lowercase hex.
 *
 * This is the only part of the launch state that is allowed to travel. It is sent
 * to Platform, relayed through authorization untouched, and echoed back on the
 * handoff redirect. Knowing it does not reveal the nonce, so it cannot be turned
 * into a cookie that would satisfy `launchStateCorrelatorMatches` in another
 * browser.
 */
export function launchStateCorrelator(state: LaunchState): string {
  return createHash('sha256').update(state.nonce, 'utf8').digest('hex')
}

const CORRELATOR_HEX = /^[0-9a-f]{64}$/

/**
 * True when the correlator returned by Platform belongs to this browser's launch
 * state. Compared in constant time, after a length and shape check, so a mismatch
 * leaks nothing about how much of the value was right.
 */
export function launchStateCorrelatorMatches(state: LaunchState, returned: string | null | undefined): boolean {
  if (typeof returned !== 'string') return false
  const candidate = returned.trim().toLowerCase()
  if (!CORRELATOR_HEX.test(candidate)) return false
  const expected = Buffer.from(launchStateCorrelator(state), 'hex')
  const actual = Buffer.from(candidate, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
