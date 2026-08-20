import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { addEventDirectoryRole } from "@/src/server/services/event-directory";
import { readJsonBody, resolveDirectoryUser, toDirectoryErrorResponse } from "../../../_lib/route-helpers";

export const runtime = "nodejs";

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string; personId: string }> }) {
  const { eventId, personId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;

  const role = parsed.body.role;
  if (typeof role !== "string") {
    return NextResponse.json({ error: "role is required", code: "BAD_REQUEST" }, { status: 400 });
  }
  try {
    const result = await addEventDirectoryRole({
      eventId,
      personId,
      role,
      sourceId: (parsed.body.sourceId as string | null) ?? null,
      user: auth.user,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return toDirectoryErrorResponse(error, "POST /api/events/:eventId/directory/people/:personId/roles");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/directory/people/:personId/roles", postHandler);
