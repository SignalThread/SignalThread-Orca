import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import { resolveRequestUser } from "@/lib/request-user";
import { NotificationServiceError, markRead } from "@/src/server/services/notifications";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string) {
  observeHandledRouteError(error);

  if (error instanceof NotificationServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function markNotificationReadRoute(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
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

    const { notificationId } = await params;
    const notification = await markRead({
      notificationId,
      userId: currentUserResult.user.id,
    });

    return NextResponse.json({ notification });
  } catch (error) {
    return toErrorResponse(error, "POST /api/notifications/:notificationId/read");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/notifications/:notificationId/read",
  markNotificationReadRoute,
);
