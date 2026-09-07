import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { recordRegistrationAgendaPdfReference } from "@/lib/registration-agenda";
import { resolveRequestUser } from "@/lib/request-user";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveRequestUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error.reason }, { status: auth.error.status });
  try {
    await assertEventAccessForUser(eventId, auth.user, "write");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "PDF must be between 1 byte and 10 MB" }, { status: 400 });
    const signature = new TextDecoder().decode((await file.slice(0, 5).arrayBuffer()));
    if (!file.name.toLowerCase().endsWith(".pdf") || signature !== "%PDF-") return NextResponse.json({ error: "Upload a valid PDF file" }, { status: 400 });
    const reference = await recordRegistrationAgendaPdfReference({ eventId, actorUserId: auth.user.id, fileName: file.name, mimeType: file.type || "application/pdf", sizeBytes: file.size });
    return NextResponse.json({ id: reference.id, status: reference.status, extractionPerformed: false }, { status: 201 });
  } catch (error) {
    if (error instanceof EventAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Registration agenda PDF reference failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
