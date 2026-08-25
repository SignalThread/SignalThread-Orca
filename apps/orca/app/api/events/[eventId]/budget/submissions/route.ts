import { NextRequest, NextResponse } from "next/server";
import {
  BudgetServiceError,
  createBudgetSubmission,
  listBudgetSubmissions,
} from "@/src/server/services/budget";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../_lib/route-auth";
import { shouldLogBudgetDebug } from "@/lib/logging/log-policy";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof BudgetServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function debugBudgetSubmitRouteLog(message: string, details: Record<string, unknown>): void {
  if (!shouldLogBudgetDebug()) return;
  console.info(message, details);
}

async function getHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  try {
    const submissions = await listBudgetSubmissions(eventId);
    return NextResponse.json(submissions);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/submissions");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const debugRequestId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  try {
    debugBudgetSubmitRouteLog("DEBUG BUDGET SUBMIT route:params:start", { debugRequestId });
    const { eventId } = await params;
    debugBudgetSubmitRouteLog("DEBUG BUDGET SUBMIT route:params:end", { debugRequestId, eventId });

    let body: Record<string, unknown>;
    try {
      debugBudgetSubmitRouteLog("DEBUG BUDGET SUBMIT route:request.json:start", { debugRequestId, eventId });
      body = (await request.json()) as Record<string, unknown>;
      debugBudgetSubmitRouteLog("DEBUG BUDGET SUBMIT route:request.json:end", { debugRequestId, eventId });
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    debugBudgetSubmitRouteLog("DEBUG BUDGET SUBMIT route:requireBudgetRouteAccess:start", { debugRequestId, eventId });
    const auth = await requireBudgetRouteAccess(request, eventId, "write");
    debugBudgetSubmitRouteLog("DEBUG BUDGET SUBMIT route:requireBudgetRouteAccess:end", {
      debugRequestId,
      eventId,
      ok: !("response" in auth),
    });
    if ("response" in auth) return auth.response;

    const budgetLineItemId =
      typeof body.budgetLineItemId === "string" ? body.budgetLineItemId.trim() : "";
    if (!budgetLineItemId || !UUID_RE.test(budgetLineItemId)) {
      return NextResponse.json({ error: "budgetLineItemId must be a valid UUID" }, { status: 400 });
    }

    const recipientUserIdsRaw = body.recipientUserIds;
    if (!Array.isArray(recipientUserIdsRaw) || recipientUserIdsRaw.length === 0) {
      return NextResponse.json({ error: "recipientUserIds must be a non-empty array of UUIDs" }, { status: 400 });
    }

    const recipientUserIds = recipientUserIdsRaw
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (recipientUserIds.length === 0 || recipientUserIds.some((value) => !UUID_RE.test(value))) {
      return NextResponse.json({ error: "recipientUserIds must be a non-empty array of UUIDs" }, { status: 400 });
    }

    const message =
      typeof body.message === "undefined" || body.message === null
        ? null
        : typeof body.message === "string"
          ? body.message
          : null;
    if (typeof body.message !== "undefined" && body.message !== null && typeof body.message !== "string") {
      return NextResponse.json({ error: "message must be a string or null" }, { status: 400 });
    }

    debugBudgetSubmitRouteLog("POST /api/events/:eventId/budget/submissions create", {
      eventId,
      actorUserId: auth.user.id,
      budgetLineItemId,
      recipientCount: recipientUserIds.length,
      debugRequestId,
    });

    debugBudgetSubmitRouteLog("DEBUG BUDGET SUBMIT route:createBudgetSubmission:start", {
      debugRequestId,
      eventId,
      actorUserId: auth.user.id,
      budgetLineItemId,
      recipientCount: recipientUserIds.length,
    });
    const submission = await createBudgetSubmission(eventId, {
      budgetLineItemId,
      recipientUserIds,
      message,
      actorUserId: auth.user.id,
      debugRequestId,
    });
    debugBudgetSubmitRouteLog("DEBUG BUDGET SUBMIT route:createBudgetSubmission:end", {
      debugRequestId,
      eventId,
      submissionId: submission.id,
    });
    return NextResponse.json(submission, { status: 201 });
  } catch (error) {
    if (!(error instanceof BudgetServiceError)) {
      console.error("budget.submission.route.unhandled", {
        debugRequestId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return toErrorResponse(error, "POST /api/events/:eventId/budget/submissions");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/submissions", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/budget/submissions", postHandler);
