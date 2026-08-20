import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  createDocumentCategoryForEvent,
  DocumentServiceError,
  ensureDefaultDocumentCategories,
  listDocumentCategoriesForEvent,
} from "@/src/server/services/documents";
import { requireEventRouteAccess } from "../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string) {
  observeHandledRouteError(error);

  if (error instanceof DocumentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  try {
    const auth = await requireEventRouteAccess(request, eventId, "read");
    if ("response" in auth) return auth.response;

    const categories = await listDocumentCategoriesForEvent(eventId);

    if (process.env.NODE_ENV !== "production") {
      console.info(`[docs] categories for event ${eventId}: ${categories.length}`);
    }

    return NextResponse.json(categories);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/document-categories");
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
    if (body.initializeDefaults === true) {
      await ensureDefaultDocumentCategories(eventId);
      return NextResponse.json(await listDocumentCategoriesForEvent(eventId));
    }
    const category = await createDocumentCategoryForEvent(eventId, body, { id: auth.user.id });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/document-categories");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/document-categories", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/document-categories", postHandler);
