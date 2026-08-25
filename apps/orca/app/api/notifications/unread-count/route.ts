import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import { resolveRequestUser } from "@/lib/request-user";
import { getUnreadCount } from "@/src/server/services/notifications";

export const runtime = "nodejs";

async function getUnreadCountRoute(request: Request) {
  const nextRequest = request as NextRequest;
  let resolvedUserId: string | null = null;
  try {
    const currentUserResult = await resolveRequestUser(nextRequest);
    if ("error" in currentUserResult) {
      return NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      );
    }
    resolvedUserId = currentUserResult.user.id;
    setRequestUserId(resolvedUserId);

    const unreadCount = await getUnreadCount(resolvedUserId);
    return NextResponse.json({ unreadCount });
  } catch (error) {
    observeHandledRouteError(error);
    console.error("GET /api/notifications/unread-count degraded", {
      userId: resolvedUserId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ unreadCount: 0 });
  }
}

const getWithLogging = withApiRequestLogging("GET /api/notifications/unread-count", getUnreadCountRoute);

export async function GET(request: Request) {
  return getWithLogging(request, undefined);
}
