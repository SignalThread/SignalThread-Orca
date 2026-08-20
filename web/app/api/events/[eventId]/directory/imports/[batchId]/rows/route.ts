import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { listEventDirectoryImportRows } from "@/src/server/services/event-directory";
import { resolveDirectoryUser, toDirectoryErrorResponse } from "../../../_lib/route-helpers";

export const runtime = "nodejs";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string; batchId: string }> }) {
  const { eventId, batchId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;
  try {
    const rows = await listEventDirectoryImportRows({ eventId, batchId, user: auth.user });
    return NextResponse.json({ rows });
  } catch (error) {
    return toDirectoryErrorResponse(error, "GET /api/events/:eventId/directory/imports/:batchId/rows");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/directory/imports/:batchId/rows", getHandler);
