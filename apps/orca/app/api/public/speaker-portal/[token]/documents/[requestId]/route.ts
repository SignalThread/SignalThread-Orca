import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import {
  submitPortalSpeakerDocument,
  SpeakerDocumentError,
} from "@/src/server/services/speaker-documents";
import { SpeakerFileError } from "@/src/server/services/speaker-files";
import { SpeakerPortalTokenError } from "@/src/server/services/speaker-portal-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerPortalTokenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SpeakerDocumentError || error instanceof SpeakerFileError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; requestId: string }> },
) {
  const { token, requestId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const updated = await submitPortalSpeakerDocument(token, requestId, {
      filename: body.filename,
      contentType: body.contentType,
      fileSizeBytes: body.fileSizeBytes,
      objectKey: body.objectKey,
    });
    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/public/speaker-portal/:token/documents/:requestId");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/public/speaker-portal/:token/documents/:requestId",
  postHandler,
);
