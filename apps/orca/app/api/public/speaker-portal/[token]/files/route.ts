import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import {
  finalizePortalSpeakerFile,
  listPortalSpeakerFiles,
  SpeakerFileError,
} from "@/src/server/services/speaker-files";
import { SpeakerPortalTokenError } from "@/src/server/services/speaker-portal-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerPortalTokenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SpeakerFileError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const files = await listPortalSpeakerFiles(token);
    return NextResponse.json(files);
  } catch (error) {
    return toErrorResponse(error, "GET /api/public/speaker-portal/:token/files");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const file = await finalizePortalSpeakerFile(token, {
      kind: body.kind,
      filename: body.filename,
      contentType: body.contentType,
      fileSizeBytes: body.fileSizeBytes,
      sessionId: body.sessionId,
      objectKey: body.objectKey,
    });
    return NextResponse.json(file, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/public/speaker-portal/:token/files");
  }
}

export const GET = withApiRequestLogging("GET /api/public/speaker-portal/:token/files", getHandler);
export const POST = withApiRequestLogging("POST /api/public/speaker-portal/:token/files", postHandler);
