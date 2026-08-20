import { NextRequest, NextResponse } from "next/server";
import { createFnbCatalogItem, FnbCatalogError, getFnbCatalogPayload } from "@/lib/fnb-catalog";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof FnbCatalogError) {
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

    const payload = await getFnbCatalogPayload(eventId);
    console.info("[fnb-catalog] catalog/source menu refetch", {
      eventId,
      itemCount: payload.items.length,
      sourceMenuCount: payload.sourceMenus.length,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/fnb-catalog");
  }
}

async function postHandler(
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
    const item = await createFnbCatalogItem(eventId, body);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/fnb-catalog");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/fnb-catalog", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/fnb-catalog", postHandler);
