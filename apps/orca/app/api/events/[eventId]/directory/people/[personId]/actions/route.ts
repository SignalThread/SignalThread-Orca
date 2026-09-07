import { NextRequest, NextResponse } from "next/server";
import { EventAccessError } from "@/lib/event-access";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { DirectoryActionError, getEventDirectoryActionContext, runEventDirectoryAction } from "@/src/server/services/event-directory-actions";
import { readJsonBody, resolveDirectoryUser } from "../../../_lib/route-helpers";

type Ctx = { params: Promise<{ eventId: string; personId: string }> };

function failure(error: unknown, context: string) {
  if (error instanceof DirectoryActionError || error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, code: "code" in error ? error.code : error.reason }, { status: error.status });
  }
  console.error(context, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(request: NextRequest, { params }: Ctx) {
  const { eventId, personId } = await params;
  const auth = await resolveDirectoryUser(request); if ("response" in auth) return auth.response;
  try { return NextResponse.json(await getEventDirectoryActionContext({ eventId, personId, user: auth.user })); }
  catch (error) { return failure(error, "Directory action context failed"); }
}

async function postHandler(request: NextRequest, { params }: Ctx) {
  const { eventId, personId } = await params;
  const auth = await resolveDirectoryUser(request); if ("response" in auth) return auth.response;
  const parsed = await readJsonBody(request); if ("response" in parsed) return parsed.response;
  try { return NextResponse.json(await runEventDirectoryAction({ eventId, personId, user: auth.user, action: parsed.body.action, hotelName: parsed.body.hotelName, roomNumber: parsed.body.roomNumber })); }
  catch (error) { return failure(error, "Directory action failed"); }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/directory/people/:personId/actions", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/directory/people/:personId/actions", postHandler);
