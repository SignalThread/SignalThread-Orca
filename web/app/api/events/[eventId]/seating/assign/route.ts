import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { SeatingError, assignAttendeeToTable } from "@/lib/seating";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { roomSetAndSeatingUnavailableResponse } from "@/lib/room-set/availability";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SeatingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const unavailableResponse = roomSetAndSeatingUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId } = await params;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const attendeeId = typeof body.attendeeId === "string" ? body.attendeeId : "";
  const tableId = typeof body.tableId === "string" ? body.tableId : "";
  const seatIndex = Object.prototype.hasOwnProperty.call(body, "seatIndex") ? body.seatIndex : undefined;
  const matrixRowId = typeof body.matrixRowId === "string" ? body.matrixRowId : null;
  const seatingPlanId = typeof body.seatingPlanId === "string" ? body.seatingPlanId : null;
  const requireScopedContext = body.requireScopedContext === true;

  if (!attendeeId || !tableId) {
    return NextResponse.json({ error: "attendeeId and tableId are required" }, { status: 400 });
  }

  try {
    const authResult = await resolveRequestUser(request);
    if ("error" in authResult) {
      return NextResponse.json(
        {
          error: authResult.error.status === 403 ? "Forbidden" : "Unauthorized",
          reason: authResult.error.reason,
          hint: authResult.error.hint,
        },
        { status: authResult.error.status },
      );
    }
    await assertEventAccessForUser(eventId, authResult.user, "write");
    const assignment = await assignAttendeeToTable(eventId, attendeeId, tableId, seatIndex, {
      matrixRowId,
      seatingPlanId,
      requireScopedContext,
      actorUserId: authResult.user.id,
    });
    return NextResponse.json(assignment);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/seating/assign");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/seating/assign", postHandler);
