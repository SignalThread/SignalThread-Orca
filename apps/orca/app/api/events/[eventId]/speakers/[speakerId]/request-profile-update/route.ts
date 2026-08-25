import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/request-user";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { getSpeaker, SpeakerServiceError } from "@/src/server/services/speakers";
import {
  buildSpeakerIntakeMailto,
  buildSpeakerIntakeUrl,
  createSpeakerIntakeToken,
} from "@/src/server/services/speaker-intake";

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

  try {
    const speaker = await getSpeaker(eventId, speakerId, authResult.user);
    const event = await getPrisma().event.findUnique({
      where: { id: eventId },
      select: { name: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const token = createSpeakerIntakeToken({ eventId, speakerId });
    const intakeUrl = buildSpeakerIntakeUrl(request.nextUrl.origin, token.token);
    const mailtoHref = buildSpeakerIntakeMailto({
      email: speaker.email,
      speakerName: speaker.name,
      eventName: event.name,
      intakeUrl,
    });

    return NextResponse.json({
      intakeUrl,
      mailtoHref,
      expiresAt: token.expiresAt,
    });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/speakers/:speakerId/request-profile-update");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/speakers/:speakerId/request-profile-update",
  postHandler,
);
