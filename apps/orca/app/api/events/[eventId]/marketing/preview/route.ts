import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  parseJsonBody,
  previewEmailSchema,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { previewEmail } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const input = previewEmailSchema.parse(await parseJsonBody(request));
    const preview = await previewEmail(auth.user, eventId, input);
    return NextResponse.json(preview);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "POST /api/events/:eventId/marketing/preview");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/marketing/preview", postHandler);
