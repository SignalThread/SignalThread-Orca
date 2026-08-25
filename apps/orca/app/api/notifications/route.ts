import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import { resolveRequestUser } from "@/lib/request-user";
import { NotificationServiceError, listNotificationsForUser } from "@/src/server/services/notifications";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string) {
  observeHandledRouteError(error);

  if (error instanceof NotificationServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function listNotificationsRoute(request: Request) {
  const nextRequest = request as NextRequest;
  try {
    const currentUserResult = await resolveRequestUser(nextRequest);
    if ("error" in currentUserResult) {
      return NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      );
    }
    setRequestUserId(currentUserResult.user.id);

    const unreadOnlyRaw = nextRequest.nextUrl.searchParams.get("unreadOnly");
    const limitRaw = nextRequest.nextUrl.searchParams.get("limit");
    const unreadOnly = unreadOnlyRaw === "1" || unreadOnlyRaw === "true";
    const limit = limitRaw ? Number(limitRaw) : 20;

    if (!Number.isFinite(limit) || limit < 1) {
      return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
    }

    const notifications = await listNotificationsForUser({
      userId: currentUserResult.user.id,
      unreadOnly,
      limit,
    });

    return NextResponse.json({
      notifications,
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/notifications");
  }
}

const getWithLogging = withApiRequestLogging("GET /api/notifications", listNotificationsRoute);

export async function GET(request: Request) {
  return getWithLogging(request, undefined);
}
