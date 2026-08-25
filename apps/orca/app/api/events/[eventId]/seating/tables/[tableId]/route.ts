import { NextRequest, NextResponse } from "next/server";
import { SeatingError, deleteSeatingTable, updateSeatingTable } from "@/lib/seating";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../../_lib/event-route-auth";
import { roomSetAndSeatingUnavailableResponse } from "@/lib/room-set/availability";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SeatingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; tableId: string }> },
) {
  const unavailableResponse = roomSetAndSeatingUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId, tableId } = await params;

  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const table = await updateSeatingTable(eventId, tableId, {
      name: body.name,
      capacity: body.capacity,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json(table);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/seating/tables/:tableId");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; tableId: string }> },
) {
  const unavailableResponse = roomSetAndSeatingUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const { eventId, tableId } = await params;

  try {
    const auth = await requireEventRouteAccess(request, eventId, "write");
    if ("response" in auth) return auth.response;

    await deleteSeatingTable(eventId, tableId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/seating/tables/:tableId");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/seating/tables/:tableId", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/seating/tables/:tableId", deleteHandler);
