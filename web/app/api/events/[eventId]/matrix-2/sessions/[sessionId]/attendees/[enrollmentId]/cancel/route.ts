import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { sessionRegistrationUnavailableResponse } from "@/lib/session-registration/availability";
import { cancelAttendeeSessionEnrollment } from "@/src/server/services/event-attendee-session-enrollment";
import {
  assertEnrollmentEventAccess,
  requireEnrollmentRouteUser,
  serializeEnrollment,
  toEnrollmentRouteErrorResponse,
  uuidSchema,
} from "../../../../../../attendees/_lib/session-enrollment-route-helpers";

export const runtime = "nodejs";

async function cancelHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string; enrollmentId: string }> },
) {
  const unavailableResponse = sessionRegistrationUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId: rawEventId, sessionId: rawSessionId, enrollmentId: rawEnrollmentId } = await params;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const matrixRowId = uuidSchema.parse(rawSessionId);
    const enrollmentId = uuidSchema.parse(rawEnrollmentId);
    const auth = await requireEnrollmentRouteUser(request);
    if ("response" in auth) return auth.response;

    await assertEnrollmentEventAccess(eventId, auth.user, "write");
    const enrollment = await cancelAttendeeSessionEnrollment(eventId, {
      enrollmentId,
      matrixRowId,
      actorUserId: auth.user.id,
    });
    return NextResponse.json({ enrollment: serializeEnrollment(enrollment) });
  } catch (error) {
    return toEnrollmentRouteErrorResponse(
      error,
      "POST /api/events/:eventId/matrix-2/sessions/:sessionId/attendees/:enrollmentId/cancel",
    );
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/matrix-2/sessions/:sessionId/attendees/:enrollmentId/cancel",
  cancelHandler,
);
export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/matrix-2/sessions/:sessionId/attendees/:enrollmentId/cancel",
  cancelHandler,
);
