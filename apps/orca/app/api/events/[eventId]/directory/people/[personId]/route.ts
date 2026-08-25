import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  deleteEventDirectoryPerson,
  getEventDirectoryPerson,
  updateEventDirectoryPerson,
} from "@/src/server/services/event-directory";
import { readJsonBody, resolveDirectoryUser, toDirectoryErrorResponse } from "../../_lib/route-helpers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string; personId: string }> };

async function getHandler(request: NextRequest, { params }: Ctx) {
  const { eventId, personId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;
  try {
    const person = await getEventDirectoryPerson({ eventId, personId, user: auth.user });
    return NextResponse.json({ person });
  } catch (error) {
    return toDirectoryErrorResponse(error, "GET /api/events/:eventId/directory/people/:personId");
  }
}

async function patchHandler(request: NextRequest, { params }: Ctx) {
  const { eventId, personId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const b = parsed.body;
  try {
    const person = await updateEventDirectoryPerson({
      eventId,
      personId,
      user: auth.user,
      input: {
        ...("firstName" in b ? { firstName: b.firstName as string | null } : {}),
        ...("lastName" in b ? { lastName: b.lastName as string | null } : {}),
        ...("displayName" in b ? { displayName: b.displayName as string | null } : {}),
        ...("email" in b ? { email: b.email as string | null } : {}),
        ...("phone" in b ? { phone: b.phone as string | null } : {}),
        ...("company" in b ? { company: b.company as string | null } : {}),
        ...("title" in b ? { title: b.title as string | null } : {}),
      },
    });
    return NextResponse.json({ person });
  } catch (error) {
    return toDirectoryErrorResponse(error, "PATCH /api/events/:eventId/directory/people/:personId");
  }
}

async function deleteHandler(request: NextRequest, { params }: Ctx) {
  const { eventId, personId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;
  try {
    const result = await deleteEventDirectoryPerson({ eventId, personId, user: auth.user });
    return NextResponse.json(result);
  } catch (error) {
    return toDirectoryErrorResponse(error, "DELETE /api/events/:eventId/directory/people/:personId");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/directory/people/:personId", getHandler);
export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/directory/people/:personId", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/directory/people/:personId", deleteHandler);
