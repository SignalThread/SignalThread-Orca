import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  createSpeakerMessage,
  listSpeakerMessages,
  SpeakerCommsError,
} from "@/src/server/services/speaker-comms";

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

  if (error instanceof SpeakerCommsError) {
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
    const messages = await listSpeakerMessages(eventId, speakerId, authResult.user);
    return NextResponse.json(messages);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/speakers/:speakerId/messages");
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
    const created = await createSpeakerMessage(eventId, speakerId, authResult.user, {
      body: body.body,
      sessionId: body.sessionId,
      speakerFileId: body.speakerFileId,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/speakers/:speakerId/messages");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/speakers/:speakerId/messages", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/speakers/:speakerId/messages", postHandler);
