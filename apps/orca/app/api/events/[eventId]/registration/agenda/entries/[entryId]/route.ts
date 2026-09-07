import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { RegistrationAgendaError, updateRegistrationAgendaEntry } from "@/lib/registration-agenda";
import { resolveRequestUser } from "@/lib/request-user";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; entryId: string }> }) {
  const { eventId, entryId } = await params;
  const auth = await resolveRequestUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error.reason }, { status: auth.error.status });
  try {
    await assertEventAccessForUser(eventId, auth.user, "write");
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "JSON body must be an object" }, { status: 400 });
    const entry = await updateRegistrationAgendaEntry(eventId, entryId, auth.user.id, body as Record<string, unknown>);
    return NextResponse.json({ id: entry.id, publicationStatus: entry.publicationStatus });
  } catch (error) {
    if (error instanceof EventAccessError || error instanceof RegistrationAgendaError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Registration agenda entry update failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
