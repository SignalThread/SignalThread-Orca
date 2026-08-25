import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError, type EventAccessType, type EventAccessUser } from "@/lib/event-access";
import { observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";

export type EventRouteAccessResult =
  | { user: EventAccessUser; canEdit: boolean }
  | { response: NextResponse };

export async function requireEventRouteAccess(
  request: NextRequest,
  eventId: string,
  accessType: EventAccessType,
): Promise<EventRouteAccessResult> {
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return {
      response: NextResponse.json(
        {
          error: authResult.error.status === 403 ? "Forbidden" : "Unauthorized",
          reason: authResult.error.reason,
          hint: authResult.error.hint,
        },
        { status: authResult.error.status },
      ),
    };
  }

  try {
    const decision = await assertEventAccessForUser(eventId, authResult.user, accessType);
    return {
      user: {
        id: authResult.user.id,
        orgId: authResult.user.orgId,
        role: authResult.user.role,
      },
      canEdit: decision.canEdit,
    };
  } catch (error) {
    observeHandledRouteError(error);
    if (error instanceof EventAccessError) {
      return {
        response: NextResponse.json(
          { error: error.message, reason: error.reason },
          { status: error.status },
        ),
      };
    }
    throw error;
  }
}
