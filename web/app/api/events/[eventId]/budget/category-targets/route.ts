import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError } from "@/src/server/services/budget";
import {
  listBudgetCategoryTargets,
  upsertBudgetCategoryTarget,
} from "@/src/server/services/budget-sessions-groups";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../_lib/route-auth";

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
    const targets = await listBudgetCategoryTargets(eventId);
    return NextResponse.json({ targets });
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/category-targets");
  }
}

async function putHandler(
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
    const target = await upsertBudgetCategoryTarget(
      eventId,
      {
        categoryKey: body.categoryKey,
        categoryLabel: body.categoryLabel,
        targetAmountCents: body.targetAmountCents,
      },
      auth.user,
    );
    return NextResponse.json({ target });
  } catch (error) {
    return toErrorResponse(error, "PUT /api/events/:eventId/budget/category-targets");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/category-targets", getHandler);
export const PUT = withApiRequestLogging("PUT /api/events/:eventId/budget/category-targets", putHandler);
