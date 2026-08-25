import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { SpeakerPortalError } from "@/src/server/services/speaker-portal";
import { resolveSpeakerPortalToken, SpeakerPortalTokenError } from "@/src/server/services/speaker-portal-tokens";
import { createSpeakerHeadshotPresignedUpload } from "@/src/server/storage/speakers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SpeakerPortalError(`${field} is required`, 400);
  }
  return value.trim();
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerPortalTokenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SpeakerPortalError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
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
    const resolved = await resolveSpeakerPortalToken(token);

    const filename = requireText(body.filename, "filename");
    const contentType = requireText(body.contentType, "contentType").toLowerCase();
    const fileSizeBytes = Number(body.fileSizeBytes);

    const presign = await createSpeakerHeadshotPresignedUpload({
      eventId: resolved.eventId,
      speakerId: resolved.speakerId,
      filename,
      contentType,
      fileSizeBytes,
    });

    return NextResponse.json(presign);
  } catch (error) {
    return toErrorResponse(error, "POST /api/public/speaker-portal/:token/headshot/presign");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/public/speaker-portal/:token/headshot/presign",
  postHandler,
);
