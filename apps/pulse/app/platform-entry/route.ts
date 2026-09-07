import { NextRequest, NextResponse } from 'next/server'
import { establishPulseSessionForUser } from '@/lib/platform/establish-session'
import { readExistingPulseSessionUserId } from '@/lib/platform/existing-session'
import { resolvePlatformEntry } from '@/lib/platform/handoff-entry'
import { isCanonicalPlatformId } from '@/lib/platform/identity-mapping'
import {
  clearLaunchStateCookie,
  isTopLevelNavigation,
  launchStateCorrelatorMatches,
  launchStateMatches,
  readLaunchState,
} from '@/lib/platform/launch-state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * SignalThread Platform -> Pulse entry point.
 *
 *   GET /platform-entry?handoff=<one-time token>&event_id=<canonical uuid>&state=<correlator>
 *
 * The single door Platform launches Pulse through. The browser arrives here with
 * a one-time token Platform minted *after* authorizing the launch. Nothing in the
 * query string is trusted, and the token alone is not enough: this browser must
 * also hold launch state it established itself, and the `state` Platform relayed
 * back must be the correlator of exactly that state (see
 * lib/platform/launch-state.ts). A browser without matching state is not allowed
 * to redeem someone else's handoff; it is sent to start its own launch, so a
 * shared link can never turn the recipient into the sender.
 *
 * Order, and every step fails closed:
 *   1. request shape, top-level navigation, browser-bound launch state,
 *      relayed correlator
 *   2. Platform verifies the token and re-derives canonical user/org/event
 *   3. mappings resolved by canonical id only; Event must belong to Account
 *   4. Pulse's own authorization for the mapped user
 *   5. an existing session for a *different* user is never replaced silently
 *   6. Pulse session for the mapped user -- last, on the redirect response only
 *
 * A rejection never emits an auth cookie and never touches an existing session.
 * This route never falls back to the email/OTP login. Public attendee and kiosk
 * flows do not pass through here at all.
 */

/**
 * The request URL carries a one-time token. Suppress the referrer so it cannot
 * leak to anything a later page loads, and forbid caching of every response.
 */
const HANDOFF_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
} as const

function errorLabel(status: number): string {
  if (status === 401) return 'Unauthorized'
  if (status === 409) return 'Conflict'
  if (status >= 500) return 'Unavailable'
  if (status === 400) return 'Bad Request'
  return 'Forbidden'
}

/** A denial carries no cookies of any kind; the launch state is spent separately when it existed. */
function denied(
  status: number,
  reason: string,
  hint: string,
  options: { platformReason?: string; spendLaunchState?: boolean } = {},
) {
  const response = NextResponse.json(
    {
      success: false,
      error: errorLabel(status),
      reason,
      hint,
      ...(options.platformReason ? { platformReason: options.platformReason } : {}),
    },
    { status, headers: HANDOFF_HEADERS },
  )
  if (options.spendLaunchState) clearLaunchStateCookie(response)
  return response
}

/** Relative Location only: the host of the request is preserved exactly. */
function relativeRedirect(location: string) {
  return new NextResponse(null, { status: 303, headers: { ...HANDOFF_HEADERS, Location: location } })
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const handoff = searchParams.get('handoff')
  const eventId = searchParams.get('event_id')

  // 1. Shape and browser binding, before anything is spent or contacted.
  if (!isCanonicalPlatformId(eventId) || !handoff?.trim()) {
    return denied(400, 'INVALID_REQUEST', 'A Platform handoff and a canonical event id are required.')
  }
  if (!isTopLevelNavigation(request)) {
    return denied(403, 'NOT_A_NAVIGATION', 'A Platform launch can only be completed by navigating to it.')
  }

  const canonicalEventId = eventId.trim().toLowerCase()
  const launch = readLaunchState(request)

  if (launch.status === 'MISSING' || launch.status === 'EXPIRED') {
    // No usable state from this browser: do not redeem. Start a launch of its own,
    // which goes through Platform's authorization for *this* browser's user. An
    // expired state is indistinguishable from none here on purpose -- both mean
    // this browser has nothing valid to correlate against.
    return relativeRedirect(`/platform-entry/start?event_id=${encodeURIComponent(canonicalEventId)}`)
  }
  if (launch.status === 'INVALID' || !launchStateMatches(launch.state, canonicalEventId)) {
    return denied(403, 'LAUNCH_STATE_MISMATCH', 'This browser did not start this launch. Open Pulse from Platform again.', {
      spendLaunchState: true,
    })
  }

  // The correlator Platform relayed back must be SHA-256 of this browser's own
  // nonce. This is what closes login CSRF: an attacker holding a valid handoff
  // minted for their own launch also holds a correlator for *their* nonce, which
  // no other browser's cookie can produce. Compared in constant time, and before
  // anything is claimed, mapped, or written.
  const relayedState = searchParams.get('state')
  if (relayedState === null || relayedState === '') {
    return denied(403, 'LAUNCH_STATE_MISSING', 'This launch did not carry its browser state back from Platform. Open Pulse from Platform again.', {
      spendLaunchState: true,
    })
  }
  if (!launchStateCorrelatorMatches(launch.state, relayedState)) {
    return denied(403, 'LAUNCH_STATE_MISMATCH', 'This browser did not start this launch. Open Pulse from Platform again.', {
      spendLaunchState: true,
    })
  }

  // 2–4. Claim, map, authorize. The state is spent whatever the outcome.
  const entry = await resolvePlatformEntry({ handoff, eventId: canonicalEventId })
  if (!entry.ok) {
    return denied(entry.status, entry.reason, entry.hint, { platformReason: entry.platformReason, spendLaunchState: true })
  }

  // 5. Never replace another user's live session behind their back.
  const existingUserId = await readExistingPulseSessionUserId(request)
  if (existingUserId && existingUserId !== entry.pulseUserId) {
    return denied(409, 'SESSION_CONFLICT', 'Pulse is already signed in as a different user in this browser. Sign out of Pulse, then open it from Platform again.', {
      spendLaunchState: true,
    })
  }

  // 6. Session, last, on the very response that redirects into the workspace.
  //    A *relative* Location is deliberate: an absolute URL rebuilt from the
  //    request can normalise the host, and the cookies set below would then be
  //    scoped to a different host than the redirect target.
  const response = relativeRedirect(entry.redirectPath)
  clearLaunchStateCookie(response)

  const session = await establishPulseSessionForUser(entry.pulseUserId, request, response)
  if (!session.ok) {
    // `response` is discarded, so nothing the session attempt wrote can leak.
    return denied(403, session.reason, 'A Pulse session could not be opened for the linked user. Open Pulse from Platform again.', {
      spendLaunchState: true,
    })
  }

  return response
}

export async function GET(request: NextRequest) {
  try {
    return await handle(request)
  } catch {
    // Exception boundary: an unexpected failure anywhere (mapping resolver,
    // claim client, session establishment, database) must not become a framework
    // error page. Fail closed with a sanitized body, the same security headers,
    // and no cookies at all -- so an existing session is untouched and no detail
    // of the failure leaves the server.
    return denied(500, 'INTERNAL_ERROR', 'Pulse could not complete this launch. Open Pulse from Platform again.')
  }
}
