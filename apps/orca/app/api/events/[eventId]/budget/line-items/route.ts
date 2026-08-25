import { NextRequest, NextResponse } from "next/server";
import {
  BudgetServiceError,
  addLineItem,
  deleteLineItems,
  getPagedBudgetLineItems,
} from "@/src/server/services/budget";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../_lib/route-auth";
import { parsePagedLineItemsQuery } from "../_lib/paged-query";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof BudgetServiceError) {
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

  const auth = await requireBudgetRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;

  try {
    const query = parsePagedLineItemsQuery(request.nextUrl.searchParams);
    const result = await getPagedBudgetLineItems(eventId, query);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/line-items");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const lineItem = await addLineItem(eventId, body, auth.user);
    return NextResponse.json(lineItem, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/budget/line-items");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await deleteLineItems(eventId, body.ids, auth.user);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/budget/line-items");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/line-items", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/budget/line-items", postHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/budget/line-items", deleteHandler);
