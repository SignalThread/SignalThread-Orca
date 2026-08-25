import { NextRequest, NextResponse } from "next/server";
import { type UserRole } from "@prisma/client";
import { observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { assertBudgetAccessForEvent, BudgetServiceError } from "@/src/server/services/budget";

export type BudgetRouteUser = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

export async function requireBudgetRouteAccess(
  request: NextRequest,
  eventId: string,
  accessType: "read" | "write",
): Promise<{ user: BudgetRouteUser } | { response: NextResponse }> {
  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return {
      response: NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      ),
    };
  }

  const user = {
    id: currentUserResult.user.id,
    orgId: currentUserResult.user.orgId,
    role: currentUserResult.user.role,
  };

  try {
    await assertBudgetAccessForEvent(eventId, user, accessType);
  } catch (error) {
    observeHandledRouteError(error);
    if (error instanceof BudgetServiceError) {
      return {
        response: NextResponse.json({ error: error.message }, { status: error.status }),
      };
    }
    throw error;
  }

  return { user };
}
