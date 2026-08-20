import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { deleteRoom, RoomError, updateRoom } from "@/lib/rooms";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof RoomError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function updateRoomRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string; roomId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId, roomId } = await params;

  const currentUserResult = await resolveRequestUser(nextRequest);
  if ("error" in currentUserResult) {
    return NextResponse.json(
      {
        error: currentUserResult.error.status === 403 ? "Forbidden" : "Unauthorized",
        reason: currentUserResult.error.reason,
        hint: currentUserResult.error.hint,
      },
      { status: currentUserResult.error.status },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await nextRequest.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "write");
    const room = await updateRoom(eventId, roomId, body);
    return NextResponse.json(room);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/rooms/:roomId");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/rooms/:roomId", updateRoomRoute);

async function deleteRoomRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string; roomId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId, roomId } = await params;

  const currentUserResult = await resolveRequestUser(nextRequest);
  if ("error" in currentUserResult) {
    return NextResponse.json(
      {
        error: currentUserResult.error.status === 403 ? "Forbidden" : "Unauthorized",
        reason: currentUserResult.error.reason,
        hint: currentUserResult.error.hint,
      },
      { status: currentUserResult.error.status },
    );
  }

  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "write");
    await deleteRoom(eventId, roomId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/rooms/:roomId");
  }
}

export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/rooms/:roomId", deleteRoomRoute);
