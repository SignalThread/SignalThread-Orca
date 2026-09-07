import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import {
  listRegistrationAgendaEntries,
  RegistrationAgendaError,
  syncShowOpsAgendaToRegistration,
} from "@/lib/registration-agenda";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof EventAccessError || error instanceof RegistrationAgendaError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Registration agenda ShowOps sync failed", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveRequestUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error.reason, hint: auth.error.hint }, { status: auth.error.status });
  try {
    await assertEventAccessForUser(eventId, auth.user, "read");
    return NextResponse.json({ entries: await listRegistrationAgendaEntries(eventId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveRequestUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error.reason, hint: auth.error.hint }, { status: auth.error.status });
  try {
    await assertEventAccessForUser(eventId, auth.user, "write");
    const result = await syncShowOpsAgendaToRegistration(eventId, auth.user.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
