import { NextRequest, NextResponse } from "next/server";
import { EventAccessError } from "@/lib/event-access";
import { EventTerminologyError, getEventTerminology, updateEventTerminology } from "@/lib/orca-terminology";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

function errorResponse(error: unknown): NextResponse {
  if (error instanceof EventAccessError || error instanceof EventTerminologyError) {
    return NextResponse.json({ error: error.message, code: "code" in error ? error.code : error.reason }, { status: error.status, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json({ error: "Unable to manage event terminology", code: "EVENT_TERMINOLOGY_ERROR" }, { status: 500, headers: NO_STORE_HEADERS });
}

async function requestUser(request: NextRequest) {
  const result = await resolveRequestUser(request);
  if ("error" in result) {
    return NextResponse.json({ error: result.error.status === 403 ? "Forbidden" : "Unauthorized", code: result.error.reason }, { status: result.error.status, headers: NO_STORE_HEADERS });
  }
  return result.user;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await requestUser(request);
  if (user instanceof NextResponse) return user;
  const { eventId } = await params;
  try {
    const { assertEventAccessForUser } = await import("@/lib/event-access");
    await assertEventAccessForUser(eventId, user, "read");
    return NextResponse.json(await getEventTerminology(eventId), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await requestUser(request);
  if (user instanceof NextResponse) return user;
  const { eventId } = await params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const allowed = new Set(["agenda", "runOfShow", "matrix", "showFlow", "expectedUpdatedAt"]);
    const unknown = Object.keys(body).find((key) => !allowed.has(key));
    if (unknown) throw new EventTerminologyError(`Unknown field: ${unknown}`, 400, "UNKNOWN_FIELD");
    for (const key of ["agenda", "runOfShow", "matrix", "showFlow"]) {
      if (!(key in body)) throw new EventTerminologyError(`${key} is required`, 400, "MISSING_FIELD");
    }
    return NextResponse.json(await updateEventTerminology(eventId, user, body), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
