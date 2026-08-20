import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../../../../_lib/event-route-auth";
import {
  previewSessionAgenda,
  publishSessionAgenda,
  SessionShowFlowError,
} from "@/lib/session-show-flow";

export const runtime = "nodejs";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json(
    {
      error: message,
      ...(error instanceof SessionShowFlowError ? { code: error.code } : {}),
    },
    { status: error instanceof SessionShowFlowError ? error.status : 500 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string }> },
) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await previewSessionAgenda(eventId, sessionId));
  } catch (error) {
    return errorResponse(error, "Unable to preview the attendee agenda");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string }> },
) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as { expectedRevision?: unknown };
    return NextResponse.json(await publishSessionAgenda(eventId, sessionId, {
      expectedRevision: body.expectedRevision,
      actorUserId: auth.user.id,
    }));
  } catch (error) {
    return errorResponse(error, "Unable to publish the attendee agenda");
  }
}
