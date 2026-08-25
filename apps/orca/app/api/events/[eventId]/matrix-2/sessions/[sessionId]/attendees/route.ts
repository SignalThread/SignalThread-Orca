import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { sessionRegistrationUnavailableResponse } from "@/lib/session-registration/availability";
import {
  addAttendeeToSession,
  listSessionRoster,
} from "@/src/server/services/event-attendee-session-enrollment";
import {
  addRosterAttendeeBodySchema,
  assertEnrollmentEventAccess,
  parseEnrollmentJsonBody,
  parseIncludeInactive,
  requireEnrollmentRouteUser,
  serializeEnrollment,
  serializeRosterEnrollment,
  toEnrollmentRouteErrorResponse,
  uuidSchema,
} from "../../../../attendees/_lib/session-enrollment-route-helpers";

export const runtime = "nodejs";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const unavailableResponse = sessionRegistrationUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId: rawEventId, sessionId: rawSessionId } = await params;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const matrixRowId = uuidSchema.parse(rawSessionId);
    const auth = await requireEnrollmentRouteUser(request);
    if ("response" in auth) return auth.response;

    await assertEnrollmentEventAccess(eventId, auth.user, "read");
    const roster = await listSessionRoster(eventId, matrixRowId, { includeInactive: parseIncludeInactive(request) });
    return NextResponse.json({ roster: roster.map(serializeRosterEnrollment) });
  } catch (error) {
    return toEnrollmentRouteErrorResponse(error, "GET /api/events/:eventId/matrix-2/sessions/:sessionId/attendees");
  }
}

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const unavailableResponse = sessionRegistrationUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId: rawEventId, sessionId: rawSessionId } = await params;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const matrixRowId = uuidSchema.parse(rawSessionId);
    const auth = await requireEnrollmentRouteUser(request);
    if ("response" in auth) return auth.response;

    await assertEnrollmentEventAccess(eventId, auth.user, "write");
    const body = addRosterAttendeeBodySchema.parse(await parseEnrollmentJsonBody(request));
    const enrollment = await addAttendeeToSession(eventId, body.attendeeId, matrixRowId, {
      enrollmentStatus: body.enrollmentStatus,
      source: body.source ?? "MANUAL",
      actorUserId: auth.user.id,
    });
    return NextResponse.json({ enrollment: serializeEnrollment(enrollment) }, { status: 201 });
  } catch (error) {
    return toEnrollmentRouteErrorResponse(error, "POST /api/events/:eventId/matrix-2/sessions/:sessionId/attendees");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/matrix-2/sessions/:sessionId/attendees", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/matrix-2/sessions/:sessionId/attendees", postHandler);
