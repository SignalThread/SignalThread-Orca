import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { getEmailDefaults } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const defaults = await getEmailDefaults(auth.user, eventId);
    return NextResponse.json(defaults);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "GET /api/events/:eventId/marketing/defaults");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/marketing/defaults", getHandler);
