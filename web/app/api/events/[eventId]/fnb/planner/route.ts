import { NextRequest, NextResponse } from "next/server";

import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { FnbEventPlannerError, getEventFnbPlanner } from "@/lib/fnb-event-planner";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  if (error instanceof FnbEventPlannerError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
  }
  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    { message: status === 403 ? "Forbidden" : "Unauthorized", reason, hint },
    { status },
  );
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    await assertEventAccessForUser(eventId, authResult.user, "read");
    return NextResponse.json(await getEventFnbPlanner(eventId));
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/fnb/planner");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/fnb/planner", getHandler);
