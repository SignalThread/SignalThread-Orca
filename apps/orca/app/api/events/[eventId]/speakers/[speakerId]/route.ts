import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { deleteSpeaker, getSpeaker, SpeakerServiceError, updateSpeaker } from "@/src/server/services/speakers";

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
    const speaker = await getSpeaker(eventId, speakerId, authResult.user);
    return NextResponse.json(speaker);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/speakers/:speakerId");
  }
}

async function patchHandler(
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
    const speaker = await updateSpeaker(eventId, speakerId, authResult.user, body);
    return NextResponse.json(speaker);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/speakers/:speakerId");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; speakerId: string }> },
) {
  const { eventId, speakerId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const deleted = await deleteSpeaker(eventId, speakerId, authResult.user);
    return NextResponse.json(deleted);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/speakers/:speakerId");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/speakers/:speakerId", getHandler);
export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/speakers/:speakerId", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/speakers/:speakerId", deleteHandler);
