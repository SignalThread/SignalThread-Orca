import { NextRequest, NextResponse } from "next/server";
import { EventAccessError, type EventAccessUser } from "@/lib/event-access";
import { observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { AttendeeServiceError } from "@/src/server/services/event-attendee";
import { DirectoryServiceError } from "@/src/server/services/event-directory";

export async function resolveAttendeeUser(
  request: NextRequest,
): Promise<{ user: EventAccessUser } | { response: NextResponse }> {
  const result = await resolveRequestUser(request);
  if ("error" in result) {
    return {
      response: NextResponse.json(
        { error: result.error.status === 403 ? "Forbidden" : "Unauthorized", reason: result.error.reason, hint: result.error.hint },
        { status: result.error.status },
      ),
    };
  }
  return { user: { id: result.user.id, orgId: result.user.orgId, role: result.user.role } };
}

export function toAttendeeErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, code: error.reason }, { status: error.status });
  }
  if (error instanceof AttendeeServiceError || error instanceof DirectoryServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
}

export async function readJsonBody(
  request: NextRequest,
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  try {
    const raw = await request.text();
    if (!raw.trim()) return { body: {} };
    return { body: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return { response: NextResponse.json({ error: "Invalid JSON body", code: "BAD_REQUEST" }, { status: 400 }) };
  }
}
