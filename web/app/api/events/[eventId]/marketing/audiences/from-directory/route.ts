import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  createAudienceFromDirectorySchema,
  parseJsonBody,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { createAudienceFromDirectory } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const body = createAudienceFromDirectorySchema.parse(await parseJsonBody(request));
    const result = await createAudienceFromDirectory(auth.user, eventId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "POST /api/events/:eventId/marketing/audiences/from-directory");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/marketing/audiences/from-directory",
  postHandler,
);
