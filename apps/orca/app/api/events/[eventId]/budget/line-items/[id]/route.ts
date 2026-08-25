import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError, deleteLineItem, updateLineItem } from "@/src/server/services/budget";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../../_lib/route-auth";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof BudgetServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; id: string }> },
) {
  const { eventId, id } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const lineItem = await updateLineItem(eventId, id, body, auth.user);
    return NextResponse.json(lineItem);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/budget/line-items/:id");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; id: string }> },
) {
  const { eventId, id } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  try {
    const deleted = await deleteLineItem(eventId, id, auth.user);
    return NextResponse.json(deleted);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/budget/line-items/:id");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/budget/line-items/:id", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/budget/line-items/:id", deleteHandler);
