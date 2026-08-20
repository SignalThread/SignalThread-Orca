import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { removeEventDirectoryRole } from "@/src/server/services/event-directory";
import { resolveDirectoryUser, toDirectoryErrorResponse } from "../../../../_lib/route-helpers";

export const runtime = "nodejs";

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; personId: string; roleId: string }> },
) {
  const { eventId, personId, roleId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;
  try {
    const result = await removeEventDirectoryRole({ eventId, personId, roleId, user: auth.user });
    return NextResponse.json(result);
  } catch (error) {
    return toDirectoryErrorResponse(error, "DELETE /api/events/:eventId/directory/people/:personId/roles/:roleId");
  }
}

export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/directory/people/:personId/roles/:roleId",
  deleteHandler,
);
