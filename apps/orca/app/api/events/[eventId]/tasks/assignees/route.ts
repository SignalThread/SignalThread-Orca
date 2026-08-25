import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { listEventAssignableUsers } from "@/src/server/services/event-assignable-users";
import {
  requireRouteUser,
  toTaskRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/tasks/_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    await assertEventAccessForUser(eventId, auth.user, "read");
    const users = await listEventAssignableUsers(eventId);
    return NextResponse.json(users);
  } catch (error) {
    if (error instanceof EventAccessError) {
      return NextResponse.json(
        { error: error.message, reason: error.reason },
        { status: error.status },
      );
    }
    return toTaskRouteErrorResponse(error, "GET /api/events/:eventId/tasks/assignees");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/tasks/assignees", getHandler);
