import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  reviewSpeakerFile,
  SpeakerFileError,
} from "@/src/server/services/speaker-files";

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

  if (error instanceof SpeakerFileError) {
    return NextResponse.json(
      { error: error.message, ...(error.reason ? { reason: error.reason } : {}) },
      { status: error.status },
    );
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; speakerId: string; fileId: string }> },
) {
  const { eventId, speakerId, fileId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const file = await reviewSpeakerFile(eventId, speakerId, fileId, authResult.user, {
      reviewStatus: body.reviewStatus,
      reviewFeedback: body.reviewFeedback,
    });
    return NextResponse.json(file);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/speakers/:speakerId/files/:fileId/review");
  }
}

export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/speakers/:speakerId/files/:fileId/review",
  patchHandler,
);
