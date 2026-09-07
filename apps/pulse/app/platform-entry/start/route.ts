import { NextRequest, NextResponse } from 'next/server'
import { isCanonicalPlatformId } from '@/lib/platform/identity-mapping'
import {
  clearLaunchStateCookie,
  createLaunchState,
  isTopLevelNavigation,
  launchStateCorrelator,
  launchStateMatches,
  readLaunchState,
  setLaunchStateCookie,
} from '@/lib/platform/launch-state'
import { buildPlatformLaunchUrl } from '@/lib/platform/platform-claim-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Start (or restart) a Platform launch from this browser.
 *
 *   GET /platform-entry/start?event_id=<canonical uuid>          -> set launch state, 303 …&armed=1
 *   GET /platform-entry/start?event_id=<canonical uuid>&armed=1  -> state readable? 303 Platform launch
 *                                                                  ?event_id=…&state=<correlator>
 *
 * The second hop is the loop guard: it proves the browser actually stored the
 * state cookie before the browser is sent to Platform. A browser that refuses
 * cookies gets an explicit error here instead of bouncing between the two apps
 * (and minting a Platform handoff on every bounce).
 *
 * The Platform destination is built from the configured PLATFORM_APP_URL, the
 * canonical event id, and the correlator derived from this browser's own cookie.
 * Nothing else from the request is used, so this cannot become an open redirect.
 * `armed` is a routing hint; the cookie is what is checked.
 */

const HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
} as const

function denied(status: number, reason: string, hint: string) {
  return NextResponse.json(
    { success: false, error: status >= 500 ? 'Unavailable' : status === 400 ? 'Bad Request' : 'Forbidden', reason, hint },
    { status, headers: HEADERS },
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const eventId = searchParams.get('event_id')
    if (!isCanonicalPlatformId(eventId)) {
      return denied(400, 'INVALID_REQUEST', 'A canonical event id is required.')
    }
    if (!isTopLevelNavigation(request)) {
      return denied(403, 'NOT_A_NAVIGATION', 'A Platform launch can only be started by navigating to it.')
    }
    const canonicalEventId = eventId.trim().toLowerCase()

    if (searchParams.get('armed') !== '1') {
      const response = new NextResponse(null, {
        status: 303,
        headers: { ...HEADERS, Location: `/platform-entry/start?event_id=${encodeURIComponent(canonicalEventId)}&armed=1` },
      })
      setLaunchStateCookie(response, createLaunchState(canonicalEventId))
      return response
    }

    const launch = readLaunchState(request)
    if (launch.status !== 'PRESENT' || !launchStateMatches(launch.state, canonicalEventId)) {
      const response = denied(400, 'LAUNCH_STATE_REQUIRED', 'Pulse needs cookies enabled to complete a Platform launch.')
      clearLaunchStateCookie(response)
      return response
    }

    // Only the correlator travels; the nonce stays in the cookie.
    const target = buildPlatformLaunchUrl(canonicalEventId, launchStateCorrelator(launch.state))
    if (!target) {
      const response = denied(503, 'PLATFORM_NOT_CONFIGURED', 'Platform launch is not configured for this Pulse deployment.')
      clearLaunchStateCookie(response)
      return response
    }

    // The state cookie stays: Platform will send this browser back with a fresh
    // handoff for the same event, and /platform-entry spends the state then.
    return new NextResponse(null, { status: 303, headers: { ...HEADERS, Location: target } })
  } catch {
    return denied(500, 'INTERNAL_ERROR', 'Pulse could not start this launch. Open Pulse from Platform again.')
  }
}
