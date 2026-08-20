import { NextRequest, NextResponse } from "next/server";
import { EventAccessError, type EventAccessUser } from "@/lib/event-access";
import { observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { DirectoryServiceError } from "@/src/server/services/event-directory";

/** Resolve the request user or return a ready auth error response. */
export async function resolveDirectoryUser(
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

/** Map service/access errors to structured responses the Directory UI can handle. */
export function toDirectoryErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, code: error.reason }, { status: error.status });
  }
  if (error instanceof DirectoryServiceError) {
    return NextResponse.json({ error: error.message, code: error.code, details: error.details ?? null }, { status: error.status });
  }
  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
}

/** Parse a JSON body, returning {} for empty and a 400 response on malformed JSON. */
export async function readJsonBody(request: NextRequest): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  try {
    const raw = await request.text();
    if (!raw.trim()) return { body: {} };
    return { body: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return { response: NextResponse.json({ error: "Invalid JSON body", code: "BAD_REQUEST" }, { status: 400 }) };
  }
}
