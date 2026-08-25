import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError } from "@/src/server/services/budget";
import {
  assignGroupToLineItem,
  assignSessionToLineItem,
} from "@/src/server/services/budget-sessions-groups";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../../../_lib/route-auth";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  if (error instanceof BudgetServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Coerce a body value into an id-or-null link target, rejecting bad shapes. */
function coerceLinkId(value: unknown, field: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value === "string") return value;
  throw new BudgetServiceError(`${field} must be a string id or null`, 400);
}

/**
 * Assign or clear a budget row's canonical session (matrixRowId) and/or group
 * (groupId) link. Both writes go through the canonical service helpers, which
 * enforce write access and same-event / same-budget validation.
 */
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

  if (!("matrixRowId" in body) && !("groupId" in body)) {
    return NextResponse.json({ error: "matrixRowId or groupId is required" }, { status: 400 });
  }

  try {
    let lineItem = null;
    if ("matrixRowId" in body) {
      lineItem = await assignSessionToLineItem(eventId, id, coerceLinkId(body.matrixRowId, "matrixRowId"), auth.user);
    }
    if ("groupId" in body) {
      lineItem = await assignGroupToLineItem(eventId, id, coerceLinkId(body.groupId, "groupId"), auth.user);
    }
    return NextResponse.json(lineItem);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/budget/line-items/:id/links");
  }
}

export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/budget/line-items/:id/links",
  patchHandler,
);
