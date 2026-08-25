import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { SeatingError, getSeatingSnapshot } from "@/lib/seating";
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

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const unavailableResponse = roomSetAndSeatingUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId } = await params;
  const matrixRowId = request.nextUrl.searchParams.get("matrixRowId");
  const seatingPlanId = request.nextUrl.searchParams.get("seatingPlanId");
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

  try {
    await assertEventAccessForUser(eventId, authResult.user, "read");
    const payload = await getSeatingSnapshot(eventId, { matrixRowId, seatingPlanId });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/seating");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/seating", getHandler);
