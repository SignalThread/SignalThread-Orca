import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { Matrix2Error } from "@/lib/matrix2";
import { addMatrix2SessionSpeakerAssignment, removeMatrix2SessionSpeakerAssignment } from "@/lib/matrix2-session";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof EventAccessError) {
    return NextResponse.json(
      { error: error.message, reason: error.reason },
      { status: error.status },
    );
  }

  if (error instanceof Matrix2Error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    {
      message: status === 403 ? "Forbidden" : "Unauthorized",
      reason,
      hint,
    },
    { status },
  );
}

async function deleteMatrix2SessionSpeakerRoute(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string; speakerId: string }> },
) {
  const { eventId, sessionId, speakerId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    await assertEventAccessForUser(eventId, authResult.user, "write");
    const removed = await removeMatrix2SessionSpeakerAssignment(eventId, sessionId, speakerId, authResult.user.id);
    return NextResponse.json(removed);
  } catch (error) {
    return toErrorResponse(
      error,
      "DELETE /api/events/:eventId/matrix-2/sessions/:sessionId/speakers/:speakerId",
    );
  }
}

async function addMatrix2SessionSpeakerRoute(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string; speakerId: string }> },
) {
  const { eventId, sessionId, speakerId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    await assertEventAccessForUser(eventId, authResult.user, "write");
    const assigned = await addMatrix2SessionSpeakerAssignment(eventId, sessionId, speakerId, authResult.user.id);
    return NextResponse.json(assigned);
  } catch (error) {
    return toErrorResponse(
      error,
      "POST /api/events/:eventId/matrix-2/sessions/:sessionId/speakers/:speakerId",
    );
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/matrix-2/sessions/:sessionId/speakers/:speakerId",
  addMatrix2SessionSpeakerRoute,
);
export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/matrix-2/sessions/:sessionId/speakers/:speakerId",
  deleteMatrix2SessionSpeakerRoute,
);
