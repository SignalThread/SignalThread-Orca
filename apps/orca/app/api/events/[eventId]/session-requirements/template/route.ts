import { NextRequest, NextResponse } from "next/server";
import { getEventSessionRequirementTemplate, initializeEventSessionRequirementTemplate, SessionRequirementError, updateEventSessionRequirementTemplate } from "@/lib/session-requirements";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SessionRequirementError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  try {
    const auth = await requireEventRouteAccess(_request, eventId, "read");
    if ("response" in auth) return auth.response;

    const template = await getEventSessionRequirementTemplate(eventId);
    return NextResponse.json(template);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/session-requirements/template");
  }
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const template = await updateEventSessionRequirementTemplate(eventId, body, { id: auth.user.id });
    return NextResponse.json(template);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/session-requirements/template");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await initializeEventSessionRequirementTemplate(eventId), { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/session-requirements/template");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/session-requirements/template", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/session-requirements/template", postHandler);
export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/session-requirements/template", patchHandler);
