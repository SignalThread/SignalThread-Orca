import { NextRequest, NextResponse } from "next/server";
import { archiveFnbSourceMenu, deleteFnbSourceMenu, FnbCatalogError, updateFnbSourceMenuLifecycle } from "@/lib/fnb-catalog";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof FnbCatalogError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sourceMenuId: string }> },
) {
  const { eventId, sourceMenuId } = await params;

  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  try {
    const sourceMenu = action === "archive"
      ? await archiveFnbSourceMenu(eventId, sourceMenuId)
      : await updateFnbSourceMenuLifecycle(eventId, sourceMenuId, body, auth.user.id);
    return NextResponse.json(sourceMenu);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/fnb-catalog/source-menus/:sourceMenuId");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sourceMenuId: string }> },
) {
  const { eventId, sourceMenuId } = await params;

  try {
    const auth = await requireEventRouteAccess(request, eventId, "write");
    if ("response" in auth) return auth.response;

    const result = await deleteFnbSourceMenu(eventId, sourceMenuId);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/fnb-catalog/source-menus/:sourceMenuId");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/fnb-catalog/source-menus/:sourceMenuId", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/fnb-catalog/source-menus/:sourceMenuId", deleteHandler);
