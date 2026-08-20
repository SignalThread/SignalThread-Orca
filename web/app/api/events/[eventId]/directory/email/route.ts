import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { sendEventDirectoryEmail } from "@/src/server/services/event-directory";
import { readJsonBody, resolveDirectoryUser, toDirectoryErrorResponse } from "../_lib/route-helpers";

export const runtime = "nodejs";

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;

  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;

  try {
    const result = await sendEventDirectoryEmail({
      eventId,
      user: auth.user,
      personIds: parsed.body.personIds,
      subject: parsed.body.subject,
      body: parsed.body.body,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toDirectoryErrorResponse(error, "POST /api/events/:eventId/directory/email");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/directory/email", postHandler);
