import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import {
  createPortalSpeakerFilePresign,
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
    const presign = await createPortalSpeakerFilePresign(token, {
      kind: body.kind,
      filename: body.filename,
      contentType: body.contentType,
      fileSizeBytes: body.fileSizeBytes,
    });
    return NextResponse.json(presign);
  } catch (error) {
    return toErrorResponse(error, "POST /api/public/speaker-portal/:token/files/presign");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/public/speaker-portal/:token/files/presign",
  postHandler,
);
