import { NextResponse, type NextRequest } from "next/server";
import type { EntryResult } from "@/lib/platform/handoff-entry";
import {
  clearLaunchStateCookie,
  createLaunchState,
  isTopLevelNavigation,
  launchStateCookieSecure,
  launchStateCorrelator,
  launchStateCorrelatorMatches,
  launchStateMatches,
  readLaunchState,
  setLaunchStateCookie
} from "@/lib/platform/launch-state";
import { applyLandingCookies } from "@/lib/platform/lr-authorization";
import { PLATFORM_ENTRY_START_PATH } from "@/lib/platform/paths";
import { isCanonicalPlatformId } from "@/lib/platform/platform-ids";
import type { EstablishSessionFailure } from "@/lib/platform/establish-session";

/**
 * Request handling for the Platform → Lead Retrieval entry routes, with every
 * external effect injected so the full decision order is testable without
 * Platform, Supabase or a browser. `app/platform-entry/**` wires the real
 * dependencies (see platform-entry-server.ts).
 *
 * GET /platform-entry?handoff=<one-time token>&event_id=<canonical uuid>&state=<correlator>
 *
 * Order, and every step fails closed:
 *   1. request shape, top-level navigation, browser-bound launch state, relayed correlator
 *   2. Platform verifies the token and re-derives canonical user/org/event
 *   3. mappings resolved by canonical id only; the event must belong to the organization
 *   4. Lead Retrieval's own authorization for the mapped user
 *   5. an existing session for a *different* LR user is never replaced silently
 *   6. LR session for the mapped user -- last, on the redirect response only
 *
 * A rejection never emits an auth cookie and never touches an existing session.
 * This route never falls back to the OTP login.
 */

const HANDOFF_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
} as const;

function errorLabel(status: number): string {
  if (status === 401) return "Unauthorized";
  if (status === 409) return "Conflict";
  if (status >= 500) return "Unavailable";
  if (status === 400) return "Bad Request";
  return "Forbidden";
}

/** A denial carries no cookies of any kind; the launch state is spent separately when it existed. */
export function deniedResponse(
  status: number,
  reason: string,
  hint: string,
  options: { platformReason?: string; spendLaunchState?: boolean } = {}
): NextResponse {
  const response = NextResponse.json(
    {
      success: false,
      error: errorLabel(status),
      reason,
      hint,
      ...(options.platformReason ? { platformReason: options.platformReason } : {})
    },
    { status, headers: HANDOFF_HEADERS }
  );
  if (options.spendLaunchState) clearLaunchStateCookie(response);
  return response;
}

/** Relative Location only: the host of the request is preserved exactly. */
function relativeRedirect(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { ...HANDOFF_HEADERS, Location: location } });
}

export type EstablishedSession =
  | { ok: true; userId: string; attachCookies: (response: NextResponse) => NextResponse }
  | { ok: false; reason: EstablishSessionFailure };

export type PlatformEntryDeps = {
  resolveEntry: (input: { handoff: string | null; eventId: string | null }) => Promise<EntryResult>;
  readExistingSessionUserId: (request: NextRequest) => Promise<string | null>;
  /** Opens the LR session for the mapped user; cookies are attached to the redirect by the caller. */
  establishSession: (lrUserId: string) => Promise<EstablishedSession>;
  now?: () => Date;
  secureCookies?: boolean;
};

export async function handlePlatformEntryRequest(request: NextRequest, deps: PlatformEntryDeps): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const handoff = searchParams.get("handoff");
  const eventId = searchParams.get("event_id");
  const now = deps.now ?? (() => new Date());

  // 1. Shape and browser binding, before anything is spent or contacted.
  if (!isCanonicalPlatformId(eventId) || !handoff?.trim()) {
    return deniedResponse(400, "INVALID_REQUEST", "A Platform handoff and a canonical event id are required.");
  }
  if (!isTopLevelNavigation(request)) {
    return deniedResponse(403, "NOT_A_NAVIGATION", "A Platform launch can only be completed by navigating to it.");
  }

  const canonicalEventId = eventId.trim().toLowerCase();
  const launch = readLaunchState(request, now());

  if (launch.status === "MISSING" || launch.status === "EXPIRED") {
    // No usable state from this browser: do not redeem. Start a launch of its own,
    // which goes through Platform's authorization for *this* browser's user.
    return relativeRedirect(`${PLATFORM_ENTRY_START_PATH}?event_id=${encodeURIComponent(canonicalEventId)}`);
  }
  if (launch.status === "INVALID" || !launchStateMatches(launch.state, canonicalEventId)) {
    return deniedResponse(
      403,
      "LAUNCH_STATE_MISMATCH",
      "This browser did not start this launch. Open Lead Retrieval from Platform again.",
      { spendLaunchState: true }
    );
  }

  // The correlator Platform relayed back must be SHA-256 of this browser's own
  // nonce. This is what closes login CSRF: an attacker holding a valid handoff
  // minted for their own launch also holds a correlator for *their* nonce, which
  // no other browser's cookie can produce.
  const relayedState = searchParams.get("state");
  if (relayedState === null || relayedState === "") {
    return deniedResponse(
      403,
      "LAUNCH_STATE_MISSING",
      "This launch did not carry its browser state back from Platform. Open Lead Retrieval from Platform again.",
      { spendLaunchState: true }
    );
  }
  if (!launchStateCorrelatorMatches(launch.state, relayedState)) {
    return deniedResponse(
      403,
      "LAUNCH_STATE_MISMATCH",
      "This browser did not start this launch. Open Lead Retrieval from Platform again.",
      { spendLaunchState: true }
    );
  }

  // 2–4. Claim, map, authorize. The state is spent whatever the outcome.
  const entry = await deps.resolveEntry({ handoff, eventId: canonicalEventId });
  if (!entry.ok) {
    return deniedResponse(entry.status, entry.reason, entry.hint, {
      platformReason: entry.platformReason,
      spendLaunchState: true
    });
  }

  // 5. Never replace another user's live session behind their back.
  const existingUserId = await deps.readExistingSessionUserId(request);
  if (existingUserId && existingUserId !== entry.lrUserId) {
    return deniedResponse(
      409,
      "SESSION_CONFLICT",
      "Lead Retrieval is already signed in as a different user in this browser. Sign out of Lead Retrieval, then open it from Platform again.",
      { spendLaunchState: true }
    );
  }

  // 6. Session, last, on the very response that redirects into the workspace.
  //    A *relative* Location is deliberate: an absolute URL rebuilt from the
  //    request can normalise the host, and the cookies set below would then be
  //    scoped to a different host than the redirect target.
  const session = await deps.establishSession(entry.lrUserId);
  if (!session.ok) {
    return deniedResponse(
      403,
      session.reason,
      "A Lead Retrieval session could not be opened for the linked user. Open Lead Retrieval from Platform again.",
      { spendLaunchState: true }
    );
  }

  const response = relativeRedirect(entry.redirectPath);
  clearLaunchStateCookie(response);
  applyLandingCookies(response, entry.role, entry.eventId, {
    secure: deps.secureCookies ?? launchStateCookieSecure()
  });
  return session.attachCookies(response);
}

export type PlatformEntryStartDeps = {
  /** `buildPlatformLaunchUrl(eventId, correlator)`; null when Platform is not configured. */
  buildLaunchUrl: (eventId: string, correlator: string) => string | null;
  now?: () => Date;
};

/**
 * GET /platform-entry/start?event_id=<canonical uuid>          → set launch state, 303 …&armed=1
 * GET /platform-entry/start?event_id=<canonical uuid>&armed=1  → state readable? 303 Platform launch
 *
 * The second hop is the loop guard: it proves the browser actually stored the
 * state cookie before the browser is sent to Platform. The Platform destination
 * is built from PLATFORM_APP_URL, the canonical event id, and the correlator
 * derived from this browser's own cookie -- nothing else from the request -- so
 * this cannot become an open redirect.
 */
export async function handlePlatformEntryStartRequest(
  request: NextRequest,
  deps: PlatformEntryStartDeps
): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const eventId = searchParams.get("event_id");
  const now = deps.now ?? (() => new Date());
  if (!isCanonicalPlatformId(eventId)) {
    return deniedResponse(400, "INVALID_REQUEST", "A canonical event id is required.");
  }
  if (!isTopLevelNavigation(request)) {
    return deniedResponse(403, "NOT_A_NAVIGATION", "A Platform launch can only be started by navigating to it.");
  }
  const canonicalEventId = eventId.trim().toLowerCase();

  if (searchParams.get("armed") !== "1") {
    const response = relativeRedirect(
      `${PLATFORM_ENTRY_START_PATH}?event_id=${encodeURIComponent(canonicalEventId)}&armed=1`
    );
    setLaunchStateCookie(response, createLaunchState(canonicalEventId, now()));
    return response;
  }

  const launch = readLaunchState(request, now());
  if (launch.status !== "PRESENT" || !launchStateMatches(launch.state, canonicalEventId)) {
    return deniedResponse(400, "LAUNCH_STATE_REQUIRED", "Lead Retrieval needs cookies enabled to complete a Platform launch.", {
      spendLaunchState: true
    });
  }

  // Only the correlator travels; the nonce stays in the cookie.
  const target = deps.buildLaunchUrl(canonicalEventId, launchStateCorrelator(launch.state));
  if (!target) {
    return deniedResponse(503, "PLATFORM_NOT_CONFIGURED", "Platform launch is not configured for this Lead Retrieval deployment.", {
      spendLaunchState: true
    });
  }

  // The state cookie stays: Platform will send this browser back with a fresh
  // handoff for the same event, and /platform-entry spends the state then.
  return new NextResponse(null, { status: 303, headers: { ...HANDOFF_HEADERS, Location: target } });
}
