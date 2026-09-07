import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { createManualRegistrationAgendaEntry, listRegistrationAgendaEntries, RegistrationAgendaError } from "@/lib/registration-agenda";
import { resolveRequestUser } from "@/lib/request-user";

function failure(error: unknown) {
  if (error instanceof EventAccessError || error instanceof RegistrationAgendaError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Registration agenda entries route failed", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveRequestUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error.reason }, { status: auth.error.status });
  try {
    await assertEventAccessForUser(eventId, auth.user, "read");
    return NextResponse.json({ entries: await listRegistrationAgendaEntries(eventId) });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveRequestUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error.reason }, { status: auth.error.status });
  try {
    await assertEventAccessForUser(eventId, auth.user, "write");
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "JSON body must be an object" }, { status: 400 });
    const entry = await createManualRegistrationAgendaEntry(eventId, auth.user.id, body as Record<string, unknown>);
    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) { return failure(error); }
}
