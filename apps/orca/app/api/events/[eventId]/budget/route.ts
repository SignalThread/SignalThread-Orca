import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { getRequestContext, setRequestUserId } from "@/lib/observability/request-context";
import { assertBudgetAccessForEvent, BudgetServiceError, getBudgetSnapshot } from "@/src/server/services/budget";
import { resolveRequestUser } from "@/lib/request-user";
import { shouldLogBudgetDebug } from "@/lib/logging/log-policy";

const activeBudgetRequestsByEvent = new Map<string, number>();

function queryFlag(value: string | null, defaultValue: boolean): boolean {
  if (value === null) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof BudgetServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function debugBudgetLoadRouteLog(message: string, details: Record<string, unknown>): void {
  if (!shouldLogBudgetDebug()) return;
  console.info(message, details);
}

async function getBudgetRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const requestId = getRequestContext()?.requestId ?? null;
  const nextRequest = request as NextRequest;
  const debugRequestId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const requestStartedAt = Date.now();
  let eventIdForCleanup = "";
  let duplicateLoadDetected = false;
  try {
    debugBudgetLoadRouteLog("DEBUG BUDGET LOAD route:params:start", { debugRequestId, requestId });
    const { eventId } = await params;
    eventIdForCleanup = eventId;
    debugBudgetLoadRouteLog("DEBUG BUDGET LOAD route:params:end", { debugRequestId, eventId, requestId });
    const source = nextRequest.nextUrl.searchParams.get("source")?.trim() || "unknown";
    const includeSubmissions = queryFlag(nextRequest.nextUrl.searchParams.get("includeSubmissions"), true);
    const includeSubmissionDetails = queryFlag(nextRequest.nextUrl.searchParams.get("includeSubmissionDetails"), true);
    const includeBudgetFiles = queryFlag(nextRequest.nextUrl.searchParams.get("includeBudgetFiles"), true);
    // Light snapshot opt-in: when the client fetches rows separately (server-paged
    // grid) it can request the shell without the full line-item array. Defaults on
    // so existing callers keep the full snapshot.
    const includeLineItems = queryFlag(nextRequest.nextUrl.searchParams.get("includeLineItems"), true);
    const activeCount = (activeBudgetRequestsByEvent.get(eventId) ?? 0) + 1;
    activeBudgetRequestsByEvent.set(eventId, activeCount);
    duplicateLoadDetected = activeCount > 1;
    debugBudgetLoadRouteLog("DEBUG BUDGET LOAD route:request:start", {
      debugRequestId,
      eventId,
      source,
      activeCount,
      duplicateLoadDetected,
      includeSubmissions,
      includeSubmissionDetails,
      includeBudgetFiles,
      requestId,
    });
    debugBudgetLoadRouteLog("DEBUG BUDGET LOAD route:resolveRequestUser:start", { debugRequestId, eventId, requestId });
    const currentUserResult = await resolveRequestUser(nextRequest);
    debugBudgetLoadRouteLog("DEBUG BUDGET LOAD route:resolveRequestUser:end", {
      debugRequestId,
      eventId,
      ok: !("error" in currentUserResult),
      requestId,
    });
    if ("error" in currentUserResult) {
      return NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      );
    }
    setRequestUserId(currentUserResult.user.id);
    await assertBudgetAccessForEvent(
      eventId,
      {
        id: currentUserResult.user.id,
        orgId: currentUserResult.user.orgId,
        role: currentUserResult.user.role,
      },
      "read",
    );

    debugBudgetLoadRouteLog("DEBUG BUDGET LOAD route:getBudgetSnapshot:start", {
      debugRequestId,
      eventId,
      currentUserId: currentUserResult.user.id,
      requestId,
    });
    const snapshot = await getBudgetSnapshot(eventId, {
      currentUserId: currentUserResult.user.id,
      includeActivity: false,
      includeRecipients: true,
      includeSubmissions,
      includeSubmissionDetails,
      includeBudgetFiles,
      includeLineItems,
      // The budget grid never renders the session-requirement link, so skip that
      // heavy nested join to lighten the first-render line-item payload.
      includeLineItemRequirementLinks: false,
    });
    debugBudgetLoadRouteLog("DEBUG BUDGET LOAD route:getBudgetSnapshot:end", {
      debugRequestId,
      eventId,
      lineItemCount: snapshot.lineItemCount,
      submissionCount: snapshot.submissions.length,
      submissionRecipientCount: snapshot.submissionRecipients.length,
      budgetFileHistoryCount: snapshot.budgetFiles.history.length,
      hasLatestBudgetFile: Boolean(snapshot.budgetFiles.latestFile),
      requestId,
    });
    debugBudgetLoadRouteLog("DEBUG BUDGET LOAD route:request:end", {
      debugRequestId,
      eventId,
      duplicateLoadDetected,
      durationMs: Date.now() - requestStartedAt,
      requestId,
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget");
  } finally {
    if (eventIdForCleanup) {
      const current = activeBudgetRequestsByEvent.get(eventIdForCleanup) ?? 0;
      if (current <= 1) {
        activeBudgetRequestsByEvent.delete(eventIdForCleanup);
      } else {
        activeBudgetRequestsByEvent.set(eventIdForCleanup, current - 1);
      }
    }
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget", getBudgetRoute);
