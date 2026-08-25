import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { SpeakerServiceError, submitSpeakerPublicIntake } from "@/src/server/services/speakers";
import { SpeakerIntakeTokenError, verifySpeakerIntakeToken } from "@/src/server/services/speaker-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerIntakeTokenError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof SpeakerServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function patchHandler(
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
    const speaker = await submitSpeakerPublicIntake(payload.eventId, payload.speakerId, body);
    return NextResponse.json(speaker);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/public/speaker-intake/:token");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/public/speaker-intake/:token", patchHandler);
