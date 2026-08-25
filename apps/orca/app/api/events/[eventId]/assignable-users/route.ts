import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { listEventAssignableUsers } from "@/src/server/services/event-assignable-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    { message: status === 403 ? "Forbidden" : "Unauthorized", reason, hint },
    { status },
  );
}

function toErrorResponse(error: unknown): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof EventAccessError) {
    return NextResponse.json(
      { error: error.message, reason: error.reason },
      { status: error.status },
    );
  }

  console.error("GET /api/events/:eventId/assignable-users failed:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(
      authResult.error.status,
      authResult.error.reason,
      authResult.error.hint,
    );
  }

  try {
    await assertEventAccessForUser(eventId, authResult.user, "read");
    const users = await listEventAssignableUsers(eventId);
    return NextResponse.json(users);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/assignable-users", getHandler);
