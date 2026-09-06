import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/guards";
import { readLaunchState } from "@/lib/server/launch-state-relay";
import { authorizeProductLaunch } from "@/lib/server/product-launch";
import { mintProductHandoff } from "@/lib/server/handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Product launch: authorize, then hand off.
 *
 *   GET /api/launch/orca?event_id=<canonical uuid>
 *   GET /api/launch/pulse?event_id=<canonical uuid>&state=<product correlator>
 *
 * The order is the security property. Authorization runs to completion *before*
 * a handoff exists, because the handoff is a bearer credential for a real
 * session -- minting first and checking later would make the launcher an
 * entitlement bypass.
 *
 * Only `event_id` is accepted from the client as *input to a decision*, and it is
 * treated as untrusted. The organization, membership, and entitlement are all
 * resolved server-side from the canonical registry. No `organization_id`,
 * `product`, or `return_to` is honoured from the request.
 *
 * `state` is the product's own browser-bound launch correlator. It is carried
 * through untouched and echoed back on the redirect so the product can prove the
 * returning browser is the one that started the launch. It is **correlation
 * only**: it is deliberately not passed to `authorizeProductLaunch`, so no value
 * of it can widen, narrow, or redirect authorization, and it is never stored or
 * logged. See `lib/server/launch-state-relay.ts`.
 *
 * `Referrer-Policy: no-referrer` is set on every response: the redirect target
 * carries a one-time token in its query string, and the default referrer policy
 * would leak it to anything the destination page subsequently loads.
 */

const NO_REFERRER = { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } as const;

function denied(reason: string, hint: string, status: number) {
  return NextResponse.json({ error: "Forbidden", reason, hint }, { status, headers: NO_REFERRER });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ product: string }> },
) {
  const { product } = await context.params;
  const productKey = product.trim().toLowerCase();
  const eventId = request.nextUrl.searchParams.get("event_id");

  // Read the correlator up front so the sign-in bounce can preserve it: losing it
  // there would send the user back to the product with a handoff their browser
  // can no longer match, and they would loop.
  const launchState = readLaunchState(request.nextUrl.searchParams.get("state"));
  if (launchState.status === "MALFORMED") {
    return denied("INVALID_LAUNCH_STATE", "The launch state is not a valid opaque value.", 400);
  }

  let user;
  try {
    user = await requireUser();
  } catch {
    // Unauthenticated: send to sign-in rather than leaking whether the event exists.
    const resume = new URLSearchParams();
    if (eventId) resume.set("event_id", eventId);
    if (launchState.status === "VALID") resume.set("state", launchState.state);
    const signIn = new URL("/signin", request.url);
    signIn.searchParams.set("next", `/api/launch/${productKey}?${resume.toString()}`);
    return NextResponse.redirect(signIn, { headers: NO_REFERRER });
  }

  if (!user.email) {
    return denied("NO_EMAIL_IDENTITY", "This account has no email identity to hand off.", 403);
  }
  if (!eventId) {
    return denied("EVENT_ID_REQUIRED", "A canonical event id is required.", 400);
  }

  // Authorization sees the user, the product and the event. It is not given the
  // correlator, and it returns nothing derived from it.
  const decision = await authorizeProductLaunch({ userId: user.id, productKey, eventId });
  if (decision.status === "DENIED") {
    return denied(decision.reason, decision.hint, decision.reason === "EVENT_NOT_FOUND" ? 404 : 403);
  }

  const handoff = await mintProductHandoff({
    email: user.email,
    productKey: decision.productKey,
    // The *validated* event id from the authorization decision, never the request.
    eventId: decision.eventId,
    launchState: launchState.status === "VALID" ? launchState.state : null,
  });

  if (handoff.status === "FAILED") {
    return denied(handoff.reason, "The product handoff could not be created.", 503);
  }

  // 303 so the browser performs a plain GET and does not keep this URL as the
  // current document; the one-time token lives only in the transient hop.
  return NextResponse.redirect(handoff.url, { status: 303, headers: NO_REFERRER });
}
