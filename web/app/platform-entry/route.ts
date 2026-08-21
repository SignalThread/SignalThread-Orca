import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import { resolvePlatformEventHandoff } from "@/lib/platform/event-context";
import { getPlatformSignInUrl } from "@/lib/platform/entry";
import {
  ACTIVE_ORG_COOKIE_NAME,
  ensureProvisionedUserAndContext,
  ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  ORGANIZATION_SELECTION_COOKIE_NAME,
} from "@/lib/request-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Platform Core → Orca entry point.
 *
 *   GET /platform-entry?event_id=<canonical uuid>
 *
 * This is the single door Platform Core launches Orca through. It exists so that a user who
 * already picked an organization and an event in Platform is not asked for either again:
 * organization context is *derived* from the validated event rather than re-selected.
 *
 * The `event_id` is untrusted input. It is validated server-side against the verified
 * Platform session before any context is set — see `resolvePlatformEventHandoff`.
 *
 * Outcomes:
 *   no session          → redirect to Platform Core sign-in, preserving the return path
 *   not entitled/known  → 403 with the resolver's reason (Orca fails closed)
 *   event not allowed   → 400/403/404, never a redirect into the event
 *   allowed             → set organization context cookies, redirect into the event
 */
async function getHandler(request: NextRequest) {
  const requestedEventId = request.nextUrl.searchParams.get("event_id");

  const context = await ensureProvisionedUserAndContext(request);
  setRequestUserId(context.appUserId ?? null);

  if (context.status === "UNAUTHENTICATED") {
    // Bounce to Platform Core and come back to this same launch URL afterwards.
    const returnTo = `/platform-entry${request.nextUrl.search}`;
    const signIn = getPlatformSignInUrl(returnTo);
    if (signIn) return NextResponse.redirect(signIn);
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, request.url));
  }

  if (context.status !== "OK" || !context.appUserId || !context.role) {
    // NEEDS_PROVISIONING (no Orca access, no entitlement, org mismatch) and
    // NEEDS_ORG_SELECTION both mean this account cannot be launched into an event.
    return NextResponse.json(
      {
        error: "Forbidden",
        reason: context.status === "OK" ? "CONTEXT_UNRESOLVED" : context.reason,
        hint: context.status === "OK" ? "Organization context could not be resolved." : context.hint,
      },
      { status: 403 },
    );
  }

  // Use the organization set the resolver already computed: Orca product access narrowed
  // by Platform Core claims. Recomputing it here would risk the two drifting apart.
  const decision = await resolvePlatformEventHandoff({
    requestedEventId,
    authorizedOrganizationIds: context.authorizedOrganizationIds,
    user: { id: context.appUserId, orgId: context.activeOrgId, role: context.role },
  });

  if (decision.status === "DENIED") {
    return NextResponse.json(
      { error: decision.httpStatus === 404 ? "Not Found" : "Forbidden", reason: decision.reason, hint: decision.hint },
      { status: decision.httpStatus },
    );
  }

  // A *relative* Location is deliberate. An absolute redirect built from the request can
  // normalise the host (127.0.0.1 -> localhost), and the organization cookies set below
  // would then be scoped to a different host than the redirect target, silently dropping
  // the context this handoff just established. Browsers resolve a relative Location against
  // the request URL, so the host is preserved exactly.
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: `/events/${decision.eventId}` },
  });
  for (const name of [ACTIVE_ORG_COOKIE_NAME, ORGANIZATION_SELECTION_COOKIE_NAME]) {
    response.cookies.set({
      name,
      value: decision.organizationId,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const GET = withApiRequestLogging("GET /platform-entry", getHandler);
