import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  parseJsonBody,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  updateEmailSendSchema,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { updateEmailSend } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sendId: string }> },
) {
  const { sendId: rawSendId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const sendId = uuidSchema.parse(rawSendId);
    const body = updateEmailSendSchema.parse(await parseJsonBody(request));
    const send = await updateEmailSend(auth.user, sendId, body);
    return NextResponse.json(send);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "PATCH /api/events/:eventId/marketing/sends/:sendId");
  }
}

export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/marketing/sends/:sendId",
  patchHandler,
);
