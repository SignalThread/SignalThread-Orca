import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { SpeakerServiceError, getSpeakerForPublicIntake } from "@/src/server/services/speakers";
import { SpeakerIntakeTokenError, verifySpeakerIntakeToken } from "@/src/server/services/speaker-intake";
import { createSpeakerHeadshotPresignedUpload } from "@/src/server/storage/speakers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerIntakeTokenError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof SpeakerServiceError) {
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
    const payload = verifySpeakerIntakeToken(token);
    await getSpeakerForPublicIntake(payload.eventId, payload.speakerId);

    const filename = requireText(body.filename, "filename");
    const contentType = requireText(body.contentType, "contentType").toLowerCase();
    const fileSizeBytes = Number(body.fileSizeBytes);

    const presign = await createSpeakerHeadshotPresignedUpload({
      eventId: payload.eventId,
      speakerId: payload.speakerId,
      filename,
      contentType,
      fileSizeBytes,
    });

    return NextResponse.json(presign);
  } catch (error) {
    return toErrorResponse(error, "POST /api/public/speaker-intake/:token/headshot/presign");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/public/speaker-intake/:token/headshot/presign",
  postHandler,
);
