import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  finalizeAdminSpeakerFile,
  listSpeakerFiles,
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
  { params }: { params: Promise<{ eventId: string; speakerId: string }> },
) {
  const { eventId, speakerId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const files = await listSpeakerFiles(eventId, speakerId, authResult.user);
    return NextResponse.json(files);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/speakers/:speakerId/files");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; speakerId: string }> },
) {
  const { eventId, speakerId } = await params;
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
    const file = await finalizeAdminSpeakerFile(eventId, speakerId, authResult.user, {
      kind: body.kind,
      filename: body.filename,
      contentType: body.contentType,
      fileSizeBytes: body.fileSizeBytes,
      sessionId: body.sessionId,
      objectKey: body.objectKey,
    });
    return NextResponse.json(file, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/speakers/:speakerId/files");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/speakers/:speakerId/files", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/speakers/:speakerId/files", postHandler);
