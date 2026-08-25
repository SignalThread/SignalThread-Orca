import { NextRequest, NextResponse } from "next/server";
import { SeatingError, createSeatingAttendee } from "@/lib/seating";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";
import { roomSetAndSeatingUnavailableResponse } from "@/lib/room-set/availability";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SeatingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
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

  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const attendee = await createSeatingAttendee(eventId, {
      firstName: body.firstName,
      lastName: body.lastName,
      company: body.company,
      email: body.email,
    });

    return NextResponse.json(attendee, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/seating/attendees");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/seating/attendees", postHandler);
