import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  cancelEventAttendee,
  deleteEventAttendee,
  getEventAttendee,
  updateEventAttendee,
  type AttendeeProfileInput,
  type AttendeeParticipationInput,
  type AttendeeRegistrationInput,
} from "@/src/server/services/event-attendee";
import { readJsonBody, resolveAttendeeUser, toAttendeeErrorResponse } from "../_lib/route-helpers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string; attendeeId: string }> };

async function getHandler(request: NextRequest, { params }: Ctx) {
  const { eventId, attendeeId } = await params;
  const auth = await resolveAttendeeUser(request);
  if ("response" in auth) return auth.response;
  try {
    const attendee = await getEventAttendee({ eventId, attendeeId, user: auth.user });
    return NextResponse.json({ attendee });
  } catch (error) {
    return toAttendeeErrorResponse(error, "GET /api/events/:eventId/attendees/:attendeeId");
  }
}

async function patchHandler(request: NextRequest, { params }: Ctx) {
  const { eventId, attendeeId } = await params;
  const auth = await resolveAttendeeUser(request);
  if ("response" in auth) return auth.response;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const b = parsed.body;
  try {
    const attendee = await updateEventAttendee({
      eventId,
      attendeeId,
      user: auth.user,
      profile: (b.profile as AttendeeProfileInput) ?? undefined,
      participation: (b.participation as AttendeeParticipationInput) ?? undefined,
      registration: (b.registration as AttendeeRegistrationInput) ?? undefined,
    });
    return NextResponse.json({ attendee });
  } catch (error) {
    return toAttendeeErrorResponse(error, "PATCH /api/events/:eventId/attendees/:attendeeId");
  }
}

async function deleteHandler(request: NextRequest, { params }: Ctx) {
  const { eventId, attendeeId } = await params;
  const auth = await resolveAttendeeUser(request);
  if ("response" in auth) return auth.response;
  // ?mode=cancel keeps the participation row (soft); default removes participation.
  const mode = request.nextUrl.searchParams.get("mode");
  try {
    if (mode === "cancel") {
      const attendee = await cancelEventAttendee({ eventId, attendeeId, user: auth.user });
      return NextResponse.json({ status: "cancelled", attendee });
    }
    const result = await deleteEventAttendee({ eventId, attendeeId, user: auth.user });
    return NextResponse.json(result);
  } catch (error) {
    return toAttendeeErrorResponse(error, "DELETE /api/events/:eventId/attendees/:attendeeId");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/attendees/:attendeeId", getHandler);
export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/attendees/:attendeeId", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/attendees/:attendeeId", deleteHandler);
