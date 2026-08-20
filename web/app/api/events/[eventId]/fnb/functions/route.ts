import { NextRequest, NextResponse } from "next/server";

import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { MatrixError } from "@/lib/matrix";
import {
  createEventFnbFunction,
  FnbEventPlannerError,
  getEventFnbPlanner,
} from "@/lib/fnb-event-planner";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  if (error instanceof FnbEventPlannerError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof MatrixError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
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

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await assertEventAccessForUser(eventId, authResult.user, "write");
    const result = await createEventFnbFunction(eventId, body, { id: authResult.user.id });
    // Returning the refreshed planner keeps event rollups consistent with the write that just
    // committed, rather than letting the client patch its own totals.
    const planner = await getEventFnbPlanner(eventId);
    return NextResponse.json({ ...result, planner }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/fnb/functions");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/fnb/functions", postHandler);
