import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { mergeEventDirectoryPeople } from "@/src/server/services/event-directory";
import { readJsonBody, resolveDirectoryUser, toDirectoryErrorResponse } from "../../../_lib/route-helpers";

export const runtime = "nodejs";

/** Merge the URL person (source) into the body `targetPersonId` (canonical survivor). */
async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string; personId: string }> }) {
  const { eventId, personId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;

  const targetPersonId = parsed.body.targetPersonId;
  if (typeof targetPersonId !== "string") {
    return NextResponse.json({ error: "targetPersonId is required", code: "BAD_REQUEST" }, { status: 400 });
  }
  try {
    const result = await mergeEventDirectoryPeople({
      eventId,
      sourcePersonId: personId,
      targetPersonId,
      user: auth.user,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toDirectoryErrorResponse(error, "POST /api/events/:eventId/directory/people/:personId/merge");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/directory/people/:personId/merge", postHandler);
