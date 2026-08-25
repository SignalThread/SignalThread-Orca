import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { resubscribeSuppression } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; suppressionId: string }> },
) {
  const { eventId: rawEventId, suppressionId: rawSuppressionId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const suppressionId = uuidSchema.parse(rawSuppressionId);
    const result = await resubscribeSuppression(auth.user, eventId, suppressionId);
    return NextResponse.json(result);
  } catch (error) {
    return toMarketingRouteErrorResponse(
      error,
      "POST /api/events/:eventId/marketing/suppressions/:suppressionId/resubscribe",
    );
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/marketing/suppressions/:suppressionId/resubscribe",
  postHandler,
);
