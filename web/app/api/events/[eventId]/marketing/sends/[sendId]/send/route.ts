import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { sendEmailNow } from "@/src/server/services/marketing";

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
    const result = await sendEmailNow(auth.user, sendId);
    return NextResponse.json(result);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "POST /api/events/:eventId/marketing/sends/:sendId/send");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/marketing/sends/:sendId/send",
  postHandler,
);
