import { NextRequest, NextResponse } from "next/server";

import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { getSessionActivity } from "@/lib/session-activity";

export const runtime = "nodejs";

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string }> },
) {
  const { eventId, sessionId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return NextResponse.json(
      {
        message: authResult.error.status === 403 ? "Forbidden" : "Unauthorized",
        reason: authResult.error.reason,
        hint: authResult.error.hint,
      },
      { status: authResult.error.status },
    );
  }

  try {
    await assertEventAccessForUser(eventId, authResult.user, "read");
    return NextResponse.json(await getSessionActivity(eventId, sessionId));
  } catch (error) {
    observeHandledRouteError(error);
    if (error instanceof EventAccessError) {
      return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
    }
    console.error("GET /api/events/:eventId/matrix-2/sessions/:sessionId/activity failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withApiRequestLogging(
  "GET /api/events/:eventId/matrix-2/sessions/:sessionId/activity",
  getHandler,
);
