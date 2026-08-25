import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { createAdminSpeakerHeadshotPresign, SpeakerServiceError } from "@/src/server/services/speakers";

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

  if (error instanceof SpeakerServiceError) {
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
    const presign = await createAdminSpeakerHeadshotPresign(eventId, speakerId, authResult.user, {
      filename: typeof body.filename === "string" ? body.filename : "",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      fileSizeBytes: Number(body.fileSizeBytes),
    });

    return NextResponse.json(presign);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/speakers/:speakerId/headshot/presign");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/speakers/:speakerId/headshot/presign",
  postHandler,
);
