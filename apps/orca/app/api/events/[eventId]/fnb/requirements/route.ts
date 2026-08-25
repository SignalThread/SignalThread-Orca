import { NextRequest, NextResponse } from "next/server";

import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { FnbEventPlannerError } from "@/lib/fnb-event-planner";
import { getEventFnbRequirements } from "@/lib/fnb-event-requirements";
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

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
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
    return NextResponse.json(await getEventFnbRequirements(eventId));
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/fnb/requirements");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/fnb/requirements", getHandler);
