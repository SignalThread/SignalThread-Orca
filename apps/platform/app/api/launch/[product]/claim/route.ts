import { NextResponse, type NextRequest } from "next/server";
import { claimProductHandoff } from "@/lib/server/handoff-claim";
import { parseClaimRequest } from "@/lib/server/handoff-claim-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Handoff claim for products that own their own auth authority.
 *
 *   POST /api/launch/pulse/claim
 *   { "handoff": "<one-time token>", "event_id": "<canonical uuid>" }
 *
 * Called server-to-server by the product after the browser arrives at its
 * `/platform-entry` with the token Platform minted. The token is exchanged here,
 * exactly once, against Platform Core Auth; the caller never touches Platform
 * Core Auth and never receives a Platform Core session.
 *
 * What comes back is only the canonical context -- user, organization, event,
 * product -- and only after `authorizeProductLaunch` has been re-run against live
 * registry state. The organization is derived from the event; nothing in the
 * request body can name an organization. Mapping that context to a product-local
 * user and workspace, and authorizing *that*, is the product's job.
 *
 * No Platform session cookie is read or written: authentication for this
 * endpoint is the token itself.
 */

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } as const;

function denied(reason: string, status: number) {
  return NextResponse.json({ error: status === 404 ? "Not Found" : "Forbidden", reason }, { status, headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ product: string }> },
) {
  const { product } = await context.params;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const claim = parseClaimRequest(product, body);
  if (!claim) return denied("INVALID_REQUEST", 400);

  const result = await claimProductHandoff(claim);
  if (result.status === "DENIED") return denied(result.reason, result.httpStatus);

  return NextResponse.json(
    {
      platform_user_id: result.platformUserId,
      organization_id: result.organizationId,
      event_id: result.eventId,
      product: result.productKey,
    },
    { status: 200, headers: NO_STORE },
  );
}
