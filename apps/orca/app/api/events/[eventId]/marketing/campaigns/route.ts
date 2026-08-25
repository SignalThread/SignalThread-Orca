import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  createCampaignSchema,
  parseJsonBody,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { createCampaign, listCampaigns } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const campaigns = await listCampaigns(auth.user, eventId);
    return NextResponse.json(campaigns);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "GET /api/events/:eventId/marketing/campaigns");
  }
}

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const body = createCampaignSchema.parse(await parseJsonBody(request));
    const campaign = await createCampaign(auth.user, eventId, body);
    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "POST /api/events/:eventId/marketing/campaigns");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/marketing/campaigns", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/marketing/campaigns", postHandler);
