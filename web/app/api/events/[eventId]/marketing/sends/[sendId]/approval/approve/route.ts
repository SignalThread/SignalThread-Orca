import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { approveEmailSend } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sendId: string }> },
) {
  const { sendId: rawSendId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const sendId = uuidSchema.parse(rawSendId);
    const send = await approveEmailSend(auth.user, sendId);
    return NextResponse.json(send);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "POST /api/events/:eventId/marketing/sends/:sendId/approval/approve");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/marketing/sends/:sendId/approval/approve",
  postHandler,
);
