import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  getAdminSpeakerFileDownload,
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

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; speakerId: string; fileId: string }> },
) {
  const { eventId, speakerId, fileId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const download = await getAdminSpeakerFileDownload(eventId, speakerId, fileId, authResult.user);
    return NextResponse.redirect(download.downloadUrl);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/speakers/:speakerId/files/:fileId/download");
  }
}

export const GET = withApiRequestLogging(
  "GET /api/events/:eventId/speakers/:speakerId/files/:fileId/download",
  getHandler,
);
