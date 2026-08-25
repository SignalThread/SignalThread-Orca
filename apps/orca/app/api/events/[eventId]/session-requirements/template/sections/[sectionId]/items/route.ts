import { NextRequest, NextResponse } from "next/server";
import { createSessionRequirementItemForSection, SessionRequirementError } from "@/lib/session-requirements";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../../../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SessionRequirementError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sectionId: string }> },
) {
  const { eventId, sectionId } = await params;

  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const item = await createSessionRequirementItemForSection(eventId, sectionId, body);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return toErrorResponse(
      error,
      "POST /api/events/:eventId/session-requirements/template/sections/:sectionId/items",
    );
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/session-requirements/template/sections/:sectionId/items",
  postHandler,
);
