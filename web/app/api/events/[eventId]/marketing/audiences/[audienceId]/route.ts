import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  parseJsonBody,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  updateAudienceSchema,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { deleteAudience, getAudience, updateAudience } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; audienceId: string }> },
) {
  const { audienceId: rawAudienceId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const audienceId = uuidSchema.parse(rawAudienceId);
    const audience = await getAudience(auth.user, audienceId);
    return NextResponse.json(audience);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "GET /api/events/:eventId/marketing/audiences/:audienceId");
  }
}

export const GET = withApiRequestLogging(
  "GET /api/events/:eventId/marketing/audiences/:audienceId",
  getHandler,
);

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; audienceId: string }> },
) {
  const { audienceId: rawAudienceId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const audienceId = uuidSchema.parse(rawAudienceId);
    const patch = updateAudienceSchema.parse(await parseJsonBody(request));
    const audience = await updateAudience(auth.user, audienceId, patch);
    return NextResponse.json(audience);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "PATCH /api/events/:eventId/marketing/audiences/:audienceId");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; audienceId: string }> },
) {
  const { audienceId: rawAudienceId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const audienceId = uuidSchema.parse(rawAudienceId);
    const result = await deleteAudience(auth.user, audienceId);
    return NextResponse.json(result);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "DELETE /api/events/:eventId/marketing/audiences/:audienceId");
  }
}

export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/marketing/audiences/:audienceId",
  patchHandler,
);

export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/marketing/audiences/:audienceId",
  deleteHandler,
);
