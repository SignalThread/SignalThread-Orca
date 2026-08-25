import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { EventCommandCenterServiceError, getEventCommandCenter } from "@/src/server/services/event-command-center";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof EventCommandCenterServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  try {
    const currentUserResult = await resolveRequestUser(request);
    if ("error" in currentUserResult) {
      return NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      );
    }

    const payload = await getEventCommandCenter(eventId, {
      id: currentUserResult.user.id,
      orgId: currentUserResult.user.orgId,
      role: currentUserResult.user.role,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/command-center");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/command-center", getHandler);
