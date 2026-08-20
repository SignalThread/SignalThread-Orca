import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  getSpeakerOnsiteInfo,
  upsertSpeakerOnsiteInfo,
  SpeakerOnsiteError,
} from "@/src/server/services/speaker-onsite";

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

  if (error instanceof SpeakerOnsiteError) {
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
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const info = await getSpeakerOnsiteInfo(eventId, authResult.user);
    return NextResponse.json(info);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/speaker-onsite");
  }
}

async function putHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
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
    const info = await upsertSpeakerOnsiteInfo(eventId, authResult.user, {
      greenRoomLocation: body.greenRoomLocation,
      arrivalInstructions: body.arrivalInstructions,
      badgePickupInfo: body.badgePickupInfo,
      onsiteContact: body.onsiteContact,
      avRehearsalInfo: body.avRehearsalInfo,
    });
    return NextResponse.json(info);
  } catch (error) {
    return toErrorResponse(error, "PUT /api/events/:eventId/speaker-onsite");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/speaker-onsite", getHandler);
export const PUT = withApiRequestLogging("PUT /api/events/:eventId/speaker-onsite", putHandler);
