import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { MarketingServiceError, runDueScheduledEmailSends } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedRunnerRequest(request: NextRequest): boolean {
  const secret = process.env.MARKETING_SEND_RUNNER_SECRET?.trim();
  if (!secret) return false;
  const headerSecret = request.headers.get("x-marketing-runner-secret")?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return headerSecret === secret || bearer === secret;
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId: rawEventId } = await params;

  try {
    if (!isAuthorizedRunnerRequest(request)) {
      throw new MarketingServiceError("Forbidden", 403, "MARKETING_RUNNER_FORBIDDEN");
    }
    const eventId = uuidSchema.parse(rawEventId);
    const result = await runDueScheduledEmailSends(eventId);
    return NextResponse.json(result);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "POST /api/events/:eventId/marketing/run-due-scheduled-sends");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/marketing/run-due-scheduled-sends",
  postHandler,
);
