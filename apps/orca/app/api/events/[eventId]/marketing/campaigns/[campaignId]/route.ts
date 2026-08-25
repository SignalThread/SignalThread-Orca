import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  parseJsonBody,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  updateCampaignSchema,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { getCampaign, updateCampaign } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; campaignId: string }> },
) {
  const { campaignId: rawCampaignId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const campaignId = uuidSchema.parse(rawCampaignId);
    const campaign = await getCampaign(auth.user, campaignId);
    return NextResponse.json(campaign);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "GET /api/events/:eventId/marketing/campaigns/:campaignId");
  }
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; campaignId: string }> },
) {
  const { campaignId: rawCampaignId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const campaignId = uuidSchema.parse(rawCampaignId);
    const body = updateCampaignSchema.parse(await parseJsonBody(request));
    const campaign = await updateCampaign(auth.user, campaignId, body);
    return NextResponse.json(campaign);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "PATCH /api/events/:eventId/marketing/campaigns/:campaignId");
  }
}

export const GET = withApiRequestLogging(
  "GET /api/events/:eventId/marketing/campaigns/:campaignId",
  getHandler,
);
export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/marketing/campaigns/:campaignId",
  patchHandler,
);
