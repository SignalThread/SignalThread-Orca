import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { createRoom, listRooms, RoomError } from "@/lib/rooms";

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

async function listRoomsRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId } = await params;

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
    await assertEventAccessForUser(eventId, currentUserResult.user, "read");
    const rooms = await listRooms(eventId);
    return NextResponse.json(rooms);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/rooms");
  }
}

async function createRoomRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId } = await params;

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
    const room = await createRoom(eventId, body);
    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/rooms");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/rooms", listRoomsRoute);
export const POST = withApiRequestLogging("POST /api/events/:eventId/rooms", createRoomRoute);
