import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  rejectSpeakerSubmission,
  SpeakerSubmissionError,
} from "@/src/server/services/speaker-submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerSubmissionError) {
    return NextResponse.json(
      { error: error.message, ...(error.reason ? { reason: error.reason } : {}) },
      { status: error.status },
    );
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; submissionId: string }> },
) {
  const { eventId, submissionId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const submission = await rejectSpeakerSubmission(eventId, submissionId, authResult.user);
    return NextResponse.json(submission);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/speaker-submissions/:submissionId/reject");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/speaker-submissions/:submissionId/reject",
  postHandler,
);
