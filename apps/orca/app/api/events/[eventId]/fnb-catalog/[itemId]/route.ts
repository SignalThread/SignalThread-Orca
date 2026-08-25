import { NextRequest, NextResponse } from "next/server";
import { archiveFnbCatalogItem, FnbCatalogError, updateFnbCatalogItem } from "@/lib/fnb-catalog";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";

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
  { params }: { params: Promise<{ eventId: string; itemId: string }> },
) {
  const { eventId, itemId } = await params;

  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const item = await updateFnbCatalogItem(eventId, itemId, body);
    return NextResponse.json(item);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/fnb-catalog/:itemId");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; itemId: string }> },
) {
  const { eventId, itemId } = await params;

  try {
    const auth = await requireEventRouteAccess(request, eventId, "write");
    if ("response" in auth) return auth.response;

    const item = await archiveFnbCatalogItem(eventId, itemId);
    return NextResponse.json(item);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/fnb-catalog/:itemId");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/fnb-catalog/:itemId", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/fnb-catalog/:itemId", deleteHandler);
