import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError } from "@/src/server/services/budget";
import { createOrFindBudgetGroup, listBudgetGroups } from "@/src/server/services/budget-sessions-groups";
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
    const groups = await listBudgetGroups(eventId);
    return NextResponse.json({ groups });
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/groups");
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
    const group = await createOrFindBudgetGroup(eventId, body.name, auth.user);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/budget/groups");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/groups", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/budget/groups", postHandler);
