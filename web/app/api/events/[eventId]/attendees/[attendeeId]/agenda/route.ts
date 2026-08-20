import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { sessionRegistrationUnavailableResponse } from "@/lib/session-registration/availability";
import {
  addAttendeeToSession,
  listAttendeeAgenda,
} from "@/src/server/services/event-attendee-session-enrollment";
import {
  addAgendaSessionBodySchema,
  assertEnrollmentEventAccess,
  parseEnrollmentJsonBody,
  parseIncludeInactive,
  requireEnrollmentRouteUser,
  serializeAgendaEnrollment,
  serializeEnrollment,
  toEnrollmentRouteErrorResponse,
  uuidSchema,
} from "../../_lib/session-enrollment-route-helpers";

export const runtime = "nodejs";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string; attendeeId: string }> }) {
  const unavailableResponse = sessionRegistrationUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId: rawEventId, attendeeId: rawAttendeeId } = await params;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const attendeeId = uuidSchema.parse(rawAttendeeId);
    const auth = await requireEnrollmentRouteUser(request);
    if ("response" in auth) return auth.response;

    await assertEnrollmentEventAccess(eventId, auth.user, "read");
    const agenda = await listAttendeeAgenda(eventId, attendeeId, { includeInactive: parseIncludeInactive(request) });
    return NextResponse.json({ agenda: agenda.map(serializeAgendaEnrollment) });
  } catch (error) {
    return toEnrollmentRouteErrorResponse(error, "GET /api/events/:eventId/attendees/:attendeeId/agenda");
  }
}

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string; attendeeId: string }> }) {
  const unavailableResponse = sessionRegistrationUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId: rawEventId, attendeeId: rawAttendeeId } = await params;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const attendeeId = uuidSchema.parse(rawAttendeeId);
    const auth = await requireEnrollmentRouteUser(request);
    if ("response" in auth) return auth.response;

    await assertEnrollmentEventAccess(eventId, auth.user, "write");
    const body = addAgendaSessionBodySchema.parse(await parseEnrollmentJsonBody(request));
    const enrollment = await addAttendeeToSession(eventId, attendeeId, body.matrixRowId, {
      enrollmentStatus: body.enrollmentStatus,
      source: body.source ?? "MANUAL",
      actorUserId: auth.user.id,
    });
    return NextResponse.json({ enrollment: serializeEnrollment(enrollment) }, { status: 201 });
  } catch (error) {
    return toEnrollmentRouteErrorResponse(error, "POST /api/events/:eventId/attendees/:attendeeId/agenda");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/attendees/:attendeeId/agenda", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/attendees/:attendeeId/agenda", postHandler);
