import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  createAudienceSchema,
  parseJsonBody,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { createAudience, listAudiences } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const audiences = await listAudiences(auth.user, eventId);
    return NextResponse.json(audiences);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "GET /api/events/:eventId/marketing/audiences");
  }
}

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const body = createAudienceSchema.parse(await parseJsonBody(request));
    const audience = await createAudience(auth.user, eventId, body);
    return NextResponse.json(audience, { status: 201 });
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "POST /api/events/:eventId/marketing/audiences");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/marketing/audiences", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/marketing/audiences", postHandler);
